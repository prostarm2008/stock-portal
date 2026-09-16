# Two dates, and why the stock moved

## The two dates

Every transaction now carries both:

| Field | Meaning | Set by |
|---|---|---|
| **Date of inward / outward done** | When the stock physically moved | The person, on the form |
| **Date of entry at portal** | When it was typed in | The system, not editable |

They are separate because they answer different questions. Reports run on the
**movement date** — that is when the stock actually changed hands. The **entry
date** shows how long the paperwork took to reach the portal.

Where the two differ, the recent-documents list and the dashboard show the
entry date underneath in grey. A branch consistently entering last week's
movements is worth a conversation; you cannot see that from one date alone.

Both appear in the Excel detail sheet as *Date of Movement* and *Date of Entry
at Portal*.

The back-dating rules are unchanged and apply to the movement date: a branch
may back-date an inward but not an outward. The entry date is always today, so
it cannot be manipulated.

## Movement category

Mandatory on both entry forms. The lists are direction-locked — an outward
cannot be filed as a Sales Return, and the data layer refuses it even if the
form is bypassed.

| Inward | Outward |
|---|---|
| Demo In | Demo Out |
| Sales Return In | Sales Out |
| Stock Transfer In | Stock Transfer Out |
| Opening Stock In | |

### About Opening Stock In

You listed six categories. None of them describes a first stock load, and the
likely result would be branches labelling an opening count as a *Stock Transfer
In* — which would then show up in transfer reporting as movement that never
happened.

So there is a seventh, inward only, used by the bulk template. **Remove it from
`APP_CONFIG.movementCategories` if you would rather branches picked one of your
six** — nothing else needs changing.

### Changing the lists

`js/config.js`:

```javascript
movementCategories: {
  IN:  ["Demo In", "Sales Return In", "Stock Transfer In", "Opening Stock In"],
  OUT: ["Demo Out", "Sales Out", "Stock Transfer Out"]
}
```

The entry forms, the bulk template dropdown, the validation and the report all
read this list. Adding or renaming one is a config change, not a code change.

Renaming a category does not rewrite history: transactions keep the label they
were saved with, the same way they keep the product name they were entered
with.

## Movement category report

**Reports › Movement category.** Category, direction, branch, documents, lines
and quantity, for the selected period. Exports with the rest.

This is the report the daily and monthly ones cannot give you. A branch whose
outward is mostly *Demo Out* has a very different problem from one that is
mostly *Sales Out*, and until now both looked identical.

## Bulk upload

The template gains an **Inward Category** dropdown as column B, fed by a named
range on the master sheet, with the Validation Check column testing it like
every other field.

A blank category is accepted rather than rejected, so an older file still
uploads — but the preview says how many rows are affected and warns they will
show as **Not specified** on the report. Rows sharing branch, category, challan
and date post as one document, so a challan carrying both a demo and a transfer
correctly becomes two documents.
