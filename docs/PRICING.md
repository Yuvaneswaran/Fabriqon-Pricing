# Finalized keychain pricing

Current formula version: **`keychain-v2`**. Machine operation charges use **printing time only**. The filament-changing controls and charge were removed at the owner's request; older `keychain-v1` snapshots remain supported for history and backup compatibility. All currency amounts are in **Malaysian ringgit (RM)**. One calculation represents **one keychain**; no quantities, volume discounts, tax, or order-level calculations are applied.

## Official defaults

| Setting | Default | Applies to |
| --- | ---: | --- |
| Filament rate | RM0.085 / g | All model and additional filament |
| Printing hourly rate | RM3.00 / h | Printing time |
| Keyring and jump ring | RM0.15 | One keychain |
| Packaging plastic | RM0.03 | One keychain |
| Labor | RM0.50 | One keychain |
| Profit markup | 50% | Production cost |
| Upward rounding increment | RM0.50 | Final selling price |

Designing fees are fixed by design type:

| Design type | Fee |
| --- | ---: |
| Existing design | RM0.00 |
| Simple custom design | RM5.00 |
| Complex custom design | RM10.00 |

Rates, fixed production costs, markup, and rounding increment can be changed in Pricing Settings. Designing fees are applied after markup and are not editable rates.

## Formula

```text
model grams      = sum of every color's model weight
additional grams = flushed + support + brim + prime tower grams
total grams      = model grams + additional grams

filament cost = total grams × filament rate

printing hours = entered printing hours + entered printing minutes / 60
printing cost  = printing hours × printing hourly rate
machine cost   = printing cost

fixed cost      = keyring cost + packaging cost + labor cost
production cost = filament cost + machine cost + fixed cost
profit          = production cost × markup percent / 100
price before design = production cost + profit

unrounded price = price before design + designing fee
final price     = ceil(unrounded price / rounding increment) × rounding increment
```

The markup is a percentage of production cost, not a target selling-price margin. The designing fee is added **after** that markup. The upward rounding adjustment is reported separately; the displayed profit component is the configured production-cost markup.

Enter the printing time in hours and minutes. There is no separate filament-changing time or rate in the calculator or settings. New calculations charge printing time only, including when editing or duplicating an older record. All additional filament categories remain included in either printing mode. Enter each filament category once to avoid counting the same grams twice.

## Official example

Inputs: 20 g model filament, 2 g flushed filament, 1 g support, 1 g brim, no prime tower, 2 hours printing, and a simple custom design. Use the official defaults.

| Step | Calculation | Result |
| --- | --- | ---: |
| Total filament | 20 + 2 + 1 + 1 | 24 g |
| Filament cost | 24 × RM0.085 | RM2.04 |
| Printing cost | 2 × RM3.00 | RM6.00 |
| Fixed cost | RM0.15 + RM0.03 + RM0.50 | RM0.68 |
| Production cost | RM2.04 + RM6.00 + RM0.68 | RM8.72 |
| Profit markup | RM8.72 × 50% | RM4.36 |
| Price before design | RM8.72 + RM4.36 | RM13.08 |
| Simple design fee | Added after markup | RM5.00 |
| Unrounded selling price | RM13.08 + RM5.00 | RM18.08 |
| Final selling price | Rounded upward to the next RM0.50 | **RM18.50** |

## Precision and rounding

The engine retains exact decimal fractions throughout the formula, including fractional grams and minutes divided by 60. It does not round material cost, time cost, production cost, or markup to two decimal places before continuing.

The final ceiling uses Decimal.js with sufficient precision to retain the exact rounding boundary. A value already equal to an increment remains unchanged. A positive amount above an increment rounds to the next multiple. Exact decimal handling also prevents binary floating-point artifacts such as `0.1 + 0.2` from adding an unintended increment.

The UI formats currency for display. A breakdown shown to two decimal places can therefore look slightly different from adding its individually formatted rows; the selling-price formula uses the unrounded values. JSON and CSV exports retain the stored numeric values.

For example, 1 g at RM0.085 plus the default RM0.68 fixed costs produces RM0.765 production cost. Its 50% markup is RM0.3825, giving RM1.1475 before upward rounding to RM1.50. Rounding those components prematurely would change the formula.

## Input validation

- Single-color mode requires exactly one color. Multicolor mode requires 2–64 colors. Color names are optional, with a maximum of 80 characters.
- Grams, hourly rates, and fixed costs must be finite, nonnegative values no greater than 1,000,000.
- Hours must be whole numbers from 0 through 100,000. Minutes must be whole numbers from 0 through 59.
- Markup must be between 0% and 10,000%. The rounding increment must be positive and no greater than RM1,000,000.
- All-zero inputs are valid. Default fixed costs still apply, so a zero-filament, zero-time existing design is RM1.02 before rounding and RM1.50 after rounding.
- Results exceeding the engine's safe monetary range are rejected instead of displaying unreliable currency values. NaN, infinity, negatives, invalid modes, and invalid design types are rejected.
- Saving requires a nonempty calculation name, up to 160 characters. Notes may contain up to 2,000 characters.

## Historical snapshots

Saving captures the complete inputs, settings, formula version, full calculated breakdown, name, notes, creation time, and update time. Changing global settings never silently recalculates an existing record.

Existing `keychain-v1` records retain their original prices, including any historical filament-changing charge. Their historical detail views and JSON/CSV exports preserve those original values. New records use `keychain-v2`, which excludes filament-changing time even if deprecated fields are present. Editing or duplicating a legacy record clears that time and calculates its new price with printing time only; the interface explains the change. Opening a record does not overwrite it. **Update Existing Calculation** explicitly replaces the stored result with the new formula, while **Save as New Calculation** leaves the original snapshot intact.

Editing and duplication start with the original rate snapshot. **Apply current rates** explicitly recalculates with the current settings. Updating an existing calculation preserves its ID and original creation time; saving as new or duplicating creates a separate record. Restoring default settings leaves saved snapshots unchanged.

JSON import validates a saved result against its own inputs and rates with the versioned engine. Imports merge records without changing active settings. ID collisions are remapped rather than overwriting existing records.

## Verification

```sh
npm test -- src/lib/pricing.test.ts
npm test -- src/lib/storage.test.ts src/lib/backup.test.ts
npm run lint
npm run typecheck
npm run build
```

The pricing suite includes the RM18.50 example, multicolor and additional weights, printing-only operation costs, legacy snapshot compatibility, all design fees, zero inputs, custom rounding, exact increment boundaries, recurring-minute precision, and invalid or unsafe inputs. Storage and backup suites cover persistence, snapshot integrity, transactional imports, malformed backups, and CSV escaping.
