import { describe, expect, it } from "vitest";
import { calculateQuote, validateQuoteInput, validateSettings } from "./pricing";
import { createQuoteInput, DEFAULT_SETTINGS, type QuoteInput, type StudioSettings } from "./types";

function input(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return { ...createQuoteInput(), ...overrides };
}

function settings(overrides: Partial<StudioSettings> = {}): StudioSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

const ZERO_COSTS: StudioSettings = {
  filamentRate: 0,
  printingHourlyRate: 0,
  changingHourlyRate: 0,
  keyringCost: 0,
  packagingCost: 0,
  laborCost: 0,
  markupPercent: 0,
  roundingIncrement: 0.5,
};

describe("finalized one-keychain pricing", () => {
  it("matches the official 20 g / 2-hour / simple-design example at RM 18.50", () => {
    const result = calculateQuote(input({
      colors: [{ name: "Black", grams: 20 }],
      flushGrams: 2,
      supportGrams: 1,
      brimGrams: 1,
      printingHours: 2,
      designType: "simple",
    }), settings());

    expect(result.modelGrams).toBe(20);
    expect(result.additionalGrams).toBe(4);
    expect(result.totalGrams).toBe(24);
    expect(result.filamentCost).toBe(2.04);
    expect(result.printingCost).toBe(6);
    expect(result.fixedCost).toBe(0.68);
    expect(result.productionCost).toBe(8.72);
    expect(result.profit).toBe(4.36);
    expect(result.priceBeforeDesign).toBe(13.08);
    expect(result.designingFee).toBe(5);
    expect(result.unroundedPrice).toBe(18.08);
    expect(result.finalPrice).toBe(18.5);
    expect(result.roundingAdjustment).toBe(0.42);
  });

  it("sums every multicolor weight and each additional filament category", () => {
    const result = calculateQuote(input({
      printingType: "multi",
      colors: [{ name: "White", grams: 7.5 }, { name: "Blue", grams: 12.5 }, { name: "", grams: 0.1 }],
      flushGrams: 1.5,
      supportGrams: 0.25,
      brimGrams: 0.5,
      primeTowerGrams: 0.75,
    }), settings());
    expect(result.modelGrams).toBe(20.1);
    expect(result.additionalGrams).toBe(3);
    expect(result.totalGrams).toBe(23.1);
    expect(result.modelFilamentCost).toBe(1.7085);
    expect(result.additionalFilamentCost).toBe(0.255);
    expect(result.filamentCost).toBe(1.9635);
  });

  it("preserves printing and filament-changing costs in historical v1 snapshots", () => {
    const result = calculateQuote(input({
      printingHours: 1, printingMinutes: 30,
      changingHours: 0, changingMinutes: 20,
    }), settings({ changingHourlyRate: 6 }), "keychain-v1");
    expect(result.formulaVersion).toBe("keychain-v1");
    expect(result.printingTimeHours).toBe(1.5);
    expect(result.changingTimeHours).toBeCloseTo(1 / 3, 14);
    expect(result.totalMachineMinutes).toBe(110);
    expect(result.printingCost).toBe(4.5);
    expect(result.changingCost).toBe(2);
    expect(result.machineCost).toBe(6.5);
  });

  it("charges only printing time for new calculations even when legacy changing inputs remain", () => {
    const originalInput = input({ printingHours: 1, printingMinutes: 30, changingHours: 3, changingMinutes: 20 });
    const result = calculateQuote(originalInput, settings({ changingHourlyRate: 6 }));
    expect(result.formulaVersion).toBe("keychain-v2");
    expect(result.printingCost).toBe(4.5);
    expect(result.changingTimeHours).toBe(0);
    expect(result.changingCost).toBe(0);
    expect(result.totalMachineMinutes).toBe(90);
    expect(result.machineCost).toBe(4.5);
    expect(result).toEqual(calculateQuote({ ...originalInput, changingHours: 0, changingMinutes: 0 }, settings({ changingHourlyRate: 0 })));
    expect(originalInput.changingHours).toBe(3);
  });

  it("recalculates an old snapshot under current pricing without changing the original snapshot", () => {
    const originalInput = input({ colors: [{ name: "Blue", grams: 8 }], printingHours: 1, printingMinutes: 30, changingMinutes: 45 });
    const historical = calculateQuote(originalInput, settings(), "keychain-v1");
    const current = calculateQuote(originalInput, settings());
    expect(historical.finalPrice).toBe(12.5);
    expect(current.finalPrice).toBe(9);
    expect(historical.changingCost).toBe(2.25);
    expect(current.changingCost).toBe(0);
  });

  it("retains the full cost and markup precision before the final rounding", () => {
    const result = calculateQuote(input({ colors: [{ name: "", grams: 1 }] }), settings());
    expect(result.filamentCost).toBe(0.085);
    expect(result.productionCost).toBe(0.765);
    expect(result.profit).toBe(0.3825);
    expect(result.unroundedPrice).toBe(1.1475);
    expect(result.finalPrice).toBe(1.5);
  });

  it.each([
    ["existing", 0, 1.5],
    ["simple", 5, 6.5],
    ["complex", 10, 11.5],
  ] as const)("adds the %s design fee AFTER markup", (designType, fee, finalPrice) => {
    const result = calculateQuote(input({ designType }), { ...ZERO_COSTS, laborCost: 1, markupPercent: 50 });
    expect(result.priceBeforeDesign).toBe(1.5);
    expect(result.designingFee).toBe(fee);
    expect(result.finalPrice).toBe(finalPrice);
  });

  it("permits zero inputs and applies fixed costs without inventing a quantity", () => {
    const result = calculateQuote(input(), settings());
    expect(result.productionCost).toBe(0.68);
    expect(result.unroundedPrice).toBe(1.02);
    expect(result.finalPrice).toBe(1.5);
  });

  it("allows explicitly zero rates and returns zero with no design fee", () => {
    expect(calculateQuote(input(), ZERO_COSTS).finalPrice).toBe(0);
  });

  it("uses the saved custom rounding increment", () => {
    expect(calculateQuote(input({ colors: [{ name: "", grams: 1 }] }), settings({ roundingIncrement: 0.25 })).finalPrice).toBe(1.25);
  });

  it.each([
    [4.999999999999999, 0.5],
    [5, 0.5],
    [5.000000000000001, 1],
  ])("rounds %s g upward only when the exact half-ringgit boundary is exceeded", (grams, expected) => {
    expect(calculateQuote(input({ colors: [{ name: "", grams }] }), { ...ZERO_COSTS, filamentRate: 0.1 }).finalPrice).toBe(expected);
  });

  it("never adds an increment because of binary 0.1 + 0.2 arithmetic", () => {
    const result = calculateQuote(input({
      printingType: "multi",
      colors: [{ name: "", grams: 0.1 }, { name: "", grams: 0.2 }],
    }), { ...ZERO_COSTS, filamentRate: 1, roundingIncrement: 0.1 });
    expect(result.modelGrams).toBe(0.3);
    expect(result.unroundedPrice).toBe(0.3);
    expect(result.finalPrice).toBe(0.3);
    expect(result.roundingAdjustment).toBe(0);
  });

  it("cancels recurring minute fractions exactly before final ceiling", () => {
    const result = calculateQuote(input({ printingMinutes: 1, changingMinutes: 59 }), {
      ...ZERO_COSTS, printingHourlyRate: 0.01, changingHourlyRate: 0.01, roundingIncrement: 0.01,
    }, "keychain-v1");
    expect(result.machineCost).toBe(0.01);
    expect(result.finalPrice).toBe(0.01);
    expect(result.roundingAdjustment).toBe(0);
  });

  it("preserves additional weights and changing time in legacy single-color snapshots", () => {
    const result = calculateQuote(input({ flushGrams: 2, primeTowerGrams: 3, changingMinutes: 2 }), settings(), "keychain-v1");
    expect(result.additionalGrams).toBe(5);
    expect(result.changingCost).toBe(0.1);
  });

  it("guards against outputs too large for reliable currency display", () => {
    expect(() => calculateQuote(input({
      printingType: "multi",
      colors: Array.from({ length: 64 }, () => ({ name: "", grams: 1_000_000 })),
    }), settings({ filamentRate: 1_000_000, markupPercent: 10_000 }))).toThrow("safe pricing range");
  });
});

