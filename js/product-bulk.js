/* ============================================================
   product-bulk.js — bulk upload for the product master (HO only)

   Upload a whole product list in one go. Every row is checked
   before anything is written; the preview says exactly what will
   be created, updated, skipped or rejected, and why.

   Matching rules
     code given, exists in master   → update (or "unchanged")
     code given, not in master      → create with that code
     no code, name already exists   → skipped (add its code to update it)
     no code, new name              → create, next free P### code
     a name already used by a different code, or twice in the file → rejected

   Rows are posted one at a time through the same saveProduct flow the
   Add product form uses, so no new flow is needed for upload.
   ============================================================ */
(function (w, d) {
  "use strict";

  var COLS = [
    { key: "code",    label: "Product Code",      width: 14, alias: ["code", "productid", "productcode"] },
    { key: "name",    label: "Product Name *",    width: 48, alias: ["productname", "productnamedescription", "name", "description", "product", "itemname"] },
    { key: "master",  label: "Master Category *", width: 28, alias: ["mastercategory", "master", "category"] },
    { key: "sub",     label: "Sub-group",         width: 24, alias: ["subgroup", "asstaggedinstocksheet"] },
    { key: "uom",     label: "UOM",               width: 10, alias: ["uom", "unitofmeasure", "unit"] },
    { key: "reorder", label: "Reorder Level",     width: 14, alias: ["reorderlevel", "reorder"] }
  ];
  /* An export of the master carries the subcategory in its own column;
     when present it is the more precise of the two. */
  var SUBCAT_ALIAS = ["subcategory", "subcat"];

  function nh(h) { return String(h == null ? "" : h).toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function ns(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

  w.ProductBulk = {
    /* opts: { user, products, onDone, nextCode:function(extraCodes[])→"P###" } */
    open: function (opts) {
      var UI = w.UI, Master = w.Master, CFG = w.APP_CONFIG;
      var user = opts.user;
      var state = { plan: [], running: false, stop: false };

      var m = UI.modal({
        title: "Bulk upload products",
        okText: "",
        cancelText: "Close",
        body:
          '<div class="alert info"><div><b>What this does</b>' +
          "Creates and updates products in the master from a spreadsheet. A row with an existing product " +
          "code updates that product; a row without a code is added as new. Nothing is deleted by an upload.</div></div>" +
          '<div class="btn-row" style="margin-bottom:14px">' +
            '<button class="btn btn-ghost btn-sm" id="pbTpl">Download blank template</button>' +
            '<button class="btn btn-ghost btn-sm" id="pbCur">Template with current products</button>' +
          "</div>" +
          '<div class="field"><label for="pbFile">Choose the completed file</label>' +
            '<input class="input" type="file" id="pbFile" accept=".xlsx,.csv">' +
            '<div class="hint">.xlsx or .csv. First row = column headings, as in the template. ' +
            "Only Product Name and Master Category are mandatory.</div></div>" +
          '<div id="pbOut"></div>'
      });
      var root = m.root;
      var out = root.querySelector("#pbOut");

      /* ---------- master category resolution ---------- */
      var keys = Master.keys();
      var lookup = {};
      keys.forEach(function (k) {
        lookup[ns(k)] = k;
        lookup[ns(Master.label(k))] = k;
        lookup[ns(Master.parentLabel(Master.parentOf(k)) + " " + Master.label(k))] = k;
      });
      Master.tree().forEach(function (n) {
        if (n.children.length === 1) lookup[ns(Master.parentLabel(n.parent))] = n.children[0];
      });
      function resolveMaster(text) {
        var t = ns(text);
        if (!t) return { err: "Master category is required." };
        if (lookup[t]) return { key: lookup[t] };
        if (t === "battery" || t === "batteries")
          return { err: 'Battery is ambiguous \u2014 use "SMF Batteries" or "Lithium Batteries".' };
        if (/lithium|li ion|lfp|\blib\b/.test(t)) return { key: "LITHIUM" };
        if (/\bsmf\b|vrla|lead acid/.test(t)) return { key: "SMF" };
        return { err: '"' + text + '" is not a master category. Use: ' +
          keys.map(function (k) { return Master.label(k); }).join(", ") + "." };
      }

      /* ---------- templates ---------- */
      function sheetsFor(rows) {
        var labels = keys.map(function (k) { return Master.label(k); });
        return [
          { name: "Products", columns: COLS.map(function (c) { return { label: c.label, width: c.width }; }),
            rows: rows.length ? rows : [["", "", "", "", "", ""]],
            validations: [
              { type: "list", range: "C2:C3000", formula1: "Lists!$A$2:$A$" + (labels.length + 1),
                errorTitle: "Category not recognised", error: "Pick a master category from the list.",
                promptTitle: "Master Category", prompt: "Decides where it counts on the Inventory report." },
              { type: "whole", operator: "greaterThanOrEqual", range: "F2:F3000", formula1: "0",
                errorTitle: "Reorder level", error: "Enter a whole number, zero or more.",
                promptTitle: "Reorder Level", prompt: "Flags low stock. Blank = " + CFG.defaultReorderLevel + " for new products." }
            ] },
          { name: "Lists", autoFilter: false,
            columns: [{ label: "Master Category", width: 30 }],
            rows: labels.map(function (l) { return [l]; }) },
          { name: "Instructions", autoFilter: false,
            columns: [{ label: "#", width: 5 }, { label: "How to use this file", width: 110 }],
            rows: [
              [1, "Fill the Products sheet, one product per row. Keep the first row (headings) as it is."],
              [2, "Product Name * and Master Category * are mandatory. Pick the category from the dropdown."],
              [3, "Product Code: leave blank for a new product (the next free P### code is used). Fill it to update that product, or to create a product with a code of your own."],
              [4, "Sub-group, UOM and Reorder Level are optional. Blank on a new product = sub-group from the category, NOS, and the default reorder level. Blank on an existing product = keep what it has."],
              [5, "A name already in the master under a different code, or repeated in the file, is rejected. A row with no code whose name already exists is skipped."],
              [6, "Upload deletes nothing. To remove products, tick them on the Product master screen and use Delete selected."],
              [7, "Tip: \"Template with current products\" gives you the live master in this layout \u2014 edit it and upload to update many products at once."]
            ] }
        ];
      }
      root.querySelector("#pbTpl").onclick = function () {
        UI.exportWorkbook("Product-Master-Upload-Template", sheetsFor([]));
      };
      root.querySelector("#pbCur").onclick = function () {
        var rows = opts.products.slice().sort(function (a, b) {
          return String(a.productId).localeCompare(String(b.productId));
        }).map(function (p) {
          return [p.productId, p.productName, Master.label(Master.of(p.productId)),
                  p.category || "", p.uom || "NOS", Number(p.reorderLevel == null ? CFG.defaultReorderLevel : p.reorderLevel)];
        });
        UI.exportWorkbook("Product-Master-Current-" + w.API.today(), sheetsFor(rows));
      };

      /* ---------- read + validate ---------- */
      root.querySelector("#pbFile").onchange = function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        out.innerHTML = '<div class="empty">Reading ' + UI.esc(file.name) + "\u2026</div>";
        w.XLSXRead.read(file).then(function (res) { validate(res.rows); })
          .catch(function (err) {
            out.innerHTML = '<div class="alert bad"><div><b>Could not read that file</b>' + UI.esc(err.message) + "</div></div>";
          });
      };

      function findHeader(rows) {
        for (var i = 0; i < Math.min(rows.length, 6); i++) {
          var hs = (rows[i] || []).map(nh);
          if (hs.some(function (h) { return COLS[1].alias.indexOf(h) >= 0; })) return i;
        }
        return -1;
      }

      function validate(rows) {
        var hi = findHeader(rows);
        if (hi < 0) {
          out.innerHTML = '<div class="alert bad"><div><b>Headings not found</b>' +
            "The first rows must include a Product Name column. Download the template to see the layout.</div></div>";
          return;
        }
        var map = {}, subCol = -1;
        (rows[hi] || []).forEach(function (h, i) {
          var k = nh(h);
          COLS.forEach(function (c) { if (map[c.key] === undefined && c.alias.indexOf(k) >= 0) map[c.key] = i; });
          if (subCol < 0 && SUBCAT_ALIAS.indexOf(k) >= 0) subCol = i;
        });
        function cell(r, key) { var i = map[key]; return i === undefined ? "" : String(r[i] == null ? "" : r[i]).trim(); }

        var byId = {}, byName = {};
        opts.products.forEach(function (p) {
          byId[p.productId] = p;
          byName[String(p.productName || "").toLowerCase().trim()] = p;
        });
        var seenName = {}, seenCode = {}, plan = [];

        rows.slice(hi + 1).forEach(function (r, idx) {
          if (!r || !r.some(function (x) { return String(x == null ? "" : x).trim() !== ""; })) return;
          var rowNo = hi + 2 + idx;
          var it = { row: rowNo, code: cell(r, "code"), name: cell(r, "name"), status: "", note: "" };
          function bad(msg) { it.status = "error"; it.note = msg; plan.push(it); }

          if (!it.name) return bad("Product name is required.");
          if (it.name.length > 140) return bad("Product name is over 140 characters.");
          if (it.code && !/^[A-Za-z0-9._-]{1,20}$/.test(it.code))
            return bad("Product code may use letters, digits . _ - only (max 20).");
          it.code = it.code.toUpperCase();

          var mtext = subCol >= 0 && String(r[subCol] || "").trim() ? String(r[subCol]).trim() : cell(r, "master");
          var mr = resolveMaster(mtext);
          if (mr.err) return bad(mr.err);
          it.master = mr.key;

          var rl = cell(r, "reorder");
          if (rl !== "") {
            var n = Number(rl);
            if (!isFinite(n) || n < 0 || n !== Math.floor(n)) return bad("Reorder level must be a whole number, zero or more.");
            it.reorder = n;
          }
          it.sub = cell(r, "sub");
          it.uom = cell(r, "uom").slice(0, 12);

          var ln = it.name.toLowerCase();
          if (seenName[ln]) return bad("Same name as row " + seenName[ln] + " in this file.");
          if (it.code && seenCode[it.code]) return bad("Same code as row " + seenCode[it.code] + " in this file.");
          var clash = byName[ln];
          if (clash && it.code !== clash.productId) {
            if (!it.code) { seenName[ln] = rowNo; it.status = "skip"; it.note = "Already in master as " + clash.productId + ". Add that code to update it."; return plan.push(it); }
            return bad('Name already used by ' + clash.productId + ".");
          }
          seenName[ln] = rowNo;
          if (it.code) seenCode[it.code] = rowNo;

          var ex = it.code ? byId[it.code] : null;
          if (ex) {
            var next = {
              productName: it.name,
              category: it.sub || ex.category || Master.label(it.master),
              uom: it.uom || ex.uom || "NOS",
              reorderLevel: it.reorder != null ? it.reorder : Number(ex.reorderLevel == null ? CFG.defaultReorderLevel : ex.reorderLevel)
            };
            var same = next.productName === ex.productName && next.category === (ex.category || "") &&
              next.uom === (ex.uom || "NOS") && next.reorderLevel === Number(ex.reorderLevel == null ? CFG.defaultReorderLevel : ex.reorderLevel) &&
              it.master === Master.of(ex.productId);
            it.rec = Object.assign({ productId: ex.productId, master: it.master, masterConfirmed: true }, next);
            it.status = same ? "same" : "update";
            it.note = same ? "No change." : "Updates " + ex.productName + (ex.productName !== it.name ? " (renamed)" : "") + ".";
          } else {
            it.rec = {
              productId: it.code, productName: it.name,
              category: it.sub || Master.label(it.master), uom: it.uom || "NOS",
              reorderLevel: it.reorder != null ? it.reorder : CFG.defaultReorderLevel,
              master: it.master, masterConfirmed: true
            };
            it.status = "new";
            it.note = it.code ? "New, with the code supplied." : "New.";
          }
          plan.push(it);
        });

        /* Codes for new rows without one, after every supplied code is known. */
        var supplied = plan.filter(function (x) { return x.rec && x.rec.productId; }).map(function (x) { return x.rec.productId; });
        plan.forEach(function (x) {
          if (x.status === "new" && !x.rec.productId) {
            x.rec.productId = opts.nextCode(supplied);
            supplied.push(x.rec.productId);
          }
        });
        state.plan = plan;
        preview();
      }

      /* ---------- preview ---------- */
      var LABEL = { "new": ["in", "New"], update: ["info", "Update"], same: ["neutral", "Unchanged"], skip: ["warn", "Skipped"], error: ["out", "Rejected"] };
      function count(s) { return state.plan.filter(function (x) { return x.status === s; }).length; }

      function preview() {
        var n = count("new"), u = count("update"), s = count("same"), k = count("skip"), e = count("error");
        var todo = n + u;
        out.innerHTML =
          '<div class="bulk-stats">' +
            ["new", "update", "same", "skip", "error"].map(function (st) {
              return '<span class="badge ' + LABEL[st][0] + '">' + count(st) + " " + LABEL[st][1].toLowerCase() + "</span>";
            }).join("") + "</div>" +
          (state.plan.length ? "" : '<div class="alert warn"><div>No product rows found under the headings.</div></div>') +
          (e ? '<div class="alert warn"><div><b>' + e + " row" + (e === 1 ? "" : "s") + " rejected</b>" +
            "They will not be uploaded. Fix them in the file and upload again, or carry on with the rest.</div></div>" : "") +
          '<div class="bulk-scroll"><table class="tbl"><thead><tr><th>Row</th><th>Code</th><th>Product</th><th>Category</th><th>Result</th></tr></thead><tbody>' +
          state.plan.slice(0, 300).map(function (x) {
            var l = LABEL[x.status];
            return "<tr><td>" + x.row + '</td><td class="mono">' + UI.esc((x.rec && x.rec.productId) || x.code || "\u2014") + "</td><td>" +
              UI.esc(x.name || "\u2014") + "</td><td>" + UI.esc(x.master ? Master.label(x.master) : "\u2014") +
              '</td><td><span class="badge ' + l[0] + '">' + l[1] + '</span> <span class="muted small">' + UI.esc(x.note) + "</span></td></tr>";
          }).join("") + "</tbody></table></div>" +
          (state.plan.length > 300 ? '<div class="muted small" style="margin-top:6px">Showing the first 300 of ' + state.plan.length + " rows. All are processed.</div>" : "") +
          '<div class="btn-row" style="margin-top:14px">' +
            '<button class="btn btn-primary" id="pbGo"' + (todo ? "" : " disabled") + ">Upload " + todo + " product" + (todo === 1 ? "" : "s") + "</button></div>";
        var go = out.querySelector("#pbGo");
        if (go) go.onclick = post;
      }

      /* ---------- post, one product at a time ---------- */
      function post() {
        if (state.running) return;
        var queue = state.plan.filter(function (x) { return x.status === "new" || x.status === "update"; });
        var done = 0, ok = 0, fails = [], streak = 0, aborted = "";
        state.running = true; state.stop = false;

        out.innerHTML =
          '<div id="pbMsg"><b>Uploading\u2026</b> <span id="pbCnt">0 / ' + queue.length + "</span></div>" +
          '<div class="bulk-prog"><i id="pbBar"></i></div>' +
          '<div class="btn-row"><button class="btn btn-ghost btn-sm" id="pbStop">Stop after this row</button></div>' +
          '<div class="muted small" style="margin-top:8px">Keep this window open. Closing it does not cancel the run.</div>';
        out.querySelector("#pbStop").onclick = function () { state.stop = true; this.disabled = true; this.textContent = "Stopping\u2026"; };

        function tick() {
          var c = out.querySelector("#pbCnt"), b = out.querySelector("#pbBar");
          if (c) c.textContent = done + " / " + queue.length;
          if (b) b.style.width = (queue.length ? Math.round(done / queue.length * 100) : 100) + "%";
        }
        function finish() {
          state.running = false;
          try { w.API.log("PRODUCT_BULK_UPLOAD", { entity: "products", productName: ok + " saved, " + fails.length + " failed" }, user); } catch (e) { /* log only */ }
          out.innerHTML =
            '<div class="alert ' + (fails.length || aborted ? "warn" : "info") + '"><div><b>' + ok + " of " + queue.length + " product" +
            (queue.length === 1 ? "" : "s") + " saved</b>" +
            (aborted ? UI.esc(aborted) + " " : "") +
            (fails.length ? fails.length + " failed \u2014 listed below." : (aborted ? "" : "All rows went through.")) + "</div></div>" +
            (fails.length ? '<div class="bulk-scroll"><table class="tbl"><thead><tr><th>Row</th><th>Product</th><th>Reason</th></tr></thead><tbody>' +
              fails.slice(0, 100).map(function (f) {
                return "<tr><td>" + f.row + "</td><td>" + UI.esc(f.name) + "</td><td>" + UI.esc(f.err) + "</td></tr>";
              }).join("") + "</tbody></table></div>" : "");
          if (opts.onDone) opts.onDone(ok);
        }
        function next(i) {
          if (state.stop) { aborted = "Stopped by you after " + done + " rows."; return finish(); }
          if (i >= queue.length) return finish();
          var x = queue[i];
          w.API.saveProduct(x.rec, { isNew: x.status === "new" }).then(function () { ok++; streak = 0; })
            .catch(function (err) {
              fails.push({ row: x.row, name: x.name, err: err.message }); streak++;
            })
            .then(function () {
              done++; tick();
              if (streak >= 3) { aborted = "Stopped after 3 failures in a row \u2014 the first reason is below. Fix that, then upload the same file again."; return finish(); }
              setTimeout(function () { next(i + 1); }, CFG.bulkPostGapMs || 400);
            });
        }
        next(0);
      }
    }
  };
})(window, document);
