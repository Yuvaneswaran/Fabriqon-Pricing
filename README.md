# FABRIQON Studio

A complete custom 3D-printed keychain pricing workspace, built with Next.js, TypeScript, and Tailwind CSS. The Midnight Electric interface uses the FABRIQON Precision Mark, Space Grotesk headings, and Inter text.

Every calculation prices **one keychain in Malaysian ringgit (RM)**. There are no order quantities, quantity tiers, volume discounts, tax calculations, or currency conversions. See [the finalized pricing rules](docs/PRICING.md) for the formula and worked example.

## Run locally

Use Node.js 24 and npm 11. The lockfile records the installed dependency versions.

```sh
npm ci
npm run dev
```

Open the application on port 3000 in your local browser. No API key, account, database server, or environment variable is required. All fonts are bundled from Fontsource packages; building the application does not download fonts from Google.

For a production build:

```sh
npm run build
npm run start
```

`dev` and `start` bind to `0.0.0.0`. To select a different port, run `npm run dev -- --port 3001` or `npm run start -- --port 3001`.

## Use the workspace

1. Enter a calculation name. A nonempty name is required when saving.
2. Select single-color or multicolor printing. Multicolor supports 2–64 colors, each with an optional name and an individual model weight.
3. Enter printing time, additional filament-changing time, and any flushed, support, brim, and prime tower filament.
4. Choose an existing, simple custom, or complex custom design. The selling price and full cost breakdown update as inputs change.
5. Save the calculation to its browser-local history. **Load example** fills the official sample, which produces **RM18.50 with the default settings**.

History supports name search, printing-type and saved-date filters, sorting, detailed views, editing, duplication, deletion, JSON backup, and CSV export. Editing preserves the record's identity and creation date; **Save as New Calculation** creates another record.

**Reset Calculator** clears the current workspace without deleting saved history. **Restore Defaults** in Pricing Settings restores the official rates after confirmation and preserves historical calculations.

## Saved rates and browser storage

IndexedDB stores settings and calculation records in the browser. Each saved calculation contains its inputs, rates, formula version, results, notes, and timestamps. Changing the current settings does not rewrite earlier results. When editing or duplicating a saved calculation, its original rates are retained until **Apply current rates** is selected.

Storage belongs to the exact browser origin: scheme, hostname, and port. Another browser profile, another device, a changed deployment hostname, or a different local port has a separate history. Clearing site data or leaving a private-browsing session can remove saved work. There is no server-side backup or automatic cloud synchronization. Export JSON backups regularly and before moving to another origin.

### Backups and exports

- **Export JSON** includes the current settings and complete calculation snapshots in a versioned backup.
- **Import JSON** validates the entire backup and merges calculations atomically. Existing records and current settings remain unchanged. Conflicting record IDs receive new IDs, so importing the same backup again creates additional copies.
- JSON import is limited to **10 MiB** and **10,000 calculation records**. Unsupported versions, invalid values, and results that disagree with their saved inputs and rates are rejected before writing.
- **Export CSV** produces a spreadsheet-readable report. CSV is for reporting, not reimport. Formula-like text is escaped to prevent spreadsheet formula execution.

The settings included in a JSON backup are retained as reference data. Import intentionally leaves active pricing settings unchanged; use Pricing Settings if those rates should be applied to future calculations.

## Validate changes

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The Vitest suites exercise the finalized formula, decimal rounding boundaries, input validation, IndexedDB persistence, snapshot integrity, import merging, and export validation. IndexedDB tests use `fake-indexeddb`.

The optional browser smoke test uses Python's `playwright` package and system Chromium. Start the application in one terminal, then run:

```sh
npm run test:e2e
```

This requires the Python Playwright package and a Chromium executable to be installed in the test machine; they are not production application dependencies. The browser test exercises the application through its UI rather than starting a server itself.

## Project structure

```text
src/app/                  Next.js routes, global styles, and metadata
src/components/           Calculator, history, saved details, settings, and app shell
src/lib/types.ts          Shared models and official default settings
src/lib/pricing.ts        Versioned, independently testable pricing engine
src/lib/storage.ts        IndexedDB persistence and atomic record imports
src/lib/backup.ts         JSON validation, snapshot checks, and CSV serialization
src/lib/*.test.ts         Pricing, storage, and backup unit tests
public/brand/             Precision Mark and FABRIQON Studio SVG assets
tests/smoke.py            Browser smoke test
docs/PRICING.md           Finalized formula, defaults, precision, and example
```

Brand assets are `public/brand/precision-mark.svg`, `public/brand/precision-mark-mono.svg`, and `public/brand/fabriqon-studio.svg`. The application icon is `src/app/icon.svg`. The fonts are self-hosted through `@fontsource/inter` and `@fontsource/space-grotesk`.

## Deploy

For Vercel, import this Git repository, select the Next.js framework preset, and deploy. Use the repository root, the default build command `npm run build`, and Node.js 24. No application secrets or hosted database are needed.

For a Node.js host, install with `npm ci`, build with `npm run build`, and run `npm run start` behind the host's HTTPS reverse proxy. The platform should keep the Node process running and route traffic to its configured port. Do not use the development server for production.

Deploying the website does not upload browser histories. Each visitor's history remains in that visitor's IndexedDB storage on the deployed origin. To move saved calculations between local development and production, export a JSON backup from the original origin and import it on the destination origin.

## Stack

Next.js 16.4.3 · React 19 · TypeScript · Tailwind CSS 4.3.3 · Decimal.js · IndexedDB via `idb` · Zod · Vitest · Lucide icons.