describe("pricing input validation", () => {
  it("accepts cleared valid inputs and default rates", () => {
    expect(validateQuoteInput(input())).toEqual({});
    expect(validateSettings(settings())).toEqual({});
  });

  it.each([NaN, Infinity, -1, 1_000_001])("rejects invalid filament weight %s", (grams) => {
    expect(validateQuoteInput(input({ colors: [{ name: "", grams }] }))["colors.0.grams"]).toBeTruthy();
    expect(() => calculateQuote(input({ colors: [{ name: "", grams }] }), settings())).toThrow();
  });

  it.each([60, -1, 1.5, NaN, Infinity])("rejects invalid minute field %s", (printingMinutes) => {
    expect(validateQuoteInput(input({ printingMinutes })).printingMinutes).toBeTruthy();
  });

  it("requires whole hours and uses the established hour upper bound", () => {
    expect(validateQuoteInput(input({ printingHours: 0.5 })).printingHours).toBeTruthy();
    expect(validateQuoteInput(input({ changingHours: 100_001 })).changingHours).toBeTruthy();
    expect(validateQuoteInput(input({ changingHours: 100_000 })).changingHours).toBeUndefined();
  });

  it("enforces one color in single mode, two to 64 colors in multicolor mode", () => {
    const colors = [{ name: "", grams: 1 }, { name: "", grams: 2 }];
    expect(validateQuoteInput(input({ colors })).colors).toBeTruthy();
    expect(validateQuoteInput(input({ printingType: "multi" })).colors).toBeTruthy();
    expect(validateQuoteInput(input({ printingType: "multi", colors })).colors).toBeUndefined();
    expect(validateQuoteInput(input({ printingType: "multi", colors: Array.from({ length: 65 }, () => colors[0]) })).colors).toBeTruthy();
  });

  it("validates color-name length without requiring optional names", () => {
    expect(validateQuoteInput(input({ colors: [{ name: "x".repeat(81), grams: 1 }] }))["colors.0.name"]).toBeTruthy();
    expect(validateQuoteInput(input({ colors: [{ name: "", grams: 1 }] }))).toEqual({});
  });

  it.each([0, -0.5, NaN, Infinity, 1_000_001])("rejects invalid rounding increment %s", (roundingIncrement) => {
    expect(validateSettings(settings({ roundingIncrement })).roundingIncrement).toBeTruthy();
    expect(() => calculateQuote(input(), settings({ roundingIncrement }))).toThrow();
  });

  it("rejects negative rates and an excessive markup", () => {
    expect(validateSettings(settings({ filamentRate: -0.1 })).filamentRate).toBeTruthy();
    expect(validateSettings(settings({ markupPercent: 10_001 })).markupPercent).toBeTruthy();
    expect(validateSettings(settings({ markupPercent: 10_000 })).markupPercent).toBeUndefined();
  });
});
