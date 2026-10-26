import Decimal from "decimal.js";
import { FORMULA_VERSION, type QuoteInput, type QuoteResult, type StudioSettings } from "./types";

const MAX_WEIGHT_OR_RATE = 1_000_000;
const MAX_HOURS = 100_000;
const MAX_MONETARY_AMOUNT = Number.MAX_SAFE_INTEGER / 100;

export type ValidationErrors = Record<string, string>;

function validNumber(value: unknown, maximum: number, integer = false): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum && (!integer || Number.isInteger(value));
}

/** Validate the one-keychain input without silently coercing or clamping values. */
export function validateQuoteInput(input: QuoteInput): ValidationErrors {
  const errors: ValidationErrors = {};
  if (input.printingType !== "single" && input.printingType !== "multi") {
    errors.printingType = "Choose single-color or multicolor printing.";
  }
  if (!Array.isArray(input.colors) || input.colors.length < 1 || input.colors.length > 64) {
    errors.colors = "Add between 1 and 64 filament colors.";
  } else {
    if (input.printingType === "single" && input.colors.length !== 1) {
      errors.colors = "Single-color printing requires exactly one color.";
    } else if (input.printingType === "multi" && input.colors.length < 2) {
      errors.colors = "Multicolor printing requires at least two colors.";
    }
    input.colors.forEach((color, index) => {
      if (!color || typeof color.name !== "string" || color.name.length > 80) {
        errors[`colors.${index}.name`] = "Color names can contain up to 80 characters.";
      }
      if (!color || !validNumber(color.grams, MAX_WEIGHT_OR_RATE)) {
        errors[`colors.${index}.grams`] = "Enter a weight from 0 to 1,000,000 grams.";
      }
    });
  }
  for (const field of ["printingHours", "changingHours"] as const) {
    if (!validNumber(input[field], MAX_HOURS, true)) errors[field] = "Enter whole hours from 0 to 100,000.";
  }
  for (const field of ["printingMinutes", "changingMinutes"] as const) {
    if (!validNumber(input[field], 59, true)) errors[field] = "Enter whole minutes from 0 to 59.";
  }
  for (const field of ["flushGrams", "supportGrams", "brimGrams", "primeTowerGrams"] as const) {
    if (!validNumber(input[field], MAX_WEIGHT_OR_RATE)) errors[field] = "Enter a weight from 0 to 1,000,000 grams.";
  }
  if (!["existing", "simple", "complex"].includes(input.designType)) {
    errors.designType = "Choose an existing, simple custom, or complex custom design.";
  }
  return errors;
}

export function validateSettings(settings: StudioSettings): ValidationErrors {
  const errors: ValidationErrors = {};
  for (const field of ["filamentRate", "printingHourlyRate", "changingHourlyRate", "keyringCost", "packagingCost", "laborCost"] as const) {
    if (!validNumber(settings[field], MAX_WEIGHT_OR_RATE)) errors[field] = "Enter an amount from RM 0 to RM 1,000,000.";
  }
  if (!validNumber(settings.markupPercent, 10_000)) errors.markupPercent = "Enter a markup from 0 to 10,000%.";
  if (!validNumber(settings.roundingIncrement, MAX_WEIGHT_OR_RATE) || settings.roundingIncrement === 0) {
    errors.roundingIncrement = "Enter a rounding increment greater than 0 and no more than RM 1,000,000.";
  }
  return errors;
}

/*
 * A minute is 1/60 hour, which is recurring in decimal notation. Fractions keep
 * every intermediate exact, including custom hourly rates, until presentation.
 * Decimal.js applies the final upward rounding after the complete formula.
 */
interface Fraction { numerator: bigint; denominator: bigint }

