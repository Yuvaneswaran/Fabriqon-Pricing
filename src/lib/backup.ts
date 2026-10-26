import { z } from "zod";
import { calculateQuote, validateQuoteInput, validateSettings } from "./pricing";
import {
  FORMULA_VERSION,
  type BackupData,
  type SavedCalculation,
  type StudioSettings,
} from "./types";

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const MAX_BACKUP_RECORDS = 10_000;
const nonnegative = z.number().finite().nonnegative();
const timestamp = z.string().datetime({ offset: true });

export const settingsSchema = z.object({
  filamentRate: nonnegative,
  printingHourlyRate: nonnegative,
  changingHourlyRate: nonnegative,
  keyringCost: nonnegative,
  packagingCost: nonnegative,
  laborCost: nonnegative,
  markupPercent: nonnegative,
  roundingIncrement: z.number().finite().positive(),
}).strict().superRefine((settings, context) => {
  for (const [key, message] of Object.entries(validateSettings(settings))) {
    context.addIssue({ code: "custom", path: [key], message });
  }
});

const inputSchema = z.object({
  printingType: z.enum(["single", "multi"]),
  colors: z.array(z.object({
    name: z.string().max(80),
    grams: nonnegative,
  }).strict()).min(1).max(64),
  printingHours: nonnegative.int(),
  printingMinutes: nonnegative.int(),
  changingHours: nonnegative.int(),
  changingMinutes: nonnegative.int(),
  flushGrams: nonnegative,
  supportGrams: nonnegative,
  brimGrams: nonnegative,
  primeTowerGrams: nonnegative,
  designType: z.enum(["existing", "simple", "complex"]),
}).strict().superRefine((input, context) => {
  for (const [key, message] of Object.entries(validateQuoteInput(input))) {
    context.addIssue({ code: "custom", path: [key], message });
  }
});

const resultSchema = z.object({
  formulaVersion: z.literal(FORMULA_VERSION),
  modelGrams: nonnegative,
  additionalGrams: nonnegative,
  totalGrams: nonnegative,
  modelFilamentCost: nonnegative,
  additionalFilamentCost: nonnegative,
  filamentCost: nonnegative,
  printingTimeHours: nonnegative,
  changingTimeHours: nonnegative,
  totalMachineMinutes: nonnegative,
  printingCost: nonnegative,
  changingCost: nonnegative,
  machineCost: nonnegative,
  fixedCost: nonnegative,
  productionCost: nonnegative,
  profit: nonnegative,
  priceBeforeDesign: nonnegative,
  designingFee: nonnegative,
  unroundedPrice: nonnegative,
  finalPrice: nonnegative,
  roundingAdjustment: nonnegative,
}).strict();

export const savedCalculationSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().trim().min(1).max(160),
  notes: z.string().max(2_000),
  createdAt: timestamp,
  updatedAt: timestamp,
  input: inputSchema,
  settings: settingsSchema,
  result: resultSchema,
}).strict().superRefine((calculation, context) => {
  if (Date.parse(calculation.updatedAt) < Date.parse(calculation.createdAt)) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "Updated time cannot precede creation time." });
  }
  try {
    const computed = calculateQuote(calculation.input, calculation.settings);
    for (const key of Object.keys(computed) as Array<keyof typeof computed>) {
      const expected = computed[key];
      const actual = calculation.result[key];
      if (typeof expected === "number" && typeof actual === "number") {
        // JSON round-trips JavaScript numbers exactly; the versioned formula is deterministic.
        if (expected !== actual) {
          context.addIssue({ code: "custom", path: ["result", key], message: "Saved result does not match its pricing inputs and rates." });
        }
      }
    }
  } catch {
    context.addIssue({ code: "custom", path: ["input"], message: "These inputs cannot produce a valid calculation." });
  }
});

const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: timestamp,
  settings: settingsSchema,
  calculations: z.array(savedCalculationSchema).max(MAX_BACKUP_RECORDS),
}).strict();

function explainInvalidBackup(error: z.ZodError): Error {
  const issue = error.issues[0];
  const path = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
  return new Error(`Invalid FABRIQON backup${path}: ${issue?.message ?? "Unrecognized data."}`);
}

