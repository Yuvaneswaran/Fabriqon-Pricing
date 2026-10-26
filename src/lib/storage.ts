import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SavedCalculation, StudioSettings } from "./types";
import { validateCalculation, validateImportCalculations, validateStoredSettings } from "./backup";

interface StudioDatabase extends DBSchema {
  settings: {
    key: string;
    value: StudioSettings;
  };
  calculations: {
    key: string;
    value: SavedCalculation;
    indexes: { "by-updated": string };
  };
}

const DATABASE_NAME = "fabriqon-studio";
const DATABASE_VERSION = 1;
const SETTINGS_KEY = "preferences";
let connection: Promise<IDBPDatabase<StudioDatabase>> | undefined;

function database(): Promise<IDBPDatabase<StudioDatabase>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("Site storage is unavailable. Enable IndexedDB in your browser to save your work."),
    );
  }

  if (!connection) {
    connection = openDB<StudioDatabase>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(db) {
        db.createObjectStore("settings");
        const calculations = db.createObjectStore("calculations", { keyPath: "id" });
        calculations.createIndex("by-updated", "updatedAt");
      },
      blocking(_currentVersion, _blockedVersion, event) {
        (event.target as IDBDatabase | null)?.close();
        connection = undefined;
      },
      terminated() {
        connection = undefined;
      },
    }).catch((error: unknown) => {
      connection = undefined;
      throw error;
    });
  }

  return connection;
}

/** Close only this tab's connection; all persisted data is retained. */
export async function closeDatabase(): Promise<void> {
  if (connection) {
    (await connection).close();
    connection = undefined;
  }
}

export async function getSettings(): Promise<StudioSettings | null> {
  return (await (await database()).get("settings", SETTINGS_KEY)) ?? null;
}

export async function saveSettings(settings: StudioSettings): Promise<void> {
  await (await database()).put("settings", validateStoredSettings(settings), SETTINGS_KEY);
}

export async function listCalculations(): Promise<SavedCalculation[]> {
  const calculations = await (await database()).getAll("calculations");
  return calculations.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
}

export async function getCalculation(id: string): Promise<SavedCalculation | undefined> {
  return (await database()).get("calculations", id);
}

export async function saveCalculation(calculation: SavedCalculation): Promise<void> {
  await (await database()).put("calculations", validateCalculation(calculation));
}

export async function deleteCalculation(id: string): Promise<void> {
  await (await database()).delete("calculations", id);
}

export async function clearCalculations(): Promise<void> {
  await (await database()).clear("calculations");
}

/** Merge records atomically. Existing records and current settings are never overwritten. */
export async function importCalculations(calculations: SavedCalculation[]): Promise<{ imported: number; remapped: number }> {
  const valid = validateImportCalculations(calculations);
  const db = await database();
  const transaction = db.transaction("calculations", "readwrite");
  let remapped = 0;
  try {
    const usedIds = new Set(await transaction.store.getAllKeys());
    for (const calculation of valid) {
      let id = calculation.id;
      if (usedIds.has(id)) {
        do { id = crypto.randomUUID(); } while (usedIds.has(id));
        remapped += 1;
      }
      usedIds.add(id);
      await transaction.store.add({ ...calculation, id });
    }
    await transaction.done;
    return { imported: valid.length, remapped };
  } catch (error: unknown) {
    try {
      transaction.abort();
    } catch {
      // IndexedDB already aborted the transaction after a failed request.
    }
    await transaction.done.catch(() => undefined);
    throw error;
  }
}

/** Clear only FABRIQON Studio's stores, leaving other site data alone. */
export async function resetDatabase(): Promise<void> {
  const db = await database();
  const transaction = db.transaction(["settings", "calculations"], "readwrite");
  await transaction.objectStore("settings").clear();
  await transaction.objectStore("calculations").clear();
  await transaction.done;
}
