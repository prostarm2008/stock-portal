/* ============================================================
   bulk-upload.js — bulk inward for opening stock

   Built for the job of loading opening balances at 20 branches
   without typing them line by line.

   Every row is validated before anything is written, and the
   preview shows exactly what will post. Rows that cannot be
   resolved are listed with the reason rather than skipped
   quietly — a silent skip is how a branch ends up short by a
   pallet nobody can account for.
   ============================================================ */
(function (w, d) {
  "use strict";

  var COLUMNS = [
    { key: "date",       label: "Date of Inward Done", width: 18, required: false,
      alias: ["Date", "Movement Date"], hint: "YYYY-MM-DD, the day the stock arrived. Blank uses today." },
    { key: "movementCategory", label: "Inward Category", width: 20, required: false,
      alias: ["Movement Category", "Category"],
      hint: "Demo In, Sales Return In, Stock Transfer In or Opening Stock In." },
    { key: "branch",     label: "Branch Code",  width: 18, required: true,  alias: ["Branch", "Branch Name"], hint: "e.g. WB_Kolkata" },
    { key: "productCode",label: "Product Code", width: 14, required: false, alias: ["Code"], hint: "P001. Either code or name." },
    { key: "productName",label: "Product Name", width: 46, required: false, alias: ["Product", "Item Name", "Asset Name"], hint: "Matched if the code is blank." },
    { key: "qty",        label: "Quantity",     width: 12, required: true,  alias: ["Qty"], hint: "Whole number above zero." },
    { key: "challanNo",  label: "Challan No",   width: 18, required: false, hint: "Groups rows into one document." },
    { key: "invoiceNo",  label: "Invoice No",   width: 18, required: false, hint: "" },
    { key: "partyName",  label: "Party Name",   width: 28, required: false, hint: "Supplier, or the opening-stock note." },
    { key: "remarks",    label: "Remarks",      width: 34, required: false, hint: "" }
  ];

  w.BulkUpload = {
    /* opts: { user, branches, products, onDone } */
    open: function (opts) {
      var UI = w.UI;
      var user = opts.user;
      var state = { rows: [], parsed: null };

      var m = UI.modal({
        title: "Bulk inward upload",
        okText: "",
        cancelText: "Close",
        body:
          '<div class="alert info"><div><b>What this does</b>' +
          "Posts inward entries in bulk, so opening balances can be loaded without typing each line. " +
          "Rows sharing a challan number are saved as one document, exactly as if you had entered them " +
          "on the inward screen.</div></div>" +

          '<div class="btn-row" style="margin-bottom:14px">' +
            '<button class="btn btn-ghost btn-sm" id="tplXlsx">Download Excel template</button>' +
            '<button class="btn btn-ghost btn-sm" id="tplCsv">Download CSV template</button>' +
            '<button class="btn btn-ghost btn-sm" id="tplFilled">Template with my products</button>' +
          "</div>" +

          '<div class="field"><label for="bulkFile">Choose the completed file</label>' +
            '<input class="input" type="file" id="bulkFile" accept=".xlsx,.csv">' +
            '<div class="hint">.xlsx or .csv. The first row must be the column headings from the template.</div>' +
          "</div>" +

          '<div id="bulkResult"></div>',
        onOk: null
      });

      var root = m.root;

      /* ---------- templates ----------
         The issued workbook is built here, from the live product and
         branch master, so a product added this morning is in this
         morning's dropdown. Four sheets, matching the claim template
         already in use: the entry sheet, the lookup lists it feeds
         from, instructions, and a field specification. */
      var ROWS = 500, HDR = 2, FIRST = HDR + 1, LAST = HDR + ROWS;
      var PW = "Prostarm@2026";
      var XS = w.XLSX ? w.XLSX.styles : {};

      function sortedProducts() {
        return opts.products.slice().sort(function (a, b) {
          return String(a.productName || "").toLowerCase().localeCompare(String(b.productName || "").toLowerCase());
        });
      }
      function sortedBranches() {
        return opts.branches.slice().sort(function (a, b) {
          return String(a.branchCode || "").localeCompare(b.branchCode);
        });
      }

      function buildTemplate(prefill) {
        var prods = sortedProducts();
        var catList = (w.APP_CONFIG.movementCategories || {}).IN || [];
        var brs = sortedBranches();
        var nB = brs.length + 1, nP = prods.length + 1;
        var M = w.Master;
        var q = "'Dropdown Master Data'";

        /* --- sheet 1: the entry sheet --- */
        var head = ["Date of Inward Done *", "Inward Category *", "Branch Code *", "Product Name *",
                    "Product Code", "Product Category", "Product Subcategory", "Quantity *",
                    "Challan No", "Invoice No", "Party Name", "Remarks", "Validation Check"];
        var widths = [18, 22, 20, 52, 14, 22, 22, 12, 20, 18, 30, 34, 44];
        var derived = { 5: 1, 6: 1, 7: 1, 13: 1 };   /* 1-based columns */

        var rows = [];
        /* title row, with the two counters the branch watches */
        var title = [{ v: "PROSTARM INFO SYSTEMS LTD.  \u2014  BULK STOCK INWARD UPLOAD", s: XS.TITLE }];
        for (var t = 1; t < 8; t++) title.push({ v: "", s: XS.TITLE });
        title[9] = { v: "Lines ready", s: XS.BOLD };
        title[10] = { f: 'COUNTIF($M$' + FIRST + ':$M$' + LAST + ',"OK*")', s: XS.BOLDNUM };
        title[11] = { v: "Lines with errors", s: XS.BOLD };
        title[12] = { f: 'COUNTIF($M$' + FIRST + ':$M$' + LAST + ',"ERROR*")', s: XS.BOLDNUM };
        rows.push(title);
        rows.push(head.map(function (h, i) {
          return { v: h, s: derived[i + 1] ? XS.HEADLOCK : XS.HEADER };
        }));

        var seed = prefill ? prods : [];
        for (var r = FIRST; r <= LAST; r++) {
          var i0 = r - FIRST;
          var p0 = seed[i0];
          rows.push([
            { v: "", s: XS.DATE },
            { v: p0 ? "Opening Stock In" : "", s: XS.INPUT },
            { v: p0 ? (opts.user.role === "HO_ADMIN" ? "" : opts.user.branch) : "", s: XS.INPUT },
            { v: p0 ? p0.productName : "", s: XS.INPUT },
            { f: 'IF($D' + r + '="","",IFERROR(INDEX(ProductCodeList,MATCH($D' + r + ',ProductList,0)),"NOT FOUND"))', s: XS.LOCKED },
            { f: 'IF($D' + r + '="","",IFERROR(INDEX(ProductCatList,MATCH($D' + r + ',ProductList,0)),""))', s: XS.LOCKED },
            { f: 'IF($D' + r + '="","",IFERROR(INDEX(ProductSubList,MATCH($D' + r + ',ProductList,0)),""))', s: XS.LOCKED },
            { v: "", s: XS.INPUTNUM },
            { v: "", s: XS.INPUT }, { v: "", s: XS.INPUT },
            { v: "", s: XS.INPUT }, { v: "", s: XS.INPUT },
            { f: validationFormula(r), s: XS.LOCKED }
          ]);
        }

        var entry = {
          name: "Stock Upload Template",
          autoFilter: false, freezeHeader: false,
          headerRow: false,
          columns: widths.map(function (wd, i) { return { label: head[i], width: wd }; }),
          rows: rows,
          protect: true, password: PW,
          merges: ["A1:H1"],
          validations: [
            { type: "list", range: "B" + FIRST + ":B" + LAST, formula1: "InwardCategoryList",
              errorTitle: "Category not recognised",
              error: "Pick an inward category from the list.",
              promptTitle: "Inward Category", prompt: "Why the stock is coming in." },
            { type: "list", range: "C" + FIRST + ":C" + LAST, formula1: "BranchList",
              errorTitle: "Branch not recognised",
              error: "Pick a branch code from the list on the Dropdown Master Data sheet.",
              promptTitle: "Branch Code", prompt: "Choose the branch this stock belongs to." },
            { type: "list", range: "D" + FIRST + ":D" + LAST, formula1: "ProductList",
              errorTitle: "Product not recognised",
              error: "Pick a product from the list. If one is genuinely missing, ask HO to add it under Admin > Product master.",
              promptTitle: "Product Name", prompt: "Start typing to jump down the list of " + prods.length + " products." },
            { type: "whole", operator: "greaterThan", range: "H" + FIRST + ":H" + LAST, formula1: "0",
              errorTitle: "Quantity must be a whole number",
              error: "Enter a whole number above zero. Part units are not tracked.",
              promptTitle: "Quantity", prompt: "Whole number above zero. Blank skips the row." },
            { type: "date", operator: "lessThanOrEqual", range: "A" + FIRST + ":A" + LAST, formula1: "TODAY()",
              errorTitle: "Date not accepted",
              error: "Enter a real date, today or earlier. Stock cannot be received in the future.",
              promptTitle: "Date", prompt: "Leave blank to use the upload date." }
          ]
        };

        /* --- sheet 2: the lookup lists --- */
        var cats = (w.APP_CONFIG.movementCategories || {}).IN || [];
        var mRows = [];
        var maxLen = Math.max(brs.length, prods.length, cats.length);
        for (var k = 0; k < maxLen; k++) {
          var b2 = brs[k], p2 = prods[k];
          var m2 = p2 ? M.of(p2.productId) : null;
          mRows.push([
            b2 ? b2.branchCode : "", b2 ? b2.branchName : "", b2 ? b2.state : "", b2 ? b2.zone : "",
            "",
            p2 ? p2.productId : "", p2 ? p2.productName : "",
            p2 ? M.parentLabel(M.parentOf(m2)) : "", p2 ? M.label(m2) : "",
            "",
            cats[k] || ""
          ]);
        }
        mRows.push([]);
        mRows.push(["", "", "", "", "", { v: "This sheet feeds the dropdowns. Do not add, delete or re-order rows \u2014 the lists are referenced by range and will break.", s: XS.NOTE }]);

        var master = {
          name: "Dropdown Master Data",
          autoFilter: false,
          columns: [
            { label: "Branch Code", width: 20 }, { label: "Branch Name", width: 20 },
            { label: "State", width: 20 }, { label: "Zone", width: 14 },
            { label: "", width: 3 },
            { label: "Product Code", width: 14 }, { label: "Product Name", width: 52 },
            { label: "Master Category", width: 24 }, { label: "Subcategory", width: 24 },
            { label: "", width: 3 }, { label: "Inward Category", width: 24 }
          ],
          rows: mRows,
          protect: true, password: PW
        };

        return {
          sheets: [entry, master, instructionsSheet(prods.length, brs.length), specSheet()],
          options: {
            definedNames: [
              { name: "BranchList",      ref: q + "!$A$2:$A$" + nB },
              { name: "BranchZoneList",  ref: q + "!$D$2:$D$" + nB },
              { name: "ProductCodeList", ref: q + "!$F$2:$F$" + nP },
              { name: "ProductList",     ref: q + "!$G$2:$G$" + nP },
              { name: "ProductCatList",  ref: q + "!$H$2:$H$" + nP },
              { name: "ProductSubList",  ref: q + "!$I$2:$I$" + nP },
              { name: "InwardCategoryList", ref: q + "!$K$2:$K$" + (cats.length + 1) }
            ]
          }
        };
      }

      /* Reads top to bottom in the order a person would check the row. */
      function validationFormula(r) {
        return 'IF(COUNTA($A' + r + ':$D' + r + ',$H' + r + ':$L' + r + ')=0,"",' +
          'IF($C' + r + '="","ERROR - Branch Code is blank",' +
          'IF(COUNTIF(BranchList,$C' + r + ')=0,"ERROR - Branch Code not in the master list",' +
          'IF($B' + r + '="","ERROR - Inward Category is blank",' +
          'IF(COUNTIF(InwardCategoryList,$B' + r + ')=0,"ERROR - Inward Category not in the list",' +
          'IF($D' + r + '="","ERROR - Product Name is blank",' +
          'IF(COUNTIF(ProductList,$D' + r + ')=0,"ERROR - Product Name not in the master list",' +
          'IF($H' + r + '="","ERROR - Quantity is blank",' +
          'IF(NOT(ISNUMBER($H' + r + ')),"ERROR - Quantity must be a number",' +
          'IF($H' + r + '<=0,"ERROR - Quantity must be above zero",' +
          'IF($H' + r + '<>INT($H' + r + '),"ERROR - Quantity must be a whole number",' +
          'IF(AND($A' + r + '<>"",$A' + r + '>TODAY()),"ERROR - Date is in the future",' +
          '"OK - ready to upload"))))))))))))';
      }
      function instructionsSheet(nProducts, nBranches) {
        var canPost = opts.user.role === "HO_ADMIN"
          ? "You are an HO Admin, so you may upload for any branch."
          : "You may only upload for " + opts.user.branch + ". Rows for any other branch are rejected.";
        var lines = [
          ["", "WHAT THIS FILE IS FOR"],
          ["", "Loading stock into the Prostarm Stock Portal in bulk \u2014 opening balances, or a goods-received note too long to type line by line."],
          ["", ""],
          ["", "STEP BY STEP"],
          ["1.", "Open the Stock Upload Template sheet and start on row " + FIRST + ". Row 1 is the title, row 2 the headings. Do not delete them."],
          ["2.", "Blue headings are yours to fill. Dark headings are filled by the sheet and are locked."],
          ["3.", "Branch Code and Product Name are dropdowns \u2014 " + nBranches + " branches and " + nProducts + " products. Start typing and Excel jumps down the list."],
          ["4.", "Product Code, Category and Subcategory fill in on their own once you pick a product. That is how you know the name matched."],
          ["5.", "Quantity must be a whole number above zero. Leave it blank to skip a product you do not hold."],
          ["6.", "Rows sharing Branch Code, Challan No and Date upload as ONE document, exactly as if entered on the inward screen."],
          ["7.", "Every row must read \u201cOK - ready to upload\u201d in the Validation Check column before you send the file."],
          ["8.", "The counters at the top right show how many lines are ready and how many still have errors."],
          ["9.", "Save as .xlsx. In the portal: Stock inward \u203a Bulk upload, choose the file, check the preview, post."],
          ["", ""],
          ["", "FOR OPENING BALANCES"],
          ["", "Put the physical count date in Date, a challan such as OPENING/" + w.API.today().slice(0, 7) + ", and \u201cOpening stock as on <date>\u201d in Party Name. Every opening figure then carries a date, a person and a reason on the audit trail \u2014 which is what you will be asked for at the next stock audit."],
          ["", ""],
          ["", "WHAT YOU CANNOT DO"],
          ["", canPost],
          ["", "You cannot add products here. If one is missing, ask HO to add it under Admin \u203a Product master; it appears the next time this template is downloaded."],
          ["", "There is no undo. A wrong quantity is corrected with a reversing outward entry, never by deleting the document."],
          ["", ""],
          ["", "SHEET PROTECTION"],
          ["", "The template and master sheets are protected so headings, formulas and lookup lists cannot be changed by accident. Password: " + PW],
          ["", "This stops mistakes, not misuse. Excel protection is removed in seconds by free tools and is not a security control. The checks that matter run in the portal when the file is uploaded."]
        ];
        return {
          name: "Instructions",
          autoFilter: false, freezeHeader: false,
          columns: [{ label: "Step", width: 8 }, { label: "Bulk stock inward upload \u2014 how to use this file", width: 112 }],
          rows: lines.map(function (l) {
            return l[0] === "" && l[1] && l[1] === l[1].toUpperCase() && l[1].length < 40
              ? [{ v: "", s: XS.NORMAL }, { v: l[1], s: XS.GROUP }]
              : [{ v: l[0], s: XS.BOLD }, { v: l[1], s: XS.NOTE }];
          })
        };
      }

      function specSheet() {
        var SPEC = [
          ["Date of Inward Done", "Date DD-MM-YYYY", "N", "Yes", "The day the stock physically arrived. Today or earlier. Blank uses the upload date.", "20-08-2026"],
          ["Inward Category", "List", "Y", "Dropdown", "Why the stock is coming in: " + ((w.APP_CONFIG.movementCategories || {}).IN || []).join(", ") + ".", "Opening Stock In"],
          ["Branch Code", "List", "Y", "Dropdown", "Must exist in BranchList. Branch users may only use their own branch.", "WB_Kolkata"],
          ["Product Name", "List", "Y", "Dropdown", "Must exist in ProductList. Matched case-insensitively on upload.", "Battery 120AH Exide"],
          ["Product Code", "Text (10)", "\u2013", "Formula", "Derived from Product Name. Reads NOT FOUND if the name was typed over.", "P003"],
          ["Product Category", "Text", "\u2013", "Formula", "Derived. " + w.Master.tree().map(function (n) { return w.Master.parentLabel(n.parent); }).join(", ") + ".", "Battery"],
          ["Product Subcategory", "Text", "\u2013", "Formula", "Derived. " + w.Master.keys().map(function (k) { return w.Master.label(k); }).join(", ") + ".", "SMF Batteries"],
          ["Quantity", "Whole number", "Y", "Yes", "Above zero, up to 999,999. Blank or zero skips the row.", "25"],
          ["Challan No", "Text (40)", "N", "Yes", "Rows sharing Branch + Category + Challan + Date post as one document.", "OPENING/2026-08"],
          ["Invoice No", "Text (40)", "N", "Yes", "Free text.", "INV-77213"],
          ["Party Name", "Text (120)", "N", "Yes", "Supplier, or \u201cOpening stock as on <date>\u201d for a first load.", "Exide Industries Ltd."],
          ["Remarks", "Text (300)", "N", "Yes", "Anything the next person should know.", "Rack 3, physical count"],
          ["Validation Check", "Text", "\u2013", "Formula", "Must read \u201cOK - ready to upload\u201d before the file is sent.", "OK - ready to upload"]
        ];
        return {
          name: "Field Specification",
          columns: [
            { label: "#", width: 5 }, { label: "Column Name", width: 24 },
            { label: "Data Type", width: 20 }, { label: "Mandatory", width: 12 },
            { label: "Editable", width: 14 }, { label: "Validation Rule", width: 64 },
            { label: "Example", width: 26 }
          ],
          rows: SPEC.map(function (r, i) { return [i + 1].concat(r); })
        };
      }

      function downloadTemplate(kind) {
        if (kind === "csv") {
          UI.exportCSV("Prostarm-Bulk-Stock-Inward-Template",
            COLUMNS.map(function (c) { return c.label; }),
            [[w.API.today(), "Opening Stock In",
              opts.user.role === "HO_ADMIN" ? "WB_Kolkata" : opts.user.branch,
              "P001", "Battery 100AH -Exide", 25, "OPENING/" + w.API.today().slice(0, 7), "",
              "Opening stock as on " + w.API.today(), "Physical count"]]);
          return;
        }
        var t = buildTemplate(kind === "filled");
        UI.exportWorkbook(kind === "filled"
          ? "Prostarm-Bulk-Stock-Inward-All-Products"
          : "Prostarm-Bulk-Stock-Inward-Template", t.sheets, t.options);
      }

      root.querySelector("#tplXlsx").onclick = function () { downloadTemplate("xlsx"); };
      root.querySelector("#tplCsv").onclick = function () { downloadTemplate("csv"); };
      root.querySelector("#tplFilled").onclick = function () { downloadTemplate("filled"); };

      /* ---------- parse and validate ---------- */
      root.querySelector("#bulkFile").onchange = function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var out = root.querySelector("#bulkResult");
        if (out) out.innerHTML = '<div class="empty">Reading ' + UI.esc(file.name) + "\u2026</div>";

        w.XLSXRead.read(file).then(function (res) {
          state.parsed = res;
          validate(res.rows, out, file);
        }).catch(function (err) {
          if (out) out.innerHTML = '<div class="alert bad"><div><b>Could not read that file</b>' +
            UI.esc(err.message) + "</div></div>";
        });
      };

      /* One grouping key, used by both the preview and the post. */
      function docKey(r) {
        return r.branch + "\u0000" + r.challanNo + "\u0000" + r.date + "\u0000" + (r.movementCategory || "");
      }

      function normHead(h) { return String(h == null ? "" : h).toLowerCase().replace(/[^a-z]/g, ""); }

      function headerMap(headRow) {
        var map = {};
        headRow.forEach(function (h, i) {
          var n = normHead(h);
          COLUMNS.forEach(function (c) {
            if (map[c.key] !== undefined) return;
            if (n === normHead(c.label) || (c.alias || []).some(function (a) { return n === normHead(a); })) {
              map[c.key] = i;
            }
          });
        });
        return map;
      }

      /* The issued template carries a title row above the headings, and
         people add their own notes above that. Scan the first rows for
         the one that actually looks like a header rather than assuming
         row 1. */
      function findHeader(rows) {
        var best = null;
        for (var i = 0; i < Math.min(rows.length, 12); i++) {
          var map = headerMap(rows[i] || []);
          var hits = Object.keys(map).length;
          var hasRequired = COLUMNS.filter(function (c) { return c.required; })
            .every(function (c) { return map[c.key] !== undefined; });
          if (hasRequired && (!best || hits > best.hits)) best = { index: i, map: map, hits: hits };
        }
        return best;
      }

      function validate(rows, out, file) {
        if (!rows.length) {
          if (out) out.innerHTML = '<div class="alert bad"><div><b>That file is empty</b></div></div>';
          return;
        }
        var found = findHeader(rows);
        if (!found) {
          var map0 = headerMap(rows[0] || []);
          var missing = COLUMNS.filter(function (c) { return c.required && map0[c.key] === undefined; });
          if (out) out.innerHTML = '<div class="alert bad"><div><b>Could not find the heading row</b>' +
            "Looked at the first 12 rows for columns named " +
            COLUMNS.filter(function (c) { return c.required; })
              .map(function (c) { return UI.esc(c.label); }).join(", ") +
            (missing.length ? ". Still missing: " + missing.map(function (c) { return UI.esc(c.label); }).join(", ") : "") +
            ". Download the template and use its headings.</div></div>";
          return;
        }
        var map = found.map;
        var headerAt = found.index;

        var byCode = {}, byName = {};
        opts.products.forEach(function (p) {
          byCode[String(p.productId || "").toUpperCase()] = p;
          byName[String(p.productName || "").toLowerCase().trim()] = p;
        });
        var branchSet = {};
        opts.branches.forEach(function (b) { branchSet[b.branchCode] = b; });

        var ok = [], bad = [], skipped = 0;

        rows.slice(headerAt + 1).forEach(function (r, i) {
          var lineNo = headerAt + i + 2;
          var get = function (k) { return map[k] === undefined ? "" : String(r[map[k]] == null ? "" : r[map[k]]).trim(); };

          var qtyRaw = get("qty");
          if (qtyRaw === "" || Number(qtyRaw) === 0) { skipped++; return; }

          var problems = [];
          var branch = get("branch");
          if (!branch) problems.push("no branch");
          else if (!branchSet[branch]) problems.push("branch " + branch + " is not in the master");
          else if (!w.RBAC.canWriteBranch(user, branch)) problems.push("you cannot post for " + branch);

          var code = get("productCode").toUpperCase();
          var name = get("productName").toLowerCase();
          var prod = (code && byCode[code]) || (name && byName[name]) || null;
          if (!prod) {
            problems.push(code || name
              ? "no product matches " + (get("productCode") || get("productName"))
              : "no product code or name");
          }

          var qty = Number(qtyRaw);
          if (!isFinite(qty) || qty < 0 || qty !== Math.floor(qty)) {
            problems.push("quantity \u201c" + qtyRaw + "\u201d is not a whole number");
          } else if (qty > 999999) problems.push("quantity looks wrong");

          var moveCat = get("movementCategory");
          var allowed = (w.APP_CONFIG.movementCategories || {}).IN || [];
          if (moveCat && allowed.length) {
            var hit = allowed.find(function (c) { return c.toLowerCase() === moveCat.toLowerCase(); });
            if (!hit) problems.push('inward category "' + moveCat + '" is not one of: ' + allowed.join(", "));
            else moveCat = hit;
          }

          var date = get("date");
          if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            /* Excel hands back a serial number for a real date cell. */
            var serial = Number(date);
            if (isFinite(serial) && serial > 20000 && serial < 60000) {
              var dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
              date = dt.toISOString().slice(0, 10);
            } else {
              problems.push("date \u201c" + get("date") + "\u201d is not YYYY-MM-DD");
            }
          }
          if (date && date > w.API.today()) problems.push("date is in the future");
          /* This screen posts inward only, which may be back-dated by
             anyone. Nothing to check beyond the future-date rule. */

          if (problems.length) {
            bad.push({ line: lineNo, why: problems.join("; "),
                       raw: [get("branch"), get("productCode") || get("productName"), qtyRaw].join(" \u00b7 ") });
            return;
          }

          ok.push({
            line: lineNo, date: date || w.API.today(), branch: branch,
            movementCategory: moveCat,
            productId: prod.productId, productName: prod.productName, category: prod.category,
            qty: qty, challanNo: get("challanNo"), invoiceNo: get("invoiceNo"),
            partyName: get("partyName"), remarks: get("remarks")
          });
        });

        state.rows = ok;

        /* Must use the same key the posting step groups on, or the
           preview promises a document count the save does not deliver.
           A challan spanning two dates is two documents, deliberately —
           one date per document is what the audit trail needs. */
        var docs = {};
        ok.forEach(function (r) { docs[docKey(r)] = true; });
        var docCount = Object.keys(docs).length;
        var splitByDate = Object.keys(docs).length >
          Object.keys(ok.reduce(function (a, r) { a[r.branch + "|" + r.challanNo] = 1; return a; }, {})).length;
        var totalQty = ok.reduce(function (a, r) { return a + r.qty; }, 0);
        var branches = {};
        ok.forEach(function (r) { branches[r.branch] = true; });
        var noCat = ok.filter(function (r) { return !r.movementCategory; }).length;

        if (out) out.innerHTML =
          '<div class="grid g-4" style="margin:14px 0">' +
            mini("Ready to post", ok.length, "rows") +
            mini("Documents", docCount, "challans") +
            mini("Total units", totalQty, Object.keys(branches).length + " branch(es)") +
            mini("Rejected", bad.length, skipped ? skipped + " blank rows skipped" : "", bad.length ? "bad" : "ok") +
          "</div>" +

          (bad.length
            ? '<div class="alert bad"><div><b>' + bad.length + " row" + (bad.length === 1 ? "" : "s") +
              " cannot be posted</b>Fix them in the file and upload again, or post the valid rows now and " +
              "handle these separately. They are listed below \u2014 nothing is skipped silently.</div></div>" +
              '<div class="scroll-y" style="max-height:170px;margin-bottom:14px"><table class="tbl"><thead><tr>' +
              "<th>Row</th><th>Content</th><th>Problem</th></tr></thead><tbody>" +
              bad.slice(0, 50).map(function (b2) {
                return "<tr><td>" + b2.line + '</td><td class="small">' + UI.esc(b2.raw) +
                  '</td><td class="small" style="color:var(--bad-600)">' + UI.esc(b2.why) + "</td></tr>";
              }).join("") +
              (bad.length > 50 ? '<tr><td colspan="3" class="muted small">and ' + (bad.length - 50) + " more</td></tr>" : "") +
              "</tbody></table></div>"
            : "") +

          (noCat
            ? '<div class="alert warn"><div><b>' + noCat + " row" + (noCat === 1 ? " has" : "s have") +
              " no inward category</b>They will automatically default to " +
              "<b>Opening Stock In</b>. If this is incorrect, please fill in the Inward Category column in your file." +
              "</div></div>"
            : "") +

          (splitByDate
            ? '<div class="alert info"><div><b>A challan number appears on more than one date</b>' +
              "Those rows post as separate documents, one per date, so each carries the date it was counted " +
              "on. That is why the document count is higher than the number of distinct challan numbers." +
              "</div></div>"
            : "") +

          (ok.length
            ? '<div class="scroll-y" style="max-height:200px"><table class="tbl"><thead><tr>' +
              "<th>Row</th><th>Branch</th><th>Product</th><th class=\"num\">Qty</th><th>Challan</th></tr></thead><tbody>" +
              ok.slice(0, 100).map(function (r) {
                return "<tr><td>" + r.line + "</td><td>" + UI.esc(r.branch) + "</td><td>" +
                  UI.esc(r.productName) + '</td><td class="num">' + UI.num(r.qty) + "</td><td>" +
                  UI.esc(r.challanNo || "\u2014") + "</td></tr>";
              }).join("") +
              (ok.length > 100 ? '<tr><td colspan="5" class="muted small">and ' + (ok.length - 100) + " more</td></tr>" : "") +
              "</tbody></table></div>" +
              '<div class="btn-row" style="margin-top:14px">' +
              '<button class="btn btn-primary" id="bulkPost">Post ' + ok.length + " row" +
              (ok.length === 1 ? "" : "s") + " as " + docCount + " document" + (docCount === 1 ? "" : "s") +
              "</button></div>"
            : '<div class="alert warn"><div><b>Nothing to post</b>No row passed validation.</div></div>');

        var postBtn = root.querySelector("#bulkPost");
        if (postBtn) postBtn.onclick = function () { post(docCount, totalQty); };
      }

      function mini(label, value, foot, kind) {
        return '<div class="kpi ' + (kind || "") + '" style="padding:11px 13px">' +
          '<div class="lbl">' + UI.esc(label) + '</div><div class="val" style="font-size:21px">' +
          UI.num(value) + '</div><div class="foot">' + UI.esc(foot || "") + "</div></div>";
      }

      /* ---------- post ---------- */
      function post(docCount, totalQty) {
        var out = root.querySelector("#bulkResult");
        if (out) {
          out.innerHTML = 
            '<div class="alert warn"><div><b>Post ' + state.rows.length + ' rows as ' + docCount + ' inward document(s)?</b><br>' +
            'There is no undo. A wrong quantity is corrected with a reversing outward entry, not by deleting the document.</div></div>' +
            '<div class="btn-row" style="margin-top:14px">' +
              '<button class="btn btn-ghost" id="bulkCancel">Cancel</button>' +
              '<button class="btn btn-primary" id="bulkConfirm">Yes, post now</button>' +
            '</div>';
          var cancelBtn = out.querySelector("#bulkCancel");
          if (cancelBtn) cancelBtn.onclick = function() { validate(state.parsed.rows, out, null); };
          var confirmBtn = out.querySelector("#bulkConfirm");
          if (confirmBtn) confirmBtn.onclick = function() { doActualPost(); };
          return;
        }
        doActualPost();

        function doActualPost() {
            var groups = {};
            state.rows.forEach(function (r) {
              var baseKey = docKey(r);
              groups[baseKey] = groups[baseKey] || [];
              groups[baseKey].push(r);
            });

            var chunkedGroups = {};
            Object.keys(groups).forEach(function (k) {
                var rows = groups[k];
                /* Lines per flow call. Chunking small was a workaround for
                   502s, but it multiplies the number of calls — which is
                   what triggers throttling in the first place — and splits
                   one challan across several documents, so the audit trail
                   no longer matches the paperwork. Tune in js/config.js. */
                var per = w.APP_CONFIG.bulkLinesPerCall || 20;
                for (var i = 0; i < rows.length; i += per) {
                    chunkedGroups[k + "_" + i] = rows.slice(i, i + per);
                }
            });
            var keys = Object.keys(chunkedGroups);
            var groupsToProcess = chunkedGroups;
            var postedKeys = {};
            var lines = 0, failed = [];
            UI.loader(true);

            var gap = w.APP_CONFIG.bulkPostGapMs == null ? 400 : w.APP_CONFIG.bulkPostGapMs;
            keys.reduce(function (chain, k, __idx) {
              return chain.then(function () {
                /* A pause between documents. Power Automate throttles a
                   burst from one client, and a throttled run that half
                   succeeds is far more work to unpick than a slow one. */
                if (gap && __idx > 0) return new Promise(function (r) { setTimeout(r, gap); });
              }).then(function () { return new Promise(function(res) { setTimeout(res, 500); }); }).then(function () {
                var g = groupsToProcess[k];
                var first = g[0];
                var baseKey = k.substring(0, k.lastIndexOf("_"));
                var branchRow = opts.branches.find(function (b) { return b.branchCode === first.branch; });
                return w.API.createBatch({
                  date: first.date, challanNo: first.challanNo, invoiceNo: first.invoiceNo,
                  branch: first.branch, zone: branchRow ? branchRow.zone : "",
                  txnType: "IN", movementCategory: first.movementCategory || "Opening Stock In",
                  partyName: first.partyName,
                  remarks: first.remarks || "Bulk upload"
                }, g.map(function (r) {
                  return { productId: r.productId, productName: r.productName,
                           category: r.category, qty: r.qty, remarks: r.remarks };
                }), user).then(function (res) {
                  postedKeys[baseKey] = true;
                  lines += g.length;
                }).catch(function (e) {
                  failed.push((first.challanNo || first.branch) + ": " + JSON.stringify(e));
                });
              });
            }, Promise.resolve()).then(function () {
              UI.loader(false);
              UI.toast(
                Object.keys(postedKeys).length + " document" + (Object.keys(postedKeys).length === 1 ? "" : "s") + " posted",
                lines + " line" + (lines === 1 ? "" : "s") + " inwarded" +
                (failed.length ? ". " + failed.length + " document(s) failed \u2014 see below." : "."),
                failed.length ? "warn" : "ok");
              if (failed.length) {
                var res = root.querySelector("#bulkResult"); if (res) res.innerHTML =
                  '<div class="alert bad"><div><b>Some documents did not post</b>' +
                  failed.slice(0, 5).map(UI.esc).join("<br>") +
                  (failed.length > 5 ? "<br>and " + (failed.length - 5) + " more" : "") + "</div></div>";
              } else {
                m.close();
              }
              if (opts.onDone) opts.onDone();
            });
        }
      }
    }
  };
})(window, document);