/** Validate a snapshot independently, including recomputation with its saved rates. */
export function validateCalculation(value: unknown): SavedCalculation {
  const result = savedCalculationSchema.safeParse(value);
  if (!result.success) throw explainInvalidBackup(result.error);
  return result.data;
}

export function validateStoredSettings(value: unknown): StudioSettings {
  const result = settingsSchema.safeParse(value);
  if (!result.success) throw explainInvalidBackup(result.error);
  return result.data;
}

export function validateImportCalculations(value: unknown): SavedCalculation[] {
  const result = z.array(savedCalculationSchema).max(MAX_BACKUP_RECORDS).safeParse(value);
  if (!result.success) throw explainInvalidBackup(result.error);
  return result.data;
}

/** JSON includes global settings and each quote's independent rate snapshot. */
export function serializeBackup(settings: StudioSettings, calculations: SavedCalculation[]): string {
  const data: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    calculations,
  };
  const result = backupSchema.safeParse(data);
  if (!result.success) throw explainInvalidBackup(result.error);
  const serialized = JSON.stringify(result.data, null, 2);
  if (new TextEncoder().encode(serialized).byteLength > MAX_BACKUP_BYTES) {
    throw new Error("This backup exceeds 10 MB. Export a smaller selection of calculations.");
  }
  return serialized;
}

/** Parse completely before any IndexedDB write. Imports merge records and leave settings unchanged. */
export function parseBackup(text: string): BackupData {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error("This backup exceeds the 10 MB import limit.");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Choose a FABRIQON Studio JSON backup.");
  }
  const result = backupSchema.safeParse(data);
  if (!result.success) throw explainInvalidBackup(result.error);
  return result.data;
}

function csvCell(value: string | number): string {
  let text = String(value);
  // Spreadsheet formulas can be disguised with leading whitespace, tabs or line breaks.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Human-readable quote snapshots; formula-like text is escaped for spreadsheet safety. */
export function serializeCSV(calculations: SavedCalculation[]): string {
  const valid = validateImportCalculations(calculations);
  const headers = [
    "ID", "Calculation name", "Notes", "Created at", "Updated at", "Currency", "Formula version",
    "Printing type", "Colors and model weights", "Model weight (g)", "Additional weight (g)", "Total weight (g)",
    "Printing hours", "Printing minutes", "Changing hours", "Changing minutes", "Flush (g)", "Support (g)", "Brim (g)", "Prime tower (g)", "Design type",
    "Filament rate (RM/g)", "Printing rate (RM/h)", "Changing rate (RM/h)", "Keyring cost (RM)", "Packaging cost (RM)", "Labor cost (RM)", "Markup (%)", "Rounding increment (RM)",
    "Model filament cost (RM)", "Additional filament cost (RM)", "Total filament cost (RM)", "Printing cost (RM)", "Changing cost (RM)", "Machine cost (RM)", "Fixed cost (RM)", "Production cost (RM)", "Profit (RM)", "Price before design (RM)", "Design fee (RM)", "Unrounded price (RM)", "Rounding adjustment (RM)", "Final price (RM)",
  ];
  const rows = valid.map((calculation) => {
    const { input, settings, result } = calculation;
    return [
      calculation.id, calculation.name, calculation.notes, calculation.createdAt, calculation.updatedAt, "MYR", result.formulaVersion,
      input.printingType, input.colors.map((color, index) => `${color.name || `Color ${index + 1}`}: ${color.grams} g`).join("; "), result.modelGrams, result.additionalGrams, result.totalGrams,
      input.printingHours, input.printingMinutes, input.changingHours, input.changingMinutes, input.flushGrams, input.supportGrams, input.brimGrams, input.primeTowerGrams, input.designType,
      settings.filamentRate, settings.printingHourlyRate, settings.changingHourlyRate, settings.keyringCost, settings.packagingCost, settings.laborCost, settings.markupPercent, settings.roundingIncrement,
      result.modelFilamentCost, result.additionalFilamentCost, result.filamentCost, result.printingCost, result.changingCost, result.machineCost, result.fixedCost, result.productionCost, result.profit, result.priceBeforeDesign, result.designingFee, result.unroundedPrice, result.roundingAdjustment, result.finalPrice,
    ];
  });
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
