import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateQuote } from "./pricing";
import { DEFAULT_SETTINGS, createQuoteInput, type SavedCalculation } from "./types";
import {
  clearCalculations, closeDatabase, deleteCalculation, getCalculation, getSettings,
  importCalculations, listCalculations, resetDatabase, saveCalculation, saveSettings,
} from "./storage";

function fixture(id = "quote-1", overrides: Partial<SavedCalculation> = {}): SavedCalculation {
  const input = { ...createQuoteInput(), colors: [{ name: "Midnight", grams: 8 }], printingHours: 1, printingMinutes: 30 };
  return {
    id, name: "Studio keychain", notes: "First batch",
    createdAt: "2026-10-26T10:00:00.000Z", updatedAt: "2026-10-26T10:00:00.000Z",
    input, settings: { ...DEFAULT_SETTINGS }, result: calculateQuote(input, DEFAULT_SETTINGS),
    ...overrides,
  };
}

beforeEach(async () => {
  await closeDatabase();
  await deleteDB("fabriqon-studio");
});

afterAll(async () => {
  await closeDatabase();
  await deleteDB("fabriqon-studio");
});

describe("IndexedDB persistence", () => {
  it("returns empty initial state then persists settings and records across reopened connections", async () => {
    expect(await getSettings()).toBeNull();
    expect(await listCalculations()).toEqual([]);
    const settings = { ...DEFAULT_SETTINGS, markupPercent: 60 };
    const calculation = fixture();
    await saveSettings(settings);
    await saveCalculation(calculation);
    await closeDatabase();
    expect(await getSettings()).toEqual(settings);
    expect(await getCalculation(calculation.id)).toEqual(calculation);
  });

  it("edits a record in place, sorts recent changes first, and deletes only the selected record", async () => {
    await saveCalculation(fixture("a"));
    await saveCalculation(fixture("b"));
    const edited = fixture("a", { name: "Renamed keychain", updatedAt: "2026-10-27T10:00:00.000Z" });
    await saveCalculation(edited);
    expect((await listCalculations()).map((calculation) => calculation.id)).toEqual(["a", "b"]);
    expect(await getCalculation("a")).toEqual(edited);
    await deleteCalculation("a");
    expect(await getCalculation("a")).toBeUndefined();
    expect((await listCalculations()).map((calculation) => calculation.id)).toEqual(["b"]);
  });

  it("sorts imported ISO timestamps by the actual instant across timezone offsets", async () => {
    await saveCalculation(fixture("offset", { updatedAt: "2026-10-26T20:00:00+08:00" }));
    await saveCalculation(fixture("utc", { updatedAt: "2026-10-26T12:30:00.000Z" }));
    expect((await listCalculations()).map((calculation) => calculation.id)).toEqual(["utc", "offset"]);
  });

  it("returns detached values so mutating a read does not silently persist changes", async () => {
    await saveCalculation(fixture());
    const read = await getCalculation("quote-1");
    if (!read) throw new Error("Expected saved record");
    read.input.colors[0].grams = 999;
    expect((await getCalculation("quote-1"))?.input.colors[0].grams).toBe(8);
  });

  it("clears history independently from settings and resets both stores on explicit reset", async () => {
    await saveSettings(DEFAULT_SETTINGS);
    await saveCalculation(fixture());
    await clearCalculations();
    expect(await listCalculations()).toEqual([]);
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    await saveCalculation(fixture());
    await resetDatabase();
    expect(await getSettings()).toBeNull();
    expect(await listCalculations()).toEqual([]);
  });

  it("rejects invalid direct writes rather than corrupting saved data", async () => {
    const valid = fixture();
    await saveCalculation(valid);
    await expect(saveSettings({ ...DEFAULT_SETTINGS, roundingIncrement: 0 })).rejects.toThrow();
    await expect(saveCalculation({ ...valid, result: { ...valid.result, finalPrice: -1 } })).rejects.toThrow();
    expect(await getCalculation(valid.id)).toEqual(valid);
  });
});

describe("backup imports", () => {
  it("merges records and safely remaps collisions with existing and incoming IDs", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, markupPercent: 70 });
    const original = fixture("existing");
    await saveCalculation(original);
    const imported = fixture("existing", { name: "Imported copy" });
    const result = await importCalculations([imported, imported, fixture("new")]);
    expect(result).toEqual({ imported: 3, remapped: 2 });
    const all = await listCalculations();
    expect(all).toHaveLength(4);
    expect(new Set(all.map((calculation) => calculation.id)).size).toBe(4);
    expect(await getCalculation("existing")).toEqual(original);
    expect((await getSettings())?.markupPercent).toBe(70);
  });

  it("validates the complete batch before any writes", async () => {
    const original = fixture("existing");
    await saveCalculation(original);
    const bad = fixture("bad");
    bad.result.finalPrice += 100;
    await expect(importCalculations([fixture("new"), bad])).rejects.toThrow();
    expect(await listCalculations()).toEqual([original]);
  });

  it("rolls back earlier additions if a later import operation fails", async () => {
    const original = fixture("existing");
    await saveCalculation(original);
    const spy = vi.spyOn(crypto, "randomUUID").mockImplementationOnce(() => {
      throw new Error("Simulated ID allocation failure");
    });
    try {
      await expect(importCalculations([fixture("new"), fixture("existing")])).rejects.toThrow("Simulated");
      expect(await listCalculations()).toEqual([original]);
    } finally {
      spy.mockRestore();
    }
  });
});
