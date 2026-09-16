# Inventory report

Two questions, deliberately kept apart.

**"What is on hand right now?"** — the dashboard, and the Summary and Product
Balances sheets. A closing balance.

**"What moved, and on whose paperwork?"** — the Transaction Detail sheet. Date,
Challan No., Invoice No., Party Name and Remarks live here, because those
belong to a *movement*, not to a balance. A balance of 27 batteries at
MH_Mumbai has no challan number; it is the residue of every challan that ever
touched that product.

This matters when the two are compared. **They tie only when the date range
covers every movement ever recorded.** Narrow the movement dates to one week
and the detail sheet will show that week's traffic while the balances still
show everything on the shelf. That is correct behaviour, not a defect. If you
need them to agree, set *Movements from* to a date before the portal went live.

---

## Category structure

```
UPS ............................ 23 products
Battery
   ├─ SMF Batteries ............ 17 products
   └─ Lithium Batteries ........ 19 products
Other equipment & spares ....... 52 products
```

Battery is a master category with two subcategories; UPS and Other have a
single child each, so they render as one line. The structure lives in
`data/master-categories.js` under `tree`. See `MASTER-CATEGORIES.md` for how
products were placed and which 13 are awaiting HO sign-off.

Grand total always reconciles: UPS + Battery + Other. Other is shown rather
than hidden, because dropping 52 products would leave a grand total that does
not match the stock on the shelf.

---

## Who sees what

| | Branch user | Regional Manager | HO Admin |
|---|---|---|---|
| Dashboard | own branch | own zone | all branches, consolidated |
| Branch filter | locked to their branch | their zone's branches | any branch, or all |
| Excel export | own branch only | own zone only | everything |

Scope is applied to the data before the report is built, so it carries through
to the exported file. A branch user's workbook contains their branch and
nothing else.

---

## The Excel workbook

One `.xlsx`, three sheets. Header row frozen and bold on each.

### Sheet 1 — Summary

Category-wise block showing the master/subcategory tree with counts, then a
branch-wise block with a column per category and a grand total row. This is the
dashboard, in a form you can paste into a review deck.

### Sheet 2 — Transaction Detail

Every column you asked for, one row per movement line, **autofiltered** so
every column has a dropdown:

| Column | Source |
|---|---|
| Date | movement date |
| Branch Name | branch code |
| Challan No. | document header |
| Invoice No. | document header |
| Party / Vendor Name | document header |
| Remarks | line remark, falling back to the document remark |
| Product Category | UPS / Battery / Other |
| Product Subcategory | UPS / SMF Batteries / Lithium Batteries / Other |
| Product Name / Description | as printed in the product master |
| Product Code | P001 … P111 |
| Movement | Inward or Outward |
| Qty | quantity on that line |
| Qty signed | inward positive, outward negative |

Sorted branch → category → subcategory → product → date, so it groups on sight
and pivots cleanly.

**Two quantity columns on purpose.** *Qty* is what the paperwork said, which is
what you check a challan against. *Qty signed* nets inward against outward, and
is the one that sums to the stock on hand. A single column cannot do both:
totalling raw Qty counts an outward of 5 as +5 and overstates the position.

### Sheet 3 — Product Balances

Product-wise closing balance, grouped branch → category → subcategory with a
**subtotal row per group** and a grand total at the end. A *Condition* column
marks faulty units.

No autofilter on this sheet, deliberately — filtering a sheet that contains
subtotal rows hides some detail lines while leaving the subtotals visible, and
the figures stop adding up. Sheet 2 is the one to filter and pivot.

### Reconciliation

Across a full date range, all three grand totals agree. Verified on a seeded
data set: Summary 250, Transaction Detail signed 250, Product Balances 250,
against a gross movement figure of 260 — the 10-unit gap being one outward of
5 counted once as +5 and once as −5.

---

## Filters

| Filter | Affects |
|---|---|
| Branch | everything |
| Master category | everything |
| Inventory (in stock / all / low / faulty) | dashboard and the balance sheets |
| Movements from / to | the Transaction Detail sheet only |

The date range is labelled on screen as detail-only, because a date range
cannot narrow a closing balance — the balance is whatever is there now.

---

## Format

Genuine `.xlsx` — Office Open XML in a ZIP, written by `js/xlsx.js` with no
external library, so the portal still runs offline from a double-clicked
`index.html`. Every export in the portal now uses it, not just this report.

ZIP entries are stored rather than deflated, which makes files a few times
larger than Excel would write. For an inventory export that is a fair trade
against shipping a compression library to run one report. A 19-line detail
sheet with three worksheets comes to roughly 50 KB.
