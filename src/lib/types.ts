export const SUPPORTED_FORMULA_VERSIONS = ["keychain-v1", "keychain-v2"] as const;
export type PricingFormulaVersion = typeof SUPPORTED_FORMULA_VERSIONS[number];
export const FORMULA_VERSION = "keychain-v2" as const;
export type PrintingType = "single" | "multi";
export type DesignType = "existing" | "simple" | "complex";
export interface FilamentColor { name: string; grams: number }
export interface StudioSettings {
  filamentRate: number;
  printingHourlyRate: number;
  /** @deprecated Retained only for original keychain-v1 pricing snapshots. */
  changingHourlyRate: number;
  keyringCost: number;
  packagingCost: number;
  laborCost: number;
  markupPercent: number;
  roundingIncrement: number;
}
export interface QuoteInput {
  printingType: PrintingType;
  colors: FilamentColor[];
  printingHours: number;
  printingMinutes: number;
  /** @deprecated Retained for original snapshots; ignored by keychain-v2. */
  changingHours: number;
  /** @deprecated Retained for original snapshots; ignored by keychain-v2. */
  changingMinutes: number;
  flushGrams: number;
  supportGrams: number;
  brimGrams: number;
  primeTowerGrams: number;
  designType: DesignType;
}
/** RM amounts retain full intermediate precision; format only at presentation. */
export interface QuoteResult {
  formulaVersion: PricingFormulaVersion;
  modelGrams: number;
  additionalGrams: number;
  totalGrams: number;
  modelFilamentCost: number;
  additionalFilamentCost: number;
  filamentCost: number;
  printingTimeHours: number;
  changingTimeHours: number;
  totalMachineMinutes: number;
  printingCost: number;
  changingCost: number;
  machineCost: number;
  fixedCost: number;
  productionCost: number;
  profit: number;
  priceBeforeDesign: number;
  designingFee: number;
  unroundedPrice: number;
  finalPrice: number;
  roundingAdjustment: number;
}
export interface SavedCalculation {
  id: string;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  input: QuoteInput;
  settings: StudioSettings;
  result: QuoteResult;
}
export interface BackupData {
  version: 1;
  exportedAt: string;
  settings: StudioSettings;
  calculations: SavedCalculation[];
}
export const DEFAULT_SETTINGS: StudioSettings = {
  filamentRate: 0.085,
  printingHourlyRate: 3,
  changingHourlyRate: 3,
  keyringCost: 0.15,
  packagingCost: 0.03,
  laborCost: 0.50,
  markupPercent: 50,
  roundingIncrement: 0.50,
};
export function createQuoteInput(): QuoteInput {
  return {
    printingType: "single", colors: [{ name: "", grams: 0 }],
    printingHours: 0, printingMinutes: 0, changingHours: 0, changingMinutes: 0,
    flushGrams: 0, supportGrams: 0, brimGrams: 0, primeTowerGrams: 0,
    designType: "existing",
  };
}
export const DESIGN_OPTIONS = [
  { value: "existing", label: "Existing design", description: "No design required", fee: 0 },
  { value: "simple", label: "Simple custom", description: "A personal touch", fee: 5 },
  { value: "complex", label: "Complex custom", description: "Made from scratch", fee: 10 },
] as const;
