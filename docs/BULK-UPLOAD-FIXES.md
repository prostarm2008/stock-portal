# Why bulk upload was failing

Three separate faults, found by running this build against stubbed flows.

## 1. Every real Excel file was being read wrong — the main one

Excel writes an empty-but-styled cell as a self-closing tag:

```xml
<c r="H3" s="6"/>
```

The parser's attribute match was greedy, so it swallowed the closing slash and
ran on to the next `</c>`, **merging every empty cell into its neighbour and
shifting all later columns left.**

Row 3 of a real file parsed as:

```
["46274","MH_Mumbai","1 KVA Isolation Transformer","P037", ... ,"5","OK - ready to upload"]
                                                                     ↑ read as Challan No
```

Challan, Invoice, Party and Remarks all came from the wrong columns. Quantity
sat before the first empty cell, so totals still looked right — which is why it
half-worked instead of failing loudly.

One character: the attribute group is now lazy, `[^>]*?`.

## 2. Two lines per flow call

`bulk-upload.js` chunked documents at **2 lines each**. A 60-row upload became
30 calls to `createTxn`. That does the opposite of what it was meant to:

- more calls is exactly what triggers Power Automate throttling
- one challan split across several documents, so the audit trail no longer
  matches the paperwork

Now `APP_CONFIG.bulkLinesPerCall`, default **20**, which keeps a normal challan
whole. With `bulkPostGapMs` (default 400ms) there is a pause between documents,
because a throttled run that half-succeeds is far more work to unpick than a
slow one.

## 3. The login reply was never case-converted

Lists were converted (`ProductName` → `productName`) but a **single object** —
which is what `login` returns — passed through untouched. SharePoint returns
`FullName`, `Role`, `Branch`; the portal read `fullName`, `role`, `branch`, and
got `undefined` for all three.

The session then looked signed in but had no branch, so **every upload row was
rejected** and the branch dropdown came up empty. Fixed.

## Also fixed while in here

**Three audit pages were dead.** The HTML called `window.Audit.mountWorkspace()`,
`window.Audit.mountCycle()` and `window.AuditReports.mount()`; the JavaScript
defines `AuditWorkspace`, `AuditCycle` and `AuditDashboard`. Any Stock Auditor
signing in hit a blank page. Corrected.

**Flow errors now quote the flow's own message** instead of a bare status code,
with a hint pointing at the run history.

---

## Verified

A template filled the way a branch would, saved by Excel, uploaded through this
build:

```
Preview   : 5 rows ready · 3 documents · 203 units · 0 rejected
Sent      : WB_Kolkata | Opening Stock In   | OPEN/2026-09 | 3 lines | 171
            MH_Mumbai  | Demo In            | DEMO/44      | 1 line  |   2
            TN_Chennai | Stock Transfer In  | TR/771       | 1 line  |  30
```

Party names, challans and categories all land in the right fields, and one
challan stays one document.

23 page loads across HO Admin, Branch and Stock Auditor: clean.

---

## Still on your side

**CORS.** `tools/server.js` is a local proxy that works around it in
development. On GitHub Pages there is no proxy — the browser calls Power
Automate directly, and the flow's Response action must return:

```
Access-Control-Allow-Origin: https://<your-org>.github.io
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: POST, OPTIONS
```

Without those, every call fails before it leaves the browser, no matter what
the portal does.

**502 from createTxn.** That is the flow erroring, not the file. The portal now
shows the flow's message; a missing `MovementCategory` or `EntryDate` column on
the Transactions list is the likeliest cause, since both fields are recent.

**Bump the build stamp after any change.** It is `2026.09.15a` now, shown in
the sign-in footer. GitHub Pages caches hard.
