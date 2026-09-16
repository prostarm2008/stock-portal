# Back-dated entries

| Role | Inward | Outward |
|---|---|---|
| Branch Logistic | **any past date** | **today only** |
| HO Admin | any past date | any past date |
| Stock Auditor | n/a — cannot post stock | n/a |
| Anyone | future dates refused | future dates refused |

## Why the two differ

**Inward can be back-dated by anyone.** Goods arrive before the paperwork
catches up. A branch that receives stock on Monday and enters it on Thursday
should record Monday — that is the honest figure, and forcing today's date
would misstate when the stock actually existed.

**Outward cannot be back-dated at branch level.** Issuing stock on a past date
rewrites a balance that reports, stock summaries and audit counts have already
been run against. A branch that comes up short after a physical count could
otherwise back-date an issue to make the shortfall disappear, and the audit
trail would show a tidy explanation that was written after the fact.

HO Admin keeps the ability because genuine corrections do exist — a challan
found in a drawer, an entry missed while someone was on leave. When HO uses it,
their name and the date they posted it are both on the audit trail, so the
back-dating is visible rather than silent.

The Stock Auditor also carries the capability, though it has no effect today:
the role is read-only and cannot post stock at all. It is set so that if the
correction model is ever changed to let auditors post directly, the permission
is already right.

## How it is enforced

Two places, and only the second one counts:

- **The form** sets a minimum date on the outward screen and explains the rule
  under the field, so a branch user never gets as far as an error.
- **The data layer** refuses the write regardless of what the form allowed.
  This is the gate. `API.createBatch` checks `canBackdateOutward` before
  anything is written.

On the Power Automate backend the same check must be repeated inside the
`createTxn` flow — the client rules control what is shown, not what is
possible.

## Changing the rule

`js/auth.js`, in the `ROLES` table:

```javascript
BRANCH_USER: { ..., canBackdateOutward: false }
```

Set it to `true` to allow branch back-dating. Nothing else needs changing — the
form and the data layer both read the same capability.

Bulk upload posts inward only, so it is unaffected: back-dated rows in an
upload are accepted, which is exactly what opening-balance loading needs.
