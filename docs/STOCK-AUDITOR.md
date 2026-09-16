# Stock Auditor

Implements FRD-SA-001. Built on **§0.1 Option C**: the auditor never writes
stock; closing a case with a variance raises a correction that HO Admin
approves, and only then does a transaction post.

To close cases without ever raising a correction, set
`APP_CONFIG.audit.correctionModel = "document"` in `js/config.js`. Everything
else is unchanged.

---

## Sign in

| Username | Name | Emp code | Branch | Audit scope |
|---|---|---|---|---|
| `rahuld` | Rahul Devang | PM1337 | MH_HO | All India, less MH_HO |
| `sanchits` | Sanchit Sawant | PM1244 | MH_HO | All India, less MH_HO |

Two auditors, both posted at Head Office. Only one audit cycle can be open per
branch at a time — the second attempt is refused, naming who holds it. They can
work different branches in parallel, and different lines inside one cycle.

Password `ProstarM@1234`, as supplied in the user file. Like every other
account in that file it is the shared default — change it under Admin › Users
before go-live.

Auditors land on the **Audit workspace**, not the stock dashboard — they have
no dashboard, and routing is role-aware rather than hardcoded.

### Why his scope is All India

The file gives him Branch `MH_HO` and Zone `HO`. Taken literally that is a
scope of one branch — his own — which segregation of duties then removes,
leaving him nothing to audit at all.

Read as intended, an auditor sitting at Head Office audits the field, so his
scope is set to **All India** and MH_HO is excluded at runtime. He is offered
19 of the 20 branches; attempting MH_HO directly returns *"You are posted to
MH_HO, so you cannot audit it."*

If he is meant to audit only certain zones, change it in Admin › Users ›
Edit › Audit scope.

---

## If sign-in fails on a machine already running the portal

The account is added to storage the next time any page loads — see
"Updating the data files" in the README. If `rahuld` is rejected, refresh the
sign-in page once and try again. Admin › Users will show the account being
picked up.

## The flow, end to end

1. **Auditor opens a cycle** for a branch and period. Scope is all products,
   one master category, or products with stock. The system snapshots the
   system quantity for every line.
2. **Auditor counts.** Per line: **Verified OK**, or **Discrepancy** →
   counted quantity and mandatory remarks. Difference and variance calculate
   live as the number is typed.
3. **Branch responds.** A card appears on the branch dashboard — not a new
   screen. The branch sees the finding read-only and writes a justification.
4. **Auditor reviews.** Accept and close, or reject and request clarification.
   Rejection loops back to the branch; every round is kept.
5. **HO corrects.** Closing with a variance queues a correction under **Stock
   corrections**. Approving posts an ordinary transaction that shows up in
   Stock summary, Reports and the audit trail like any other movement.

---

## Where the correction goes

Closing a case with a variance raises a correction. **An HO Admin approves it
under Stock corrections** — sidebar, under Stock audit. Until they do, the
branch balance still shows the old figure.

It is surfaced three ways, because a sidebar entry alone was too easy to miss:

1. A card at the top of the HO Admin dashboard naming the branch, product and
   correction, with a **Review corrections** button.
2. The bell badge in the top bar.
3. A link on the case page itself, beside the PENDING status.

### Two HO Admins, one queue

Every HO Admin sees every pending correction — there is no assignment, and
whoever gets to it first decides it.

**First decision wins.** Once one admin approves or rejects, the correction is
locked. A second admin acting on a stale screen is refused with the name and
time of the first decision:

> Already approved by Chandan Chaudhari on 31 Aug 2026 at 13:45. The stock has
> moved and nothing further is needed.

This applies to **both** actions. An earlier version guarded approve but not
reject, so a second admin could reject a correction that had already posted —
leaving a record marked REJECTED with the stock already moved and the
transaction still on file. That is fixed; both paths now check the same status.

**The list keeps itself current.** It refreshes on any data change and on a
timer, so a correction decided by one admin disappears from the other's screen
rather than sitting there waiting to be clicked. When that happens the second
admin sees a note naming who dealt with it. Their own decisions do not trigger
that note.

The **Decided** table records who decided each one and when, alongside the
resulting transaction ID.

### If HO cannot see it

On the **local backend**, browser storage does not travel between machines. An
auditor accepting on their PC and an HO Admin looking on another PC are reading
two different data sets, and the correction will never appear. The acceptance
dialog now says so.

This is not a defect in the workflow — it is what local mode is. Two roles
working on separate machines needs the Power Automate backend. Until then, run
both on the same computer, or have HO do the accepting.

## Read-only means read-only

`STOCK_AUDITOR` has `canWrite: false` and that must stay false. Auditor writes
go through `window.Audit.*` into the audit collections. The auditor's session
never calls a function that can move a balance — FR-03 is enforced by
structure, not by discipline.

Branch responses accept text only. Sending `physicalQty`, `systemQtyAtSubmit`,
`qtyDifference`, `auditorRemarks` or `status` in a response is refused and
logged as `AUDIT_TAMPER_ATTEMPT`. All five vectors are covered by test.

An auditor cannot audit their own branch. `RBAC.visibleBranches()` subtracts
`user.branch` from the audit scope, and `openCycle` refuses with a
segregation-of-duties message.

