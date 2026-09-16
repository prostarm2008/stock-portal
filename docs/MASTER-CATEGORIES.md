# Master categories

Set by HO, August 2026, from the mapping supplied by DGM Operations. All 111
products matched by name — no gaps in either direction, and **nothing is left
as a guess**.

```
UPS                       → UPS                        23 products
Battery                   → SMF Batteries               17
                          → Lithium Batteries           19
Isolation Transformer     → Isolation Transformer        8
Servo Stabilizer          → Servo Stabilizer             6
Other equipment & spares  → Other equipment & spares    38
                                                       ───
                                                        111
```

Battery is the only master category with more than one subcategory, so it is
the only one that gets a "Battery total" column. The rest render as a single
line.

---

## What changed from the earlier version

Two master categories were **added**: Isolation Transformer and Servo
Stabilizer. Both were previously inside *Other equipment & spares*, which is
why that bucket has dropped from 52 products to 38.

Fourteen products moved out of Other as a result — eight isolation transformers
and six servo stabilizers, including the two whose names do not contain either
phrase:

- `ASSEMBLED PCB DIGITAL SERVO CONTROL CARD (INPUT PROTECTION) - 3PH - ADOLF`
- `EXPOERT DEMO SERVO STAB - 25KVA-PISL`

The thirteen products previously flagged as judgement calls are now confirmed
by HO. **The amber "counted on a judgement call" banner no longer appears** —
there is nothing left awaiting sign-off.

---

## The change was data-only, and the next one will be too

The earlier build hardcoded four categories in five places: the dashboard card
segments, the inventory filter, the branch-wise columns, the audit cycle scope
and the Excel headers. Adding two categories would have meant editing all five
and hoping none was missed — and one *was* missed on the first pass, leaving
the Excel Summary sheet with a stale four-column header while the screen showed
six. The totals still added up, so it would have shipped unnoticed.

Every screen now builds its category list from `tree` in
`data/master-categories.js`:

| What | Built from |
|---|---|
| Dashboard card segments and colours | `Master.keys()`, `Master.colour()` |
| Inventory filter, audit filter | `Master.optionsHtml()` |
| Branch-wise columns and Excel headers | `Master.tree()` |
| Audit cycle scope | `Master.keys()` |
| Excel template dropdowns and field spec | `Master.tree()`, `Master.keys()` |

**Adding a category is now a data change.** Add it to `labels`, `parents`,
`parentLabels`, `colours` and `tree`, point the products at it, reload. No code
edit anywhere.

---

## Editing

Open `data/master-categories.js`.

**To reclassify a product**, change its `master` value to one of
`UPS`, `SMF`, `LITHIUM`, `ISOTX`, `SERVO`, `OTHER`:

```javascript
"P047": { master: "SERVO", confirmed: true }  /* 3 KVA Servo Stabilizer */
```

**To add a category**, say Solar:

```javascript
labels:       { ..., SOLAR: "Solar equipment" },
parents:      { ..., SOLAR: "SOLAR" },
parentLabels: { ..., SOLAR: "Solar" },
colours:      { ..., SOLAR: "#0F7B4F" },
tree: [ ..., { parent: "SOLAR", children: ["SOLAR"] } ]
```

Then set the relevant products to `master: "SOLAR"`. It appears on the
dashboard, the inventory report, the audit filters and the Excel template
immediately.

A product added through Admin › Product master carries its own category on the
record and overrides this file, so new products never fall silently into Other.

---

## The "As tagged in the stock sheet" column

The Inventory report still shows what the original stock sheet called each
product, beside the category it now belongs to. Rows read
`Servo Stabilizer | Other equipment & spares` where the source sheet mis-tagged
an item. That is deliberate: the discrepancy stays visible until it is fixed at
source, rather than being quietly papered over.

---

## Faulty units

Unchanged. Products whose name contains *faulty* or *broken* are counted in the
totals and shown separately in an *of which faulty* column.

Still worth fixing at source: this reads the product name, which is weak. A
unit that fails after receipt keeps its good-stock name. Faulty belongs as a
status on the stock row, not a word in the product name.
