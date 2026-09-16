# Moving to the shared backend

## Read this before you start

The brief asked for "Power Automate Authentication, Power Automate Database,
Power Automate Hosting". Power Automate is none of those three — it is a
workflow engine. It has no user directory, no tables of its own and no place to
serve a website from. Anyone who tells you otherwise will hand you something
that breaks in month two.

What actually works, using only the Microsoft 365 licences Prostarm already
pays for:

| Need | What provides it |
|---|---|
| Database | **SharePoint lists** (or Dataverse, if you have Power Apps licences) |
| API between portal and data | **Power Automate**, HTTP-triggered flows |
| Hosting | **SharePoint site assets library**, or IIS on an HO server |
| Authentication | **Microsoft Entra ID** (the Office 365 login staff already use) |

Power Automate stays in the picture, exactly where it is good: as the layer
that reads and writes the lists and enforces the rules. That is what the
`powerautomate` adapter in `js/api.js` already talks to.

There is a cheaper middle option worth considering first — see the last section.

---

## Step 1 — Create the SharePoint lists

On a SharePoint site, e.g. `https://prostarm.sharepoint.com/sites/StockPortal`.

### List: `Products`

| Column | Type | Notes |
|---|---|---|
| Title | Single line | use for `productId`, e.g. `P001` |
| ProductName | Single line | indexed |
| Category | Choice | 8 values from the stock sheet |
| UOM | Single line | default `NOS` |
| ReorderLevel | Number | default 2 |

Seed it from `data/products.js` — 111 rows.

### List: `Branches`

| Column | Type |
|---|---|
| Title | Single line (`branchCode`) |
| BranchName | Single line |
| State | Single line |
| Zone | Choice |

Seed from `data/branches.js` — 20 rows.

### List: `Stocks`

| Column | Type | Notes |
|---|---|---|
| Title | Single line | `branchCode\|productId` — **enforce unique** |
| Branch | Single line | indexed |
| ProductId | Single line | indexed |
| ProductName | Single line | |
| Category | Single line | |
| CurrentBalance | Number | |
| UpdatedAt | Date and Time | |

The unique Title is what stops two simultaneous entries creating two balance
rows for the same product. Set it under List settings → Columns → Title →
Enforce unique values.

### List: `Transactions`

| Column | Type |
|---|---|
| Title | Single line (`transactionId`) |
| BatchId | Single line, indexed — groups the lines of one challan |
| TxnDate | Date only |
| ChallanNo | Single line |
| InvoiceNo | Single line |
| Branch | Single line, indexed |
| Zone | Single line |
| TxnType | Choice: `IN`, `OUT` |
| ProductId | Single line, indexed |
| ProductName | Single line |
| Category | Single line |
| Qty | Number |
| PartyName | Single line |
| Remarks | Multiple lines |
| EnteredBy | Single line |
| EnteredByName | Single line |

Never allow edit or delete on this list. Corrections are a reversing entry, not
an edit — that is what keeps the audit trail worth anything.

### List: `AuditLog`

| Column | Type |
|---|---|
| Title | Single line (`auditId`) |
| Action | Single line |
| Entity | Single line |
| Branch | Single line |
| ProductName | Single line |
| Qty | Number |
| OldStock | Number |
| NewStock | Number |
| ActorUser | Single line |
| ActorName | Single line |
| ActorRole | Single line |
| Document | Single line — the challan or invoice this line came from |

### List: `Users`

Only needed if you are **not** using Entra ID sign-in. Columns mirror
`data/users.js`. If you go the Entra route, drop `PasswordHash` entirely and
key off UPN.

---

## Step 2 — Build the flows

Seven flows, all **"When an HTTP request is received"**, method POST. Copy each
generated URL into `flows` in `js/config.js`.

### `createTxn` — the one that matters

One request carries a whole document: a header and its product lines. Every
line is validated before anything is written, so a challan posts whole or not
at all. A half-posted challan leaves balances nobody can reconcile.

```
Trigger: HTTP request
  Schema: { header: { date, challanNo, invoiceNo, branch, zone, txnType,
                      partyName, remarks },
            lines:  [ { productId, productName, category, qty, remarks } ],
            actor:  { username, role } }

1. Get items — Users
     Filter: Username eq '@{triggerBody()?['actor']?['username']}'
2. Condition — ACCESS CHECK
     Reject unless:
       role is HO_ADMIN
       OR (role is BRANCH_USER AND user's Branch equals header.branch)
     If rejected → Response 403
        { "error": "Your role cannot post entries for this branch." }
3. Condition — lines array is not empty
     Else → Response 400 { "error": "Add at least one product line." }

--- PASS ONE: validate every line, write nothing ---

4. Initialize variable  projected  (Object)  = {}
5. Initialize variable  plan       (Array)   = []
6. Initialize variable  failure    (String)  = ''
7. Apply to each  line in lines            << set Concurrency to 1 >>
     a. Condition: qty is an integer above zero
          Else set failure = 'Line N: quantity must be a whole number above zero.'
     b. Condition: projected already holds this productId?
          Yes → before = projected[productId]
          No  → Get items on Stocks, filter
                Title eq '@{header.branch}|@{line.productId}'
                before = first()?['CurrentBalance']  (0 if empty)
     c. Compose after =
          if(equals(header.txnType,'IN'), add(before, qty), sub(before, qty))
     d. Condition: txnType is OUT and after < 0
          Set failure = 'Line N: only @{before} in stock at @{header.branch}.'
     e. Set projected[productId] = after
        Append to plan: { productId, productName, qty, before, after }

8. Condition — failure is not empty
     → Response 409 { "error": "@{variables('failure')}" }
     and STOP. Nothing has been written.

--- PASS TWO: write ---

9.  Compose batchId = concat('DOC-', utcNow('yyyyMMddHHmmssfff'))
10. Compose stamp   = utcNow()
11. Apply to each  item in plan            << Concurrency 1 >>
      a. Create item — Transactions
           BatchId = batchId, plus every header field on each row
      b. Condition: balance row exists for branch+product?
           Yes → Update item — Stocks, CurrentBalance = item.after
           No  → Create item — Stocks
      c. Create item — AuditLog
           Document = coalesce(header.challanNo, header.invoiceNo, batchId)
           OldStock = item.before, NewStock = item.after
12. Response 200
      { "batchId": ..., "lineCount": ..., "totalQty": ...,
        "lines": [ { productName, qty, oldBalance, newBalance } ] }
```

