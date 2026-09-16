# Adding a product

**Admin › Product master › Add product.** HO Admin only.

Worked example — adding *Battery 105AH Exide*:

| Field | Value | Notes |
|---|---|---|
| Product name | `Battery 105AH Exide` | Write it as it appears on the supplier challan |
| Master category | Battery — SMF Batteries | Decides where it counts on the Inventory report |
| Product code | *leave blank* | Next in the series is used — P112 |
| Sub-group | `SMF Battery` | Matches the existing SMF lines |
| Unit of measure | `NOS` | |
| Reorder level | `4` | Below this, it flags as low stock |

Save, and it is immediately in the inward and outward dropdowns at every
branch, and counted under SMF Batteries on the Inventory report. No file edit,
no restart.

---

## Why HO only

Twenty branches adding their own lines would give you *Battery 105AH Exide*,
*105 AH exide smf* and *Exide SMF 105* as three separate products, each with
its own balance, and no report able to add them together. Your existing master
already carries two duplicates from exactly this (`Eaton 9E-IN 2000XL` and
`Connector -HAL` each occupy two column blocks in the source sheet).

Branch users cannot open the page and it does not appear in their sidebar. A
branch that needs a new product asks HO.

---

## The duplicate guard

As you type the name, the form checks it against the existing master and warns
on anything sharing 60% of its words. Typing *Battery 105AH Exide* raises:

> Similar products already in the master: Battery 100AH -Exide (P001); Battery
> 120AH Exide (P003); Battery 120AH Exide W (P004); Battery 150AH Exide (P005).

It is a warning, not a block — 105AH really is a different battery from 100AH.
But read the list before saving. If one of them is the same item under another
spelling, use that one.

An **exact** name match, ignoring case, is refused outright.

---

## Master category is mandatory

The form will not save without it. This is deliberate.

Products classify from `data/master-categories.js`, which was built from the
111 names in the original sheet. A product added after that file was written
is not in it, so without an explicit category it would fall into **Other** —
and a new Exide battery quietly counted as "Other equipment & spares" is worse
than no report at all, because the number still looks right.

A product added here stores its own master category on the record, which takes
precedence over the static map, and is marked confirmed so it never appears in
the report's amber review banner.

---

## Editing an existing product

Same screen, **Edit**. You can change the name, sub-group, UOM, reorder level
and master category.

The product code is fixed once transactions reference it. The dialog shows what
is at stake before you change anything — how many units are on hand, across how
many branches, and how many movements are recorded.

**Renaming updates the master, but transactions already saved keep the name
they were entered with.** That is on purpose: a challan from March recorded
what was written on it in March, and rewriting history to match a later
spelling would make the audit trail disagree with the paperwork in the file.

Reclassifying is retrospective, though — moving a product from Other to UPS
moves every unit of it, past and present, on the Inventory report.

---

## Bulk loading

For more than a handful, **Export master** gives a spreadsheet of all 111
products with codes, categories, reorder levels and on-hand quantities. Fill in
the new rows, and either add them through the form or regenerate
`data/products.js` and `data/master-categories.js` from the sheet.

Worth doing at the same time: the reorder levels all default to **2**, which
was a placeholder, not a decision. A 105AH battery and an SNMP card almost
certainly do not have the same reorder point.

---

## On the shared backend

Products live in the `Products` SharePoint list. Add a `saveProduct` flow —
create-or-update, gated on the caller being an HO Admin — and put its URL in
`flows.saveProduct` in `js/config.js`. Two extra columns are needed on the
list: `Master` (`UPS` | `SMF` | `LITHIUM` | `OTHER`) and `MasterConfirmed`
(yes/no). The screen needs no other change.
