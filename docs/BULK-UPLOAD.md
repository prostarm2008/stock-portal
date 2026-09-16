# Bulk inward upload

**Stock inward › Bulk upload.** Built for loading opening balances at 20
branches without typing them line by line.

---

## The templates

Three downloads, all from the same dialog. The Excel ones are protected
four-sheet workbooks, built from the **live** product and branch master — a
product added this morning is in this morning's dropdown.

| Template | Use it for |
|---|---|
| **Excel template** | 500 blank rows with dropdowns and validation |
| **CSV template** | Same columns, plain text |
| **Template with my products** | Every product pre-listed with a blank Quantity. Fill the counts, leave the rest blank, upload |

The third is the one for opening stock: it removes the chance of a mistyped
product name entirely.

### What is in the workbook

**1. Stock Upload Template** — protected, header frozen.

- A title bar with two live counters: *Lines ready to upload* and
  *Lines with errors*.
- **Blue headings are yours.** Date, Branch Code, Product Name, Quantity,
  Challan, Invoice, Party, Remarks. These cells are unlocked.
- **Dark headings fill themselves and are locked.** Product Code, Category and
  Subcategory appear the moment you pick a product — which is how you know the
  name matched the master.
- **Validation Check** on the right reads either `OK - ready to upload` or a
  plain-language reason, checked in the order a person would look:

  ```
  ERROR - Branch Code is blank
  ERROR - Branch Code not in the master list
  ERROR - Product Name not in the master list
  ERROR - Quantity must be a whole number
  ERROR - Date is in the future
  OK - ready to upload
  ```

**2. Dropdown Master Data** — protected. 20 branches with name, state and zone;
111 products with code, master category and subcategory. This is what the
dropdowns read from, via named ranges (`BranchList`, `ProductList`,
`ProductCodeList`, `ProductCatList`, `ProductSubList`).

**3. Instructions** — unprotected. Step by step, and written for the specific
person who downloaded it: a branch user's copy says *"You may only upload for
WB_Kolkata"*; an HO Admin's says any branch.

**4. Field Specification** — unprotected. Column, data type, mandatory,
editable, validation rule, example.

### Dropdowns

Branch Code and Product Name are Excel list validations. Click the cell and use
the arrow, or start typing — with 111 products, typing is faster. Anything not
on the list is rejected by Excel with a message naming what to do.

Quantity is a whole-number validation above zero. Date will not accept a future
date.

### Protection

Both data sheets are protected with **`Prostarm@2026`**. Only the input cells
are unlocked, so headings, formulas and lookup lists cannot be broken by
accident.

**This stops mistakes, not misuse.** Excel sheet protection is removed in
seconds by freely available tools, and the password is stored in the file as a
16-bit hash. It is a guard rail, not a security control. The checks that matter
run in the portal when the file is uploaded — and they run again server-side
once the Power Automate backend is in place.

### Columns

| Column | Required | Notes |
|---|---|---|
| Date | No | `YYYY-MM-DD`, or a real Excel date cell. Blank uses today |
| Branch Code | **Yes** | `WB_Kolkata`. Branch users can only use their own |
| Product Code | No | `P001` — used first when present |
| Product Name | No | Matched if the code is blank. Case-insensitive |
| Quantity | **Yes** | Whole number above zero. Blank or `0` skips the row |
| Challan No | No | Rows sharing branch + challan + date post as **one document** |
| Invoice No | No | |
| Party Name | No | Supplier, or `Opening stock as on <date>` |
| Remarks | No | |

Either the code or the name is enough. Give both and the code wins.

---

## What happens when you upload

The file is read, every row is checked, and **nothing is written until you
press Post.** The preview shows four figures — rows ready, documents, total
units, rejected — then lists every rejected row with the reason.

**Rejected rows are never skipped silently.** A silent skip is how a branch
ends up short by a pallet nobody can account for. Tested rejections:

```
row  8  ZZ_Nowhere · P001 · 5     branch ZZ_Nowhere is not in the master
row  9  WB_Kolkata · P999 · 5     no product matches P999
row 10  WB_Kolkata · P001 · abc   quantity "abc" is not a whole number
row 11  WB_Kolkata · P001 · 2.5   quantity "2.5" is not a whole number
row 12  WB_Kolkata · P001 · 5     date is in the future
```

Blank and zero quantities are counted separately as skipped, not rejected —
that is the expected result of using the all-products template.

You can post the valid rows and deal with the rejects afterwards, or fix the
file and upload again. Nothing is written twice: a second upload of the same
file creates a second set of documents, so fix and re-upload only the rows that
failed.

### Grouping

Rows sharing **branch + challan number + date** become one document. A challan
number appearing on two dates becomes two documents, one per date, and the
preview says so — each document carries the date the stock was actually
counted, which is what the audit trail needs.

---

## File formats

**.xlsx** is read directly. The portal unzips the workbook and parses the sheet
using the browser's native `DecompressionStream`, so there is still no library
to install and it works from a double-clicked `index.html`. Files it writes are
deflated with `CompressionStream` — the 500-row template is 63 KB rather than
the 759 KB it would be stored, which is the difference between a file that
emails and one that bounces.

**The heading row does not have to be row 1.** The issued template has a title
bar above it, and people add notes of their own. The parser scans the first 12
rows for a row that looks like a heading, and says so plainly if it cannot find
one.

**.csv** is read too, including quoted fields with embedded commas.

**.xls** (the pre-2007 format) is refused with a message telling you to save as
.xlsx or .csv. Reading it would need a completely different parser for a format
Excel itself is phasing out.

Real Excel date cells are handled — a date typed into Excel arrives as a serial
number, and that is converted rather than rejected.

---

## Permissions

A branch user can only post for their own branch. Uploading a file full of
another branch's rows rejects every one of them with *"you cannot post for
WB_Kolkata"* — verified. HO Admin can post for any branch, including a single
file covering all 20.

---

## For opening balances

1. Download **Template with my products**.
2. Send it to each branch, or fill it centrally from their count sheets.
3. Set Date to the count date, Challan No to something like `OPENING/2026-08`,
   and Party Name to `Opening stock as on <date>`.
4. Upload, check the preview, post.

That last step matters: every opening figure then carries a date, a person and
a reason on the audit trail. The alternative — editing balances directly —
leaves numbers nobody can explain at the next audit.

**There is no undo.** A wrong quantity is corrected with a reversing outward
entry, not by deleting the document. Check the preview.
