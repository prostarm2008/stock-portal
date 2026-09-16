# "The server did not receive a response from an upstream server"

That message is a **gateway timeout**. Power Automate accepted the call, the
flow started, and it did not answer within the time the HTTP trigger allows.

It does **not** mean the flow refused the work. **The rows may well have been
written.** That is the whole problem with it.

## Why this was dangerous before

The portal treated a timeout as a failure and offered to send the file again.
If the flow had in fact written the rows, re-sending doubled the stock. There
was nothing to prevent it: every document was posted without any key the flow
could recognise as "I have already done this one".

A read-time filter had been added to hide batches that looked like duplicates,
which papered over the symptom — and hid genuine repeat documents from the
stock summary and every report at the same time.

## What happens now

**1. Every document carries a key.** The portal generates a `batchId` per
document and sends it in the header. The flow should store it and refuse a
document whose `batchId` it already holds. That makes a retry safe.

**2. `createTxn` is never retried automatically.** Reads are; writes are not,
because a silent retry is exactly what causes the duplicate.

**3. A timeout is recorded as unknown, not failed.** After the run the portal
re-reads the transactions and looks for the keys it sent, then reports three
groups:

- **Posted** — confirmed present
- **Did not post** — confirmed absent, with a button to retry only those
- **Unconfirmed** — the portal could not tell, listed with the key it sent

You are never offered a retry for a document that actually landed.

**4. Read-time duplicate hiding is off by default.** `hideDuplicateBatches` in
`js/config.js`. Leave it false: two genuine documents can legitimately share a
branch, date, challan and product list, and hiding one makes every report
under-state real stock.

## What the flow needs

**Add a `BatchId` column to the Transactions list.** Without it the portal
cannot verify a timeout and will say so plainly instead of guessing.

Then, at the top of `createTxn`:

1. Get items from Transactions filtered on `BatchId eq '<incoming batchId>'`
2. If any row comes back, return 200 with
   `{"batchId": "...", "duplicate": true}` and write nothing
3. Otherwise carry on, writing `BatchId` onto every row

That single check makes the whole path safe to retry.

## Stopping the timeouts

The verification above handles a timeout correctly; it does not prevent one.
The flow itself is too slow. In order of effect:

**Fewer SharePoint calls per line.** A flow that does Get-item, Update-item and
two Create-items per line will not finish twenty lines in time. Read the stock
rows for the whole document once, compute in variables, then write.

**Lower `bulkLinesPerCall`.** It is 20 now. If your flow needs roughly a second
per line, 20 lines is near the limit — try 10. It is a straight trade: smaller
documents finish inside the timeout, but there are more calls, so raise
`bulkPostGapMs` alongside it.

**Concurrency Control: 1** on the flow, so parallel runs do not compete.

**Consider the asynchronous pattern.** Reply 202 immediately and let the flow
finish in the background. That removes timeouts entirely, but the portal can no
longer confirm a document at the moment of posting — it would rely on the
verification step instead. Worth doing if uploads stay large.

## Your four failures, read back

```
MH_Mumbai      upstream timeout   → unknown, now verified
GJ_Ahmedabad   upstream timeout   → unknown, now verified
WB_Kolkata     unexpected error   → genuine failure, safe to retry
BH_Patna       upstream timeout   → unknown, now verified
```

Three of the four were never failures. Under the old build, retrying them
risked doubling three branches' stock.
