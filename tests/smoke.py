#!/usr/bin/env python3
"""FABRIQON Studio browser acceptance tests.

Prerequisites: pip install playwright; install Chromium (or set CHROMIUM_PATH).
Run a production server first: npm run build && npm start
Then: python3 tests/smoke.py
Optional: BASE_URL=http://127.0.0.1:3000 CHROMIUM_PATH=/usr/bin/chromium

This suite uses an isolated temporary browser profile and exercises the real UI
and IndexedDB. It never edits the repository or leaves user records behind.
"""

from __future__ import annotations

import csv
import io
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import Page, expect, sync_playwright

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000").rstrip("/")
CHROMIUM_PATH = os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium")

SNAPSHOT_SCRIPT = """() => new Promise((resolve, reject) => {
  const open = indexedDB.open('fabriqon-studio');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const transaction = db.transaction(['calculations', 'settings'], 'readonly');
    const records = transaction.objectStore('calculations').getAll();
    const settings = transaction.objectStore('settings').get('preferences');
    transaction.oncomplete = () => { db.close(); resolve({records: records.result, settings: settings.result ?? null}); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  };
})"""


def snapshot(page: Page) -> dict:
    return page.evaluate(SNAPSHOT_SCRIPT)


def wait_for_count(page: Page, expected: int) -> None:
    page.wait_for_function("""expected => new Promise((resolve, reject) => {
      const open = indexedDB.open('fabriqon-studio');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('calculations')) { db.close(); resolve(false); return; }
        const request = db.transaction('calculations', 'readonly').objectStore('calculations').count();
        request.onsuccess = () => { db.close(); resolve(request.result === expected); };
        request.onerror = () => { db.close(); reject(request.error); };
      };
    })""", arg=expected)
    assert len(snapshot(page)["records"]) == expected


def visit(page: Page, path: str, heading: str | None = None) -> None:
    page.goto(f"{BASE_URL}{path}", wait_until="networkidle")
    if heading:
        expect(page.get_by_role("heading", name=heading, exact=False).first).to_be_visible()


def price(page: Page, expected: str) -> None:
    expect(page.get_by_test_id("final-price")).to_have_text(f"RM{expected}")


def fill(page: Page, label: str, value: str) -> None:
    page.get_by_label(label, exact=True).fill(value)


def saved_id(page: Page) -> str:
    page.wait_for_url(re.compile(r"\?edit=[^&]+"))
    return parse_qs(urlsplit(page.url).query)["edit"][0]


def visible_names(page: Page) -> list[str]:
    return page.locator("table tbody tr td:first-child > a").all_text_contents()


def no_horizontal_overflow(page: Page) -> None:
    metrics = page.evaluate("""() => ({viewport: innerWidth, body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth})""")
    assert metrics["body"] <= metrics["viewport"] + 1, metrics
    assert metrics["document"] <= metrics["viewport"] + 1, metrics