---

## Stock moving during a count

The cycle snapshots the balance when it opens. Every commit re-reads the live
figure. If it changed, the auditor sees a dialog naming both numbers and must
confirm; the **current** figure is then used for the variance and the line is
flagged. Flagged lines are counted at the top of the cycle screen — a branch
that regularly posts movements mid-count is worth a question.

The same applies at approval: a correction posts against the balance **now**,
not at count time. Where those differ the approval dialog says so, and warns
that the result will not equal the counted figure.

---

## Statuses

`Pending verification` → `Verified` · `Justification requested` →
`Branch responded` → `Closed` or `Clarification requested` (loops back) ·
plus `Cancelled` and `Closed — unresolved`.

Every permitted move is a row in `TRANSITIONS` in `js/auditapi.js`. Anything
not in that table is refused and logged. Terminal statuses are Verified,
Closed, Closed–unresolved and Cancelled; a cycle cannot close while any line
is outside them, unless HO force-closes with a reason.

---

## Audit dashboard and reports (FRD §8)

**Audit dashboard** — HO Admin, Regional Manager and Stock Auditor, scoped.
Single screen: five KPIs, branch-wise audit status, ageing of open cases in
working days, category-wise variance, and six reports.

**Two accuracy figures, deliberately.** *Line accuracy* is clean lines over
lines counted — how often the branch is right. *Unit accuracy* is
1 − variance units / system units — how wrong they are when wrong. A branch out
by 500 units on one line of a hundred scores 99% on the first and far worse on
the second. Quoting only one of them is a decision, not a simplification, so
both are shown side by side and both export.

Reports: cycle summary · discrepancy register · branch accuracy scorecard ·
auditor activity · ageing · case history. Excel export gives three sheets —
Overview, Branch Accuracy, and whichever report is on screen.

## Bulk verification (FRD §10.9)

Checkbox per pending line, select-all in the header, sticky action bar. Only
lines with no quantity entered can be bulk verified. Each line is still
snapshotted, movement-checked and trailed **individually** — a bulk action
never collapses into one audit row. Over 50 lines requires typing `VERIFY`, and
the dialog says plainly that bulk verifying an uncounted line puts a false
clean record on the trail in the auditor's name.

## Faulty units (FRD §10.12)

The discrepancy form takes an optional *of which faulty* count alongside the
physical quantity, validated against it. Without this, good and faulty stock
net off and a count looks correct while the sellable position is wrong.

Still worth doing at source: faulty is inferred from the product name, which is
weak — a unit that fails after receipt keeps its good-stock name. It belongs as
a status on the stock row.

## SLA in working days (FRD §6.3)

Ageing excludes Sundays and any dates in `APP_CONFIG.audit.holidays`. Both
figures are reported — 16 calendar days shows as 14 working days — because an
SLA that runs over Diwali produces escalations nobody deserves and teaches
people to ignore the alerts.

Thresholds route the case: 3 working days overdue, 5 to the Regional Manager,
10 to HO Admin. The RM and HO dashboards show a banner naming each case and
where it escalates.

## In-app task badge

A bell in the top bar on every page, for every role, showing what is waiting on
that person and linking to it:

| Role | Sees | Goes to |
|---|---|---|
| Branch Logistic | queries against their branch | the case |
| Stock Auditor | cases the branch has answered | audit workspace |
| HO Admin | corrections pending approval, and final escalations | stock corrections |
| Regional Manager | cases escalated to them | audit dashboard |

Verified following one case end to end: it appears for the branch, disappears
when they respond and appears for the auditor, then moves to HO on closure.

## What is not built

**Email.** A browser page cannot send it. In-app tasks and badges work; email,
Teams and digests need the Power Automate backend. If notification matters to
the business case, that backend is a prerequisite.

**Attachments.** Browser storage caps near 5 MB and base64 inflates by a third
— three 2 MB files would exhaust the portal's storage on one case. The branch
form says so plainly and asks for the document reference in the text instead.
Set `APP_CONFIG.audit.allowAttachments = true` once on the shared backend.

**Automatic SLA escalation.** Ageing and SLA state are calculated and shown —
overdue badges on the workspace, an alert on the case, a count on the branch
card. What is missing is the scheduled job that sends the escalation, which
needs a server. Thresholds are already configurable in `APP_CONFIG.audit.sla`.

---

## Files

| File | Purpose |
|---|---|
| `js/auditapi.js` | collections, state machine, variance, SLA — no stock writes |
| `js/audit.js` | workspace and cycle verification screens |
| `js/audit-case.js` | case thread (3 role views) and HO corrections |
| `audit-workspace.html` · `audit-cycle.html` · `audit-case.html` · `adjustments.html` | pages |

Collections added: `auditCycles`, `auditLines`, `auditResponses`. Existing
collections are unchanged except for new audit-trail action values.

---

## For the shared backend

Mirror every rule in `js/auditapi.js` inside the flows — the client rules
control what is shown, the flow rules control what is possible. In particular
the branch tamper guard and the segregation-of-duties check must exist
server-side, because a determined user can edit their own session. See
`SECURITY-RULES.md`.
