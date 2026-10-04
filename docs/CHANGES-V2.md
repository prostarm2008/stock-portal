# Changes in this build

Four changes, nothing else touched. The SharePoint login code is as you left it.

## 1. "Purchase In" added

Inward categories are now, in order:

```
Purchase In · Demo In · Sales Return In · Stock Transfer In · Opening Stock In
```

## 2. Outward may be back-dated

A branch can now set **Date of outward done** to any past date, the same as
inward. Future dates stay blocked for everyone.

**Worth knowing:** a back-dated issue changes a balance that reports, stock
summaries and audit counts may already have been run against. The portal
records the entry date separately and it cannot be edited, so a back-dated
document is always identifiable — the *Movement date* and *Date of entry at
portal* columns sit side by side in the detail export. If a branch comes up
short at a count and back-dates an issue to explain it, that gap is what shows
it.

## 3. Two outward categories added

```
Demo Out · Sales Out · Stock Transfer Out ·
Stock Out for Warranty Support · Stock Out for Consumption
```

## 4. Bulk upload on Stock Outward

The bulk module now takes a direction. One module serves both screens, so they
cannot drift apart:

| | Inward | Outward |
|---|---|---|
| Dialog | Bulk inward upload | Bulk outward upload |
| Column A | Date of Inward Done * | Date of Outward Done * |
| Column B | Inward Category * | Outward Category * |
| Dropdown list | the 5 inward categories | the 5 outward categories |
| Posts as | `txnType: "IN"` | `txnType: "OUT"` |

An inward category on an outward file is rejected, and the other way round:

```
row 7  outward category "Purchase In" is not one of: Demo Out, Sales Out,
       Stock Transfer Out, Stock Out for Warranty Support,
       Stock Out for Consumption
```

The category is **mandatory** in both directions. A blank row is rejected, not
defaulted.

---

## Two bugs found while testing this

**Column aliases were missing.** The outward template's headings —
*Date of Outward Done*, *Outward Category* — were not listed as aliases of the
inward ones, so the parser never found those two columns. Every date silently
fell back to today and every category came through blank, and the upload still
reported success. Both headings are now aliases.

**The mandatory check was absent in this build.** A blank category was accepted
and posted with an empty category field. Now rejected.

---

## Flow and structure

Nothing changed in the request or response shapes, so **your flows need no
edits** — except that `MovementCategory` will now carry the new values.

```
Branch user
   │
   ├── Stock inward ──┬── single document (form)
   │                  └── Bulk upload ── template → validate → preview → post
   │                                                                      │
   ├── Stock outward ─┬── single document (form)                          │
   │                  └── Bulk upload ── same module, direction = OUT ─────┤
   │                                                                      ▼
   └──────────────────────────────────────────────── createTxn flow ── SharePoint
                                                      one call per document
```

A document is one call to `createTxn`, carrying:

```jsonc
{
  "header": {
    "batchId": "DOC-...",            // idempotency key
    "date": "2026-09-12",            // when the stock moved
    "branch": "WB_Kolkata",
    "txnType": "OUT",                // or "IN"
    "movementCategory": "Sales Out",
    "challanNo": "SO/101",
    "invoiceNo": "INV-55",
    "partyName": "SBI Kolkata",
    "remarks": ""
  },
  "lines": [ { "productId": "P001", "productName": "...", "qty": 10 } ]
}
```

Rows group into documents on **branch + category + challan + date**, so a file
carrying several categories becomes several correctly-tagged documents.

### Check before you roll out

The `MovementCategory` column in SharePoint must accept the new values. If it
is a **Choice** column, add `Purchase In`, `Stock Out for Warranty Support` and
`Stock Out for Consumption` to its choices — otherwise `createTxn` will fail
with a 502 on every document using them. A single line of text column needs no
change.
