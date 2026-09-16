# Optimisation notes

What changed in this pass, and what was deliberately left alone.

---

## Module split

Two files had grown to carry unrelated work, and every page paid for it.

**`js/inventory.js` (31 KB)** held both the Inventory report screen and a
~50-line `Master` category lookup. Six pages needed only the lookup and were
parsing the whole report screen to get it.

→ `js/master.js` (2.5 KB). Loaded everywhere; `inventory.js` now loads only on
the Inventory report page.

**`js/stocks.js` (27 KB)** held the stock maths (`Stock`, ~130 lines) and the
inward/outward entry form (`StockForm`, ~470 lines). Eleven pages need the
maths; two need the form.

→ `js/stock-core.js` (5 KB) and `js/stock-form.js` (22.5 KB). The form loads
only on `inward.html` and `outward.html`.

## Per-page script lists

Every page previously loaded a fixed block whether it used it or not. Each page
now lists only what it calls:

| Removed from | What |
|---|---|
| dashboard, inward, outward, audit-case | `xlsx.js` (11.9 KB) — no Excel export on those screens |
| every page except login and users | `data/users.js` (13.7 KB) — the seed is only read at sign-in and in user admin |
| dashboard, products, audit ×4 | `inventory.js` (29 KB) — replaced by `master.js` |
| 11 pages | `stock-form.js` (22.5 KB) |

**Result per page, JavaScript parsed:**

| Page | Before | After |
|---|---|---|
| dashboard.html | 214 KB | 148 KB |
| inward.html | 190 KB | 125 KB |
| stock-summary.html | 190 KB | 122 KB |
| products.html | 197 KB | 129 KB |
| audit-case.html | 226 KB | 163 KB |
| login.html | 108 KB | 94 KB |

Roughly a third off the largest pages, with no behaviour change and no
minification.

---

## What was not done, and why

**No minification or bundling.** It would cut another 40% of bytes, but it
needs a build step, and the whole point of this portal is that it runs from a
double-clicked `index.html` with nothing installed. Minified files are also
unreadable to whoever maintains this after you — the comments in `api.js` and
`auditapi.js` are load-bearing documentation.

**`data/master-categories.js` (15 KB) keeps its per-line comments.** They look
like waste — 111 comment lines naming each product. They are there so HO can
find and edit a classification without cross-referencing another file. That
file is meant to be edited by a person; stripping the comments would save 8 KB
and cost far more than that in confusion.

**No lazy loading of the audit modules.** `auditapi.js` (33 KB) loads on the
branch dashboard purely for the pending-queries card. Deferring it would need
dynamic `import()`, which browsers restrict on `file://` — the very mode this
portal is designed to run in.

**Nothing was compressed at rest.** These are static files on a LAN or a local
disk. Over SharePoint or IIS, enable gzip on the server and the same files drop
about 70% on the wire for free.

---

## If you want to go further

In rough order of value against effort:

1. **Serve over HTTP with gzip** rather than opening `file://`. Costs nothing,
   saves more than any code change here.
2. **Split `data/products.js` by category** if the master grows past a few
   hundred products. At 111 it is not worth it.
3. **Move to the Power Automate backend.** Once products, users and stock come
   from SharePoint lists, the three `data/*.js` seed files (33 KB) stop
   shipping to the browser at all.
4. **Add a build step** only if the portal ever goes to hundreds of users over
   a slow link. Below that the reading cost outweighs the byte saving.
