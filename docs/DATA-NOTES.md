# What the source files were missing

Read this before the portal goes to branches. Five things in the two Excel
files need a decision from HO.

---

## 1. There are no Regional Manager accounts

`List of User.xlsx` has 23 rows: 21 Branch Logistic users and 2 HO Admins.
The Regional Managers appear only as `ManagerCode` / `ManagerName` values on
other people's rows. They have no username, no email and no password, so as
supplied they could not sign in at all.

The portal creates seven RM accounts from those columns:

| Emp code | Name | Username | Zone |
|---|---|---|---|
| PM1506 | Anjani Yadav | `anjaniy` | North - 1 |
| PM1600 | Ankit Taneja | `ankitt` | North - 2 |
| PM1610 | Rahul Maurya | `rahulm` | West |
| PM1616 | Bachhan Giri | `bachhang` | East |
| PM1621 | Gabriel Raj Chindada | `gabrielc` | South - 3 |
| PM1625 | Pethuramasamy | `pethuramasamy` | South - 2 |
| PM1672 | Shyam Ravi | `shyamr` | South - 1 |

They show as **derived** in Admin › Users.

**Check two things.** The usernames and emails are guesses built from their
names — replace them with the real ones. And each RM is mapped to the single
zone their branch users sit in; if any of them covers more than one zone, edit
the account, or the branches in the other zone will be invisible to them.

---

## 2. Every account shares one password

All 23 rows carry `ProstarM@1234` in a plain-text column. The portal stores
SHA-256 hashes rather than the passwords themselves, but that does not help
while all 30 accounts open with the same string — and it is now in a file that
has been emailed around.

Change them before the first real entry. Admin › Users › Edit sets a new one
per account.

Worth saying plainly: a spreadsheet column of shared plain-text passwords is
the reason the Entra ID option in the setup guide is worth the effort. It
removes password handling from this system entirely.

---

## 3. Product categories are wrong past the eighth block

The category row in `New Stock Sheet.xlsx` labels only eight points across 345
columns. Reading left to right and carrying each label forward gives:

| Category | Products |
|---|---|
| SMF Battery | 14 |
| Lithium Battery | 10 |
| EAST | 4 |
| Eaton | 1 |
| K-STAR | 5 |
| PM | 2 |
| Isolation Transformer | 8 |
| Servo Stabilizer | **67** |

That last figure is the giveaway. Everything after the Servo Stabilizer header
inherits it — inverters, PCBs, cables, lugs, SNMP cards, casing clips. They are
not servo stabilizers. Two of the labels are also not categories at all: "EAST"
is a region and "PM" is a product prefix.

Nothing breaks — the category only drives the dashboard donut and a report
column. But the donut is misleading until someone re-tags those 67 products.
Edit `data/products.js`, or export the product list, fix it in Excel and load
it back.

---

## 4. Two products appear twice

`Eaton 9E-IN 2000XL` and `Connector -HAL` each occupy two column blocks in the
stock sheet. The portal keeps the first occurrence of each, giving 111 unique
products from 113 column blocks.

If those duplicates were deliberate — the same item tracked separately for two
business reasons — give them distinct names, because one balance per branch per
product is how the portal counts.

---

## 5. Every balance starts at zero

Both files are empty templates. There is no opening stock anywhere in them, so
the portal opens with nothing on hand at any branch.

The two ways to load real balances are in the README. The slower one, where
each branch records their physical count as an inward entry, is worth the
effort: it puts a date, a person and a remark against every opening figure. The
faster one leaves you with balances nobody can explain in six months.

---

## Branch spelling: CG_Chatiishgarh

The user file spells the Chhattisgarh branch `CG_Chatiishgarh`. The portal uses
the code exactly as written, because it is the key that ties users, stock and
transactions together — changing it would orphan any data already posted
against it.

The display name shown beside it is derived from the code, so screens read
"Chatiishgarh". The state resolves correctly to Chhattisgarh.

If the spelling should be corrected, do it in the user file and tell me: the
branch code changes everywhere at once, and any existing stock at the old code
needs moving across first.

## Also worth knowing

**Branch codes carry the state.** `WB_Kolkata`, `TN_Coimbatore` and so on. The
portal splits on the underscore to fill in the state column, so keep the format
if you add branches.

**Two branches have two users each.** UP_Noida (Anurag Yadav, Hemant Gupta) and
MP_Bhopal (Jayprakash Pardhi, Arun Nangvanshi). Both can post to the same
branch balance, which is fine — the audit trail names whoever saved each entry.

**MH_HO is a branch too.** Both HO Admins sit there. It appears in branch lists
and can hold stock; leave it at zero if HO does not physically hold any.

**No region layer exists.** The spec asked for Branch → Region → Zone → HO, but
the file only has Branch → Zone. The portal uses zone as the regional scope. If
regions are a real grouping at Prostarm, add the column to the user master and
the mapping is a small change in `RBAC.visibleBranches()`.