function greatestCommonDivisor(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function fraction(numerator: bigint, denominator = 1n): Fraction {
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function decimal(value: number): Fraction {
  const [numerator, denominator] = new Decimal(value).toFraction();
  return fraction(BigInt(numerator.toFixed(0)), BigInt(denominator.toFixed(0)));
}

function add(...values: Fraction[]): Fraction {
  return values.reduce((a, b) => fraction(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator), fraction(0n));
}

function multiply(a: Fraction, b: Fraction): Fraction {
  return fraction(a.numerator * b.numerator, a.denominator * b.denominator);
}

function divide(a: Fraction, b: Fraction): Fraction {
  return fraction(a.numerator * b.denominator, a.denominator * b.numerator);
}

function asNumber(value: Fraction): number {
  return new Decimal(value.numerator.toString()).div(value.denominator.toString()).toNumber();
}

function roundUp(value: Fraction, increment: Fraction): Fraction {
  const ratio = divide(value, increment);
  // The precision includes every source digit, so a tiny positive remainder
  // cannot disappear at an exact increment boundary before ceil is applied.
  const precision = Math.max(40, ratio.numerator.toString().length + ratio.denominator.toString().length + 4);
  const ExactDecimal = Decimal.clone({ precision });
  const steps = new ExactDecimal(ratio.numerator.toString()).div(ratio.denominator.toString()).ceil();
  return multiply(fraction(BigInt(steps.toFixed(0))), increment);
}

/** Calculate the finalized price for ONE keychain, in Malaysian ringgit (RM). */
export function calculateQuote(input: QuoteInput, settings: StudioSettings): QuoteResult {
  const errors = { ...validateQuoteInput(input), ...validateSettings(settings) };
  if (Object.keys(errors).length > 0) throw new Error(Object.values(errors)[0]);

  const modelGrams = add(...input.colors.map((color) => decimal(color.grams)));
  const additionalGrams = add(decimal(input.flushGrams), decimal(input.supportGrams), decimal(input.brimGrams), decimal(input.primeTowerGrams));
  const totalGrams = add(modelGrams, additionalGrams);
  const filamentRate = decimal(settings.filamentRate);
  const modelFilamentCost = multiply(modelGrams, filamentRate);
  const additionalFilamentCost = multiply(additionalGrams, filamentRate);
  const filamentCost = add(modelFilamentCost, additionalFilamentCost);

  const printingMinutes = input.printingHours * 60 + input.printingMinutes;
  const changingMinutes = input.changingHours * 60 + input.changingMinutes;
  const printingTime = fraction(BigInt(printingMinutes), 60n);
  const changingTime = fraction(BigInt(changingMinutes), 60n);
  const printingCost = multiply(printingTime, decimal(settings.printingHourlyRate));
  const changingCost = multiply(changingTime, decimal(settings.changingHourlyRate));
  const machineCost = add(printingCost, changingCost);
  const fixedCost = add(decimal(settings.keyringCost), decimal(settings.packagingCost), decimal(settings.laborCost));
  const productionCost = add(filamentCost, machineCost, fixedCost);
  const profit = multiply(productionCost, divide(decimal(settings.markupPercent), fraction(100n)));
  const priceBeforeDesign = add(productionCost, profit);
  const designingFee = decimal(input.designType === "complex" ? 10 : input.designType === "simple" ? 5 : 0);
  const unroundedPrice = add(priceBeforeDesign, designingFee);
  const finalPrice = roundUp(unroundedPrice, decimal(settings.roundingIncrement));
  const roundingAdjustment = add(finalPrice, fraction(-unroundedPrice.numerator, unroundedPrice.denominator));

  const result: QuoteResult = {
    formulaVersion: FORMULA_VERSION,
    modelGrams: asNumber(modelGrams),
    additionalGrams: asNumber(additionalGrams),
    totalGrams: asNumber(totalGrams),
    modelFilamentCost: asNumber(modelFilamentCost),
    additionalFilamentCost: asNumber(additionalFilamentCost),
    filamentCost: asNumber(filamentCost),
    printingTimeHours: asNumber(printingTime),
    changingTimeHours: asNumber(changingTime),
    totalMachineMinutes: printingMinutes + changingMinutes,
    printingCost: asNumber(printingCost),
    changingCost: asNumber(changingCost),
    machineCost: asNumber(machineCost),
    fixedCost: asNumber(fixedCost),
    productionCost: asNumber(productionCost),
    profit: asNumber(profit),
    priceBeforeDesign: asNumber(priceBeforeDesign),
    designingFee: asNumber(designingFee),
    unroundedPrice: asNumber(unroundedPrice),
    finalPrice: asNumber(finalPrice),
    roundingAdjustment: asNumber(roundingAdjustment),
  };
  const amounts = Object.values(result).filter((value): value is number => typeof value === "number");
  if (amounts.some((value) => !Number.isFinite(value) || value < 0 || value > MAX_MONETARY_AMOUNT)) {
    throw new Error("This calculation exceeds the safe pricing range. Reduce the weights, hours, or rates.");
  }
  return result;
}