def run() -> None:
    completed: list[str] = []
    page_errors: list[str] = []
    with tempfile.TemporaryDirectory(prefix="fabriqon-browser-") as profile_dir:
        with sync_playwright() as playwright:
            launch = dict(executable_path=CHROMIUM_PATH, headless=True, args=["--no-sandbox"],
                          accept_downloads=True, locale="en-MY", timezone_id="Asia/Kuala_Lumpur")
            context = playwright.chromium.launch_persistent_context(profile_dir, viewport={"width": 1440, "height": 1100}, **launch)
            page = context.pages[0] if context.pages else context.new_page()
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.set_default_timeout(15000)

            # Enter the official example manually: no hidden seed or test-only API.
            visit(page, "/", "Custom Keychain Pricing")
            expect(page.get_by_label("Model filament weight", exact=True)).to_be_visible()
            wait_for_count(page, 0)
            price(page, "0.00")
            fill(page, "Model filament weight", "20")
            fill(page, "Printing hours", "2")
            fill(page, "Flushed / poop filament", "2")
            fill(page, "Support filament", "1")
            fill(page, "Brim filament", "1")
            page.get_by_role("button", name=re.compile(r"Simple custom")).click()
            price(page, "18.50")
            page.get_by_role("button", name="Save Calculation", exact=True).click()
            expect(page.get_by_role("alert").filter(has_text="Give this calculation a name")).to_be_visible()
            wait_for_count(page, 0)
            page.locator("#calculation-name").fill("AGHILA Acceptance Keychain")
            fill(page, "Notes optional", "Acceptance test: original historical pricing.")
            page.get_by_role("button", name="Save Calculation", exact=True).click()
            original_id = saved_id(page)
            wait_for_count(page, 1)
            original = snapshot(page)["records"][0]
            assert original["id"] == original_id
            assert original["result"]["finalPrice"] == 18.5
            assert original["result"]["productionCost"] == 8.72
            assert original["result"]["profit"] == 4.36
            assert original["result"]["priceBeforeDesign"] == 13.08
            assert original["result"]["unroundedPrice"] == 18.08
            page.reload(wait_until="networkidle")
            expect(page.locator("#calculation-name")).to_have_value("AGHILA Acceptance Keychain")
            price(page, "18.50")
            visit(page, "/history", "Calculation History")
            expect(page.get_by_role("link", name="AGHILA Acceptance Keychain", exact=True)).to_be_visible()
            page.get_by_role("link", name="View AGHILA Acceptance Keychain", exact=True).click()
            expect(page.get_by_role("heading", name="AGHILA Acceptance Keychain", exact=True)).to_be_visible()
            expect(page.get_by_text("Original pricing breakdown", exact=True)).to_be_visible()
            expect(page.get_by_text("RM18.50", exact=True).first).to_be_visible()
            completed.append("Official RM18.50 example, required save name, full historical view, refresh persistence")

            # Update in place, preserving identity and original creation timestamp.
            page.get_by_role("link", name="Edit calculation", exact=True).click()
            expect(page.locator("#calculation-name")).to_have_value("AGHILA Acceptance Keychain")
            page.locator("#calculation-name").fill("AGHILA Revised Keychain")
            fill(page, "Model filament weight", "30")
            price(page, "19.50")
            page.get_by_role("button", name="Update Existing Calculation", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="Calculation updated")).to_be_visible()
            wait_for_count(page, 1)
            edited = snapshot(page)["records"][0]
            assert edited["id"] == original_id
            assert edited["createdAt"] == original["createdAt"]
            assert edited["updatedAt"] >= original["updatedAt"]
            assert edited["result"]["finalPrice"] == 19.5
            assert edited["name"] == "AGHILA Revised Keychain"
            page.locator("#calculation-name").fill("BIRTHDAY New Calculation")
            page.get_by_role("button", name="Save as New Calculation", exact=True).click()
            page.wait_for_function("id => new URLSearchParams(location.search).get('edit') !== id", arg=original_id)
            new_id = saved_id(page)
            wait_for_count(page, 2)
            assert new_id != original_id
            assert next(record for record in snapshot(page)["records"] if record["id"] == original_id) == edited
            completed.append("Editing preserves ID/creation date; Save as New creates independent record")

            # Duplicate with dynamic multicolor inputs and separate changing minutes.
            visit(page, "/history", "Calculation History")
            page.get_by_role("link", name="Duplicate AGHILA Revised Keychain", exact=True).click()
            expect(page.locator("#calculation-name")).to_have_value("AGHILA Revised Keychain (copy)")
            page.locator("#calculation-name").fill("CUSTOMER Multicolor Keychain")
            page.get_by_role("button", name="Multicolor", exact=True).click()
            page.get_by_label("Number of colors", exact=True).select_option("3")
            fill(page, "Color 1 weight", "8.5")
            fill(page, "Color 2 weight", "5.2")
            fill(page, "Color 3 weight", "3")
            page.locator("#color-name-0").fill("Electric Blue")
            page.locator("#color-name-1").fill("Cyan")
            page.locator("#color-name-2").fill("White")
            fill(page, "Printing hours", "1")
            fill(page, "Printing minutes", "30")
            fill(page, "Changing minutes", "45")
            fill(page, "Prime tower filament", "0.4")
            page.get_by_role("button", name=re.compile(r"Complex custom")).click()
            price(page, "24.00")
            page.get_by_role("button", name="Save Calculation", exact=True).click()
            multi_id = saved_id(page)
            wait_for_count(page, 3)
            current = snapshot(page)["records"]
            multi = next(record for record in current if record["id"] == multi_id)
            assert multi["result"]["modelGrams"] == 16.7
            assert multi["result"]["totalGrams"] == 21.1
            assert multi["result"]["totalMachineMinutes"] == 135
            assert multi["result"]["changingCost"] == 2.25
            assert multi["result"]["finalPrice"] == 24
            assert next(record for record in current if record["id"] == original_id) == edited
            completed.append("Duplication preserves original; decimal multicolor weights and separate changing time")

            # Search, printing-type/date filters, and all sort modes.
            visit(page, "/history", "Calculation History")
            expect(page.locator("table tbody tr")).to_have_count(3)
            fill(page, "Search calculations", "aghila revised")
            expect(page.locator("table tbody tr")).to_have_count(1)
            expect(page.get_by_text("1 of 3 records", exact=True)).to_be_visible()
            fill(page, "Search calculations", "does-not-exist")
            expect(page.get_by_role("heading", name="No matching calculations", exact=True)).to_be_visible()
            page.get_by_role("button", name="Clear filters", exact=True).first.click()
            page.get_by_label("Filter printing type", exact=True).select_option("multi")
            expect(page.locator("table tbody tr")).to_have_count(1)
            assert visible_names(page) == ["CUSTOMER Multicolor Keychain"]
            page.get_by_label("Filter printing type", exact=True).select_option("single")
            expect(page.locator("table tbody tr")).to_have_count(2)
            page.get_by_label("Filter printing type", exact=True).select_option("all")
            today = page.evaluate("""() => {const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}""")
            fill(page, "Saved from date", today)
            fill(page, "Saved to date", today)
            expect(page.locator("table tbody tr")).to_have_count(3)
            tomorrow = page.evaluate("""() => {const d = new Date(); d.setDate(d.getDate()+1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}""")
            fill(page, "Saved to date", "")
            fill(page, "Saved from date", tomorrow)
            expect(page.get_by_role("heading", name="No matching calculations", exact=True)).to_be_visible()
            page.get_by_role("button", name="Clear filters", exact=True).first.click()
            for order, first_name in [("newest", "CUSTOMER Multicolor Keychain"), ("oldest", "AGHILA Revised Keychain"), ("highest", "CUSTOMER Multicolor Keychain"), ("alphabetical", "AGHILA Revised Keychain")]:
                page.get_by_label("Sort calculations", exact=True).select_option(order)
                expect(page.locator("table tbody tr td:first-child > a").first).to_have_text(first_name)
            assert visible_names(page) == ["AGHILA Revised Keychain", "BIRTHDAY New Calculation", "CUSTOMER Multicolor Keychain"]
            page.get_by_label("Sort calculations", exact=True).select_option("lowest")
            expect(page.locator("table tbody tr").first.locator("td").nth(5)).to_have_text("RM19.50")
            completed.append("Case-insensitive search, empty states, type/date filters, and all five sort modes")

            # Settings persist, while historical views/edits retain old rates until explicit opt-in.
            visit(page, "/settings", "Pricing Settings")
            page.locator("#setting-filamentRate").fill("0.1")
            page.get_by_role("button", name="Save Settings", exact=True).click()
            expect(page.get_by_role("status").filter(has_text="Pricing settings saved")).to_be_visible()
            page.reload(wait_until="networkidle")
            expect(page.locator("#setting-filamentRate")).to_have_value("0.1")
            visit(page, f"/history/{original_id}", "AGHILA Revised Keychain")
            expect(page.get_by_text("RM19.50", exact=True).first).to_be_visible()
            expect(page.get_by_text("RM 0.085", exact=True)).to_be_visible()
            page.get_by_role("link", name="Edit calculation", exact=True).click()
            price(page, "19.50")
            page.get_by_role("button", name="Apply current rates", exact=True).click()
            price(page, "20.50")
            page.get_by_role("button", name="Reset Calculator", exact=True).click()
            expect(page.locator("#calculation-name")).to_have_value("")
            fill(page, "Printing hours", "0")
            # A reset itself clears pricing; changing an input intentionally activates live pricing.
            page.get_by_role("button", name="Reset Calculator", exact=True).click()
            price(page, "0.00")
            expect(page.get_by_role("button", name="Single Color", exact=True)).to_have_attribute("aria-pressed", "true")
            expect(page.get_by_label("Model filament weight", exact=True)).to_have_value("0")
            assert snapshot(page)["settings"]["filamentRate"] == 0.1
            wait_for_count(page, 3)
            assert next(record for record in snapshot(page)["records"] if record["id"] == original_id) == edited
            completed.append("Persistent settings, historical rate snapshots, explicit current rates, non-destructive calculator reset")

            # Real downloads and duplicate-safe JSON merge, followed by rejected invalid import.
            visit(page, "/history", "Calculation History")
            with page.expect_download() as downloaded:
                page.get_by_role("button", name="Export JSON", exact=True).click()
            backup = json.loads(Path(downloaded.value.path()).read_text(encoding="utf-8"))
            assert backup["version"] == 1 and len(backup["calculations"]) == 3
            assert backup["settings"]["filamentRate"] == 0.1
            assert next(record for record in backup["calculations"] if record["id"] == original_id)["settings"]["filamentRate"] == 0.085
            with page.expect_download() as downloaded:
                page.get_by_role("button", name="Export CSV", exact=True).click()
            csv_records = list(csv.DictReader(io.StringIO(Path(downloaded.value.path()).read_text(encoding="utf-8-sig"))))
            assert len(csv_records) == 3
            assert csv_records[0]["Calculation name"]
            assert all(key in csv_records[0] for key in ["Printing type", "Production cost (RM)", "Design fee (RM)", "Final price (RM)"])
            page.get_by_label("Choose JSON backup", exact=True).set_input_files({"name": "backup.json", "mimeType": "application/json", "buffer": json.dumps(backup).encode()})
            wait_for_count(page, 6)
            expect(page.get_by_role("status").filter(has_text="3 calculations imported")).to_be_visible()
            merged = snapshot(page)
            ids = {record["id"] for record in merged["records"]}
            assert len(ids) == 6
            assert all(record["id"] in ids for record in backup["calculations"])
            assert next(record for record in merged["records"] if record["id"] == original_id) == edited
            assert merged["settings"]["filamentRate"] == 0.1
            invalid = json.loads(json.dumps(backup))
            invalid["calculations"][-1]["result"]["finalPrice"] = 999
            page.get_by_label("Choose JSON backup", exact=True).set_input_files({"name": "invalid.json", "mimeType": "application/json", "buffer": json.dumps(invalid).encode()})
            expect(page.get_by_role("alert").filter(has_text="Invalid FABRIQON backup")).to_be_visible()
            assert snapshot(page) == merged
            page.get_by_label("Choose JSON backup", exact=True).set_input_files({"name": "broken.json", "mimeType": "application/json", "buffer": b'{broken json'})
            expect(page.get_by_role("alert").filter(has_text="not valid JSON")).to_be_visible()
            assert snapshot(page) == merged
            completed.append("CSV/JSON downloads, full backups, duplicate-safe merging, atomic invalid-import rejection")

            # Native delete confirmation protects cancel, then removes just one record.
            page.get_by_role("button", name="Delete AGHILA Revised Keychain", exact=True).first.click()
            deletion = page.get_by_role("dialog", name="Delete calculation?", exact=True)
            expect(deletion).to_be_visible()
            deletion.get_by_role("button", name="Cancel", exact=True).click()
            expect(deletion).not_to_be_visible()
            wait_for_count(page, 6)
            page.get_by_role("button", name="Delete AGHILA Revised Keychain", exact=True).first.click()
            deletion.get_by_role("button", name="Delete calculation", exact=True).click()
            wait_for_count(page, 5)
            remaining = snapshot(page)
            remaining_ids = {record["id"] for record in remaining["records"]}
            assert len(ids - remaining_ids) == 1
            assert remaining_ids.issubset(ids)
            page.reload(wait_until="networkidle")
            wait_for_count(page, 5)
            assert snapshot(page) == remaining
            completed.append("Delete cancellation/confirmation, immediate isolated deletion, post-delete persistence")
            assert not page_errors, page_errors
            context.close()

            # Restart the actual browser with the same isolated profile, then inspect mobile layout.
            context = playwright.chromium.launch_persistent_context(profile_dir, viewport={"width": 375, "height": 812}, **launch)
            page = context.pages[0] if context.pages else context.new_page()
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.set_default_timeout(15000)
            visit(page, "/history", "Calculation History")
            wait_for_count(page, 5)
            assert snapshot(page) == remaining
            no_horizontal_overflow(page)
            expect(page.get_by_role("link", name="View details", exact=True)).to_have_count(5)
            visit(page, "/", "Custom Keychain Pricing")
            expect(page.get_by_label("Model filament weight", exact=True)).to_be_visible()
            no_horizontal_overflow(page)
            page.get_by_role("button", name="Multicolor", exact=True).click()
            page.get_by_label("Number of colors", exact=True).select_option("3")
            fill(page, "Color 1 weight", "1.5")
            fill(page, "Color 2 weight", "2.5")
            fill(page, "Color 3 weight", "3.5")
            no_horizontal_overflow(page)
            page.get_by_role("button", name="Reset Calculator", exact=True).click()
            price(page, "0.00")
            visit(page, "/settings", "Pricing Settings")
            no_horizontal_overflow(page)
            expect(page.locator("#setting-filamentRate")).to_have_value("0.1")
            page.get_by_role("button", name="Restore Defaults", exact=True).click()
            restore = page.get_by_role("dialog", name="Restore official defaults?", exact=True)
            expect(restore).to_be_visible()
            restore.get_by_role("button", name="Restore Defaults", exact=True).click()
            expect(page.locator("#setting-filamentRate")).to_have_value("0.085")
            wait_for_count(page, 5)
            assert snapshot(page)["settings"]["filamentRate"] == 0.085
            # A saved record is still readable at mobile width after defaults are restored.
            retained_id = snapshot(page)["records"][0]["id"]
            visit(page, f"/history/{retained_id}")
            expect(page.get_by_text("Historical pricing settings", exact=True)).to_be_visible()
            no_horizontal_overflow(page)
            completed.append("Actual browser-restart persistence, mobile 375px layouts, touch controls, Restore Defaults")
            assert not page_errors, page_errors
            context.close()

    for check in completed:
        print(f"PASS: {check}")
    print(f"\n{len(completed)} browser acceptance groups passed; no uncaught browser errors.")


if __name__ == "__main__":
    run()
