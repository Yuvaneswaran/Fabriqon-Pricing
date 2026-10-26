import { describe, expect, it } from "vitest";
import { MAX_BACKUP_BYTES, parseBackup, serializeBackup, serializeCSV } from "./backup";
import { calculateQuote } from "./pricing";
import { DEFAULT_SETTINGS, createQuoteInput, type SavedCalculation } from "./types";

function fixture(overrides: Partial<SavedCalculation> = {}): SavedCalculation {
  const input = { ...createQuoteInput(), colors: [{ name: "Midnight", grams: 8 }], printingHours: 1, printingMinutes: 30 };
  return {
    id: "quote-1", name: "Studio keychain", notes: "First batch",
    createdAt: "2026-10-26T10:00:00.000Z", updatedAt: "2026-10-26T10:00:00.000Z",
    input, settings: { ...DEFAULT_SETTINGS }, result: calculateQuote(input, DEFAULT_SETTINGS),
    ...overrides,
  };
}

describe("JSON backups", () => {
  it("round-trips full records, independent rate snapshots, and current settings", () => {
    const calculation = fixture();
    const currentSettings = { ...DEFAULT_SETTINGS, filamentRate: 0.2, markupPercent: 65 };
    const backup = parseBackup(serializeBackup(currentSettings, [calculation]));
    expect(backup.version).toBe(1);
    expect(backup.settings).toEqual(currentSettings);
    expect(backup.calculations).toEqual([calculation]);
    expect(backup.calculations[0].settings).toEqual(DEFAULT_SETTINGS);
    expect(Number.isNaN(Date.parse(backup.exportedAt))).toBe(false);
  });

  it("preserves legacy nonzero changing costs alongside current printing-only records", () => {
    const input = {
      ...createQuoteInput(), colors: [{ name: "Model", grams: 20 }], flushGrams: 2,
      supportGrams: 1, brimGrams: 1, printingHours: 2, changingMinutes: 45, designType: "simple" as const,
    };
    const result = calculateQuote(input, DEFAULT_SETTINGS, "keychain-v1");
    expect(result).toEqual({
      formulaVersion: "keychain-v1", modelGrams: 20, additionalGrams: 4, totalGrams: 24,
      modelFilamentCost: 1.7, additionalFilamentCost: 0.34, filamentCost: 2.04,
      printingTimeHours: 2, changingTimeHours: 0.75, totalMachineMinutes: 165,
      printingCost: 6, changingCost: 2.25, machineCost: 8.25, fixedCost: 0.68,
      productionCost: 10.97, profit: 5.485, priceBeforeDesign: 16.455,
      designingFee: 5, unroundedPrice: 21.455, finalPrice: 21.5, roundingAdjustment: 0.045,
    });
    const legacy = fixture({ input, result });
    const current = fixture({ id: "quote-current", input, result: calculateQuote(input, DEFAULT_SETTINGS) });
    const backup = parseBackup(serializeBackup(DEFAULT_SETTINGS, [legacy, current]));
    expect(backup.calculations).toEqual([legacy, current]);
    expect(backup.calculations[0].result.finalPrice).toBe(21.5);
    expect(backup.calculations[1].result.finalPrice).toBe(18.5);
    expect(serializeCSV(backup.calculations)).toContain('"keychain-v1"');
    expect(serializeCSV(backup.calculations)).toContain('"keychain-v2"');
  });

  it("rejects changing a legacy snapshot's formula version without recalculating its results", () => {
    const input = { ...createQuoteInput(), printingHours: 1, changingMinutes: 45 };
    const legacy = fixture({ input, result: calculateQuote(input, DEFAULT_SETTINGS, "keychain-v1") });
    const backup = JSON.parse(serializeBackup(DEFAULT_SETTINGS, [legacy]));
    backup.calculations[0].result.formulaVersion = "keychain-v2";
    expect(() => parseBackup(JSON.stringify(backup))).toThrow("Saved result does not match");
  });

  it("allows an empty backup without inventing a calculation", () => {
    expect(parseBackup(serializeBackup(DEFAULT_SETTINGS, [])).calculations).toEqual([]);
  });

  it("rejects malformed JSON and unrecognized backup versions", () => {
    expect(() => parseBackup("not json")).toThrow("not valid JSON");
    const data = JSON.parse(serializeBackup(DEFAULT_SETTINGS, [fixture()]));
    data.version = 2;
    expect(() => parseBackup(JSON.stringify(data))).toThrow("Invalid FABRIQON backup");
  });

  it.each([
    ["negative weight", (record: SavedCalculation) => { record.input.colors[0].grams = -1; }],
    ["invalid minutes", (record: SavedCalculation) => { record.input.printingMinutes = 60; }],
    ["zero rounding increment", (record: SavedCalculation) => { record.settings.roundingIncrement = 0; }],
    ["tampered result", (record: SavedCalculation) => { record.result.finalPrice += 10; }],
    ["invalid formula version", (record: SavedCalculation) => { Object.assign(record.result, { formulaVersion: "unknown" }); }],
    ["reversed timestamps", (record: SavedCalculation) => { record.updatedAt = "2020-01-01T00:00:00.000Z"; }],
  ] as const)("rejects %s without accepting partial data", (_name, mutate) => {
    const data = JSON.parse(serializeBackup(DEFAULT_SETTINGS, [fixture()]));
    mutate(data.calculations[0]);
    expect(() => parseBackup(JSON.stringify(data))).toThrow("Invalid FABRIQON backup");
  });

  it("rejects oversized content before attempting JSON parsing", () => {
    expect(() => parseBackup(" ".repeat(MAX_BACKUP_BYTES + 1))).toThrow("10 MB");
  });

  it("rejects unexpected keys and nonfinite runtime numbers", () => {
    const data = JSON.parse(serializeBackup(DEFAULT_SETTINGS, [fixture()]));
    data.calculations[0].input.unrecognizedField = true;
    expect(() => parseBackup(JSON.stringify(data))).toThrow("Invalid FABRIQON backup");
    expect(() => serializeBackup({ ...DEFAULT_SETTINGS, filamentRate: Number.POSITIVE_INFINITY }, [])).toThrow();
  });
});

describe("CSV exports", () => {
  it("includes every pricing snapshot input, rate, and final price", () => {
    const calculation = fixture();
    const csv = serializeCSV([calculation]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Studio keychain"');
    expect(csv).toContain('"Midnight: 8 g"');
    expect(csv).toContain('"Rounding increment (RM)"');
    expect(csv).toContain(`"${calculation.result.finalPrice}"\r\n`);
    expect(csv).toContain('"0.085"');
    expect(csv).toContain('"MYR"');
  });

  it("neutralizes formulas and quotes delimiters, newlines, and embedded quotes", () => {
    const calculation = fixture({ name: '=HYPERLINK("https://example.com")', notes: ' \t=2+2, "unsafe"\nsecond line' });
    calculation.input.colors[0].name = "@SUM(1+1)";
    const csv = serializeCSV([calculation]);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
    expect(csv).toContain('"\' \t=2+2, ""unsafe""\nsecond line"');
    expect(csv).toContain('"\'@SUM(1+1): 8 g"');
  });

  it("exports a readable header for an empty selection", () => {
    const csv = serializeCSV([]);
    expect(csv).toContain('"Calculation name"');
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});