**Why the two passes.** Pass one touches nothing, so a bad line on row 7 of a
ten-line challan costs the user a corrected quantity rather than an
unpickable half-posted document. It also lets the error name the offending
line, which is what the portal shows.

**The `projected` variable is what makes duplicate lines correct.** If the
same product appears twice on one challan — which real invoices do — reading
the stored balance both times would post the second line against a stale
figure. Carrying the running value forward gives 10 → 17 → 20 rather than a
silent 13.

**Concurrency.** Set the trigger's Concurrency Control to 1, so two branch
users saving at the same moment queue rather than interleave between pass one
and pass two. At Prostarm's volume the queue never builds. The unique `Title`
on Stocks is the backstop: a losing Create item fails outright instead of
quietly duplicating the balance row, so add a Retry policy on that action to
re-run down the update path.

### The six read flows

`listProducts`, `listStock`, `listTxns`, `listAudit`, `listUsers` are each:
Get items → Select (rename columns to the JSON shape the portal expects) →
Response. Return `{ "value": [...] }`.

Two things to get right:

- **Set the pagination threshold to 5000** on every Get items action, or you
  silently get the first 100 rows and balances look wrong.
- **Filter server-side, not in the portal.** Pass `branch` and a date range in
  the request body and put them in the OData filter. A year of transactions
  across 20 branches is a lot to ship to a phone.

`saveUser` is Create-or-Update on the Users list, gated on the caller being an
HO Admin.

---

## Step 3 — Point the portal at the flows

In `js/config.js`:

```javascript
backend: "powerautomate",

flows: {
  login:        "https://prod-xx.westindia.logic.azure.com:443/workflows/...",
  listUsers:    "...",
  saveUser:     "...",
  listProducts: "...",
  listStock:    "...",
  listTxns:     "...",
  createTxn:    "...",
  listAudit:    "..."
}
```

Nothing else changes. Every screen already goes through `window.API`.

---

## Step 4 — CORS

A flow URL called from a browser page needs the response to allow the origin.
Add these headers to every Response action:

```
Access-Control-Allow-Origin:  https://prostarm.sharepoint.com
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: POST, OPTIONS
```

Name the exact origin. `*` on a URL that contains its own access key is an open
door.

---

## Step 5 — Hosting

**SharePoint (simplest).** Upload the whole folder to Site Assets and open
`index.html` from there. Staff are already signed into Microsoft 365, so
network access is controlled for you.

**IIS on an HO server.** Copy the folder into `C:\inetpub\wwwroot\stockportal`,
add a site in IIS Manager, bind to port 443 with a certificate. Branches reach
it over the VPN.

Either way it is static files — no runtime, no app pool settings, no
dependencies to patch.

---

## The security problem you must not skip

The flow URLs contain a SAS key in the query string. Anyone who opens DevTools
on the portal can read them out of `config.js` and then call `createTxn`
directly with any branch they like.

Three ways out, in order of effort:

1. **Entra ID authentication on the flows.** In the trigger settings, restrict
   to "Specific users in my tenant". Callers then need a token, and the SAS key
   alone gets them nothing. This is the right answer.
2. **Azure API Management** in front of the flows, validating a JWT. Better
   still, costs more.
3. **Accept it for an internal pilot**, on the understanding that the audit
   trail tells you who did what and the population is 30 named employees.
   Do not run this way once real stock values are involved.

Whichever you pick: the rules in `js/auth.js` are a convenience for the user
interface. The copies inside `createTxn` are the ones that actually protect the
data. Keep both in step — `docs/SECURITY-RULES.md` lists them side by side.

---

## The cheaper middle option

If setting up seven flows and Entra auth is more than this needs right now,
there is a step in between that gets branches sharing data today:

**Run the portal in local mode on one HO machine**, and have branches send
their day's entries in through the existing channel. HO enters them. You get
the balances, the dashboard, the reports and the audit trail immediately, with
no infrastructure at all, and you find out what the branches actually need from
the forms before you build the backend around them.

Two weeks of that will tell you more about the requirement than any spec
review. Then build the flows.
