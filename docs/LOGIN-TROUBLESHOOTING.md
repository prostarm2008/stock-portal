# A user cannot sign in

Work through these in order. The first two cover almost every case.

---

## 1. Check the footer on the sign-in page

It reads, for example:

```
Prostarm Stock Portal v1.0.0 · build 2026.08.31 · backend local · 33 accounts
```

**The account count is the answer to most sign-in problems.** It says how many
accounts this computer can actually see.

| What you see | What it means |
|---|---|
| `33 accounts` | Current. Every account in the user file is loaded |
| A lower number | This machine is running older files |
| `26 accounts` + amber `file has 33` | The data file is current but storage has not caught up — reload once |

If the count is short, the machine has an old copy of `data/users.js`. Replace
the folder with the current build and reload.

## 2. Force a refresh

Browsers cache JavaScript. If the files were replaced but the count has not
changed, the browser is serving the old ones:

**Ctrl + Shift + R** on Windows, **Cmd + Shift + R** on Mac.

Every script and stylesheet URL now carries the build stamp
(`data/users.js?v=2026.08.31`), so a new build cannot be served from cache —
but a machine that loaded the *previous* build before that change still needs
one hard refresh.

## 3. Check the sign-in itself

- The login ID is the **Username** column from the user file, not the email.
  `sanchits`, not `sanchit.sawant@prostarm.com`.
- The employee code works too: `PM1244`.
- Case does not matter for the username; **it does for the password**.
- The default password is `ProstarM@1234` — capital P, capital M, `@1234`.
- If the person's password was changed under Admin › Users, the file's default
  no longer works for them. That is the `passwordSource` column on that screen.

## 4. Check the account is active

Admin › Users. An account switched off returns *"That account is switched off.
Ask HO to reactivate it."*

## 5. HO Admin: confirm what the machine has

Admin › Users shows every account and a sync notice listing anything picked up
from the data files on this load. If a name is missing there, it is missing
from `data/users.js` on that machine.

**Resync from data files** forces a full reload from the files, including
records edited in the portal.

---

## How new accounts reach an existing machine

Reference data reconciles on every page load. A user in `data/users.js` but not
in this browser's storage is added automatically, and appears in the sync notice
on Admin › Users. Records edited in the portal are never overwritten; stock,
transactions and audit cases are never touched.

Verified on an installation seeded before the newest accounts existed: seven
users and one branch were added on the next load, all seven signed in, and the
existing stock and transactions survived untouched.

---

## The one this cannot fix

**Local mode does not share data between computers.** Each machine keeps its
own copy in its own browser storage. An account added on one PC is not visible
on another, and neither is a password changed there.

If people on different machines need the same accounts and the same stock, that
is what the Power Automate backend is for — see `POWER-AUTOMATE-SETUP.md`. No
amount of front-end work removes this limit.
