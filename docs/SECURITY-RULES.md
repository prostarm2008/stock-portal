# Security rules

Every rule appears twice: once in the browser, where it shapes what the user
sees, and once on the server, where it actually holds. This file lists both so
they can be kept in step.

**The browser copy is not security.** Anyone who opens DevTools can change
their own session object and reach any screen. That is true of every
client-side application and no amount of obfuscation changes it. The version
that protects the data is the one inside the Power Automate flows.

---

## The rules

| # | Rule | Browser | Server |
|---|---|---|---|
| 1 | Only a signed-in user reaches any screen but login | `Auth.require()` at the top of every page module | Flow rejects a request with no valid caller |
| 2 | A Branch User sees only their own branch | `RBAC.visibleBranches()` | OData filter `Branch eq '<user branch>'` |
| 3 | A Regional Manager sees every branch in their zones | `RBAC.visibleBranches()` | Filter built from the user's zone list |
| 4 | An HO Admin sees everything | `RBAC.visibleBranches()` | No filter |
| 5 | A Regional Manager cannot write | `canWrite: false` on the role | `createTxn` rejects role `REGIONAL_MANAGER` with 403 |
| 6 | A Branch User writes only to their own branch | `RBAC.canWriteBranch()`, checked on submit | `createTxn` compares `actor.branch` to `txn.branch` |
| 7 | Quantity is a whole number above zero | Form validation + `API.createTxn` | `createTxn` step 4 |
| 8 | Outward never takes a balance below zero | `API.createBatch` projects every line and refuses before writing | `createTxn` pass one, against the stored balance |
| 8a | A document posts whole or not at all | All lines validated before any write | Pass one validates, pass two writes |
| 9 | Users and Audit are HO Admin only | Pages absent from the role's `pages` list; `Auth.require()` redirects | `saveUser` and `listAudit` check the caller's role |
| 10 | Every balance change is recorded | Audit row written in the same operation | `createTxn` step 11 |
| 11 | Transactions are never edited or deleted | No edit path exists in the interface | List permissions: contribute, no edit, no delete |

Rules 6, 8 and 8a are the ones that matter most. Rule 6 is what keeps one branch out
of another's stock. Rule 8 is what keeps the balances believable — without it,
a mistyped quantity turns into a negative balance that someone has to explain
at the next stock audit. Rule 8a is what stops a rejected challan leaving
three of its eight lines posted.

---

## Passwords

Stored as SHA-256 hashes, never as plain text — including in the generated
`data/users.js`.

The hash is computed in JavaScript rather than through `crypto.subtle`, because
browsers disable the Web Crypto API on `file://` pages and the portal has to
work when someone just double-clicks `index.html`.

Be clear about what this does and does not do. It stops a password sitting
readable in browser storage or in a file that gets emailed. It is **not**
password security: there is no salt, no key stretching, and a plain SHA-256 of
a common password is recovered from a rainbow table in seconds. Real password
handling means one of these, in order of preference:

1. **Entra ID sign-in.** Staff use the Microsoft 365 login they already have,
   and this portal stores no passwords at all. Multi-factor comes free.
2. Server-side hashing with bcrypt or Argon2, if you must keep your own
   accounts.

Option 1 removes an entire category of problem for less work than option 2.

---

## Session handling

Held in `sessionStorage`, so it is gone when the tab closes and is not shared
with other tabs. Idle sessions expire after 120 minutes
(`IDLE_MINUTES` in `js/auth.js`).

Sign-in and sign-out are both written to the audit trail.

---

## Threats this design does not cover

Worth naming, so nobody is surprised later.

- **A user tampering with their own session.** Only server-side checks stop
  this. Until the flows are in place with Entra auth, treat the local rules as
  guard rails rather than a lock.
- **Flow URLs leaking.** The SAS key sits in `config.js`, readable by anyone
  with the portal open. Entra authentication on the trigger is the fix.
- **Two people writing the same balance at once.** Handled by flow concurrency
  control plus a unique key on the Stocks list. See the setup guide.
- **A wrong entry.** Nothing prevents someone typing 100 instead of 10. The
  audit trail is what makes it findable, and a reversing entry is the fix —
  never an edit.
