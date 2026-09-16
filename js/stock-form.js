/* ============================================================
   stock-form.js — the inward / outward document entry screen

   Split out of stocks.js: only inward.html and outward.html need
   it, and it is the largest single controller in the portal.
   Requires js/stock-core.js.
   ============================================================ */
(function (w, d) {
  "use strict";

  var Stock = w.Stock;

  /* ============================================================
     DOCUMENT ENTRY FORM  (inward.html / outward.html)

     One challan or invoice, many product lines. The header details
     are entered once; each line carries its own product, quantity
     and optional remark. The whole document saves as one operation
     or not at all.
     ============================================================ */
  var StockForm = {
    mount: function (type) {
      var isIn = type === "IN";
      var page = isIn ? "inward" : "outward";
      var user = w.Auth.require(page);
      if (!user) return;

      var UI = w.UI;
      var content = UI.shell(user, page, isIn ? "Stock inward" : "Stock outward");
      var state = { data: null, branchSel: null, lines: [], seq: 0 };

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow">' +
        "<h1>" + (isIn ? "Record stock received" : "Record stock issued") + "</h1>" +
        "<p>" + (isIn
          ? "One challan or invoice, as many product lines as it carries. Balances move when you save."
          : "One challan or invoice, as many product lines as it carries. A line that would take a balance below zero stops the whole document.") +
        "</p></div>" +
        '<div class="btn-row no-print">' +
        (isIn ? '<button class="btn btn-ghost btn-sm" id="bulkBtn">Bulk upload</button>' : "") +
        '<button class="btn btn-ghost btn-sm" id="importBtn">Paste extracted lines</button></div>' +
        "</div>" +

        '<div class="card"><div class="card-head"><h3>Document details</h3>' +
          '<span class="badge ' + (isIn ? "in" : "out") + '">' + (isIn ? "Inward" : "Outward") + "</span>" +
          '<div class="topbar-spacer"></div><span class="sub" id="docRef"></span></div>' +
          '<div class="card-body"><div class="grid g-4" style="gap:0 14px">' +
            '<div class="field"><label for="fDate">Date of ' + (isIn ? "inward" : "outward") +
              ' done <span class="req">*</span></label>' +
              '<input class="input" type="date" id="fDate" required>' +
              '<div class="hint" id="dateHint"></div></div>' +
            '<div class="field"><label for="fEntryDate">Date of entry at portal</label>' +
              '<input class="input" type="date" id="fEntryDate" readonly>' +
              '<div class="hint">Set by the system. Not editable.</div></div>' +
            '<div class="field"><label for="fMoveCat">' + (isIn ? "Inward" : "Outward") +
              ' category <span class="req">*</span></label>' +
              '<select class="input" id="fMoveCat"><option value="">\u2014 select \u2014</option>' +
              (w.APP_CONFIG.movementCategories[type] || []).map(function (c) {
                return '<option value="' + UI.esc(c) + '">' + UI.esc(c) + "</option>";
              }).join("") + "</select>" +
              '<div class="hint">Why the stock is moving.</div></div>' +
            '<div class="field"><label>Branch <span class="req">*</span></label>' +
              '<div id="fBranchMount"></div><div class="hint" id="branchHint"></div></div>' +
          "</div>" +
          '<div class="grid g-2" style="gap:0 14px">' +
            '<div class="field"><label for="fChallan">Challan number</label>' +
              '<input class="input" id="fChallan" maxlength="40" placeholder="e.g. CH/2026/0184"></div>' +
            '<div class="field"><label for="fInvoice">Invoice number</label>' +
              '<input class="input" id="fInvoice" maxlength="40" placeholder="e.g. INV-77213"></div>' +
          "</div>" +
          '<div class="grid g-2" style="gap:0 14px">' +
            '<div class="field"><label for="fParty">Party name</label>' +
              '<input class="input" id="fParty" maxlength="120" placeholder="' +
              (isIn ? "Who sent this stock" : "Who is receiving this stock") + '"></div>' +
            '<div class="field"><label for="fRemarks">Remarks for the whole document</label>' +
              '<input class="input" id="fRemarks" maxlength="300" placeholder="Applies to every line unless a line has its own"></div>' +
          "</div></div></div>" +

        '<div class="card mt"><div class="card-head"><h3>Product lines</h3>' +
          '<span class="sub" id="lineCount"></span><div class="topbar-spacer"></div>' +
          '<button class="btn btn-ghost btn-sm no-print" id="addLineBtn">Add line</button></div>' +
          '<div class="card-body">' +
            '<div class="line-head no-print">' +
              "<div>Product</div><div>Qty</div><div>Balance</div><div>Line remark</div><div></div>" +
            "</div>" +
            '<div class="lines" id="lines"></div>' +
            '<div id="lineEmpty" class="empty hidden"><b>No lines yet</b>Add the first product from this document.</div>' +
          "</div>" +
          '<div class="card-head" style="border-top:1px solid var(--line);border-bottom:0">' +
            '<div id="docTotals" class="small muted"></div><div class="topbar-spacer"></div>' +
            '<div class="btn-row">' +
              '<button class="btn btn-ghost" id="clearBtn">Clear document</button>' +
              '<button class="btn btn-primary" id="saveBtn">' +
              (isIn ? "Save inward document" : "Save outward document") + "</button>" +
            "</div></div></div>" +

        '<div class="card mt"><div class="card-head"><h3>Your recent documents</h3>' +
          '<span class="sub">last 10</span></div><div id="recentMount"></div></div>';

      var canBackdate = w.RBAC.can(user, "canBackdateOutward");
      var dateEl = d.getElementById("fDate");
      d.getElementById("fEntryDate").value = w.API.today();
      dateEl.value = w.API.today();
      dateEl.max = w.API.today();

      /* Outward cannot be back-dated at branch level: issuing stock on a
         past date changes a balance that reports and audits have already
         been run against. Inward can be — goods arrive before the
         paperwork does. */
      if (!isIn && !canBackdate) {
        dateEl.min = w.API.today();
        d.getElementById("dateHint").textContent =
          "Today only. Outward entries cannot be back-dated at branch level.";
      } else {
        d.getElementById("dateHint").textContent = isIn
          ? "Any past date. Use the date the stock actually arrived."
          : "You may back-date this entry.";
      }

      /* ---------- lines ---------- */

      function addLine(prefill) {
        var id = "L" + (++state.seq);
        var row = UI.el("div", { class: "line-row", id: id });
        if (row) row.innerHTML =
          '<div class="line-cell" data-label="Product"><div class="mount"></div>' +
            '<div class="hint line-note"></div></div>' +
          '<div class="line-cell" data-label="Qty">' +
            '<input class="input qty" type="number" min="1" step="1" placeholder="0"></div>' +
          '<div class="line-cell" data-label="Balance"><div class="line-bal muted small">&mdash;</div></div>' +
          '<div class="line-cell" data-label="Remark">' +
            '<input class="input rem" maxlength="200" placeholder="Optional"></div>' +
          '<div class="line-cell line-actions">' +
            '<button class="icon-btn no-print" title="Remove this line" aria-label="Remove line">&times;</button></div>';
        d.getElementById("lines").appendChild(row);

        var rec = {
          id: id, root: row, sel: null,
          qtyEl: row.querySelector(".qty"),
          remEl: row.querySelector(".rem"),
          balEl: row.querySelector(".line-bal"),
          noteEl: row.querySelector(".line-note")
        };

        /* Setting a value fires onChange straight away, so the select is
           attached to the record before the record joins the list —
           otherwise the first repaint sees a line with no select. */
        rec.sel = UI.searchableSelect(row.querySelector(".mount"), {
          placeholder: "Search products",
          searchPlaceholder: "Type part of the product name\u2026",
          items: productItems(),
          value: prefill && prefill.productId ? prefill.productId : "",
          onChange: repaint
        });
        state.lines.push(rec);

        rec.qtyEl.addEventListener("input", repaint);
        row.querySelector(".line-actions button").onclick = function () { removeLine(id); };

        if (prefill) {
          if (prefill.qty) rec.qtyEl.value = prefill.qty;
          if (prefill.remarks) rec.remEl.value = prefill.remarks;
        }
        repaint();
        return rec;
      }

      function removeLine(id) {
        var i = state.lines.findIndex(function (l) { return l.id === id; });
        if (i < 0) return;
        state.lines[i].root.remove();
        state.lines.splice(i, 1);
        if (!state.lines.length) addLine();
        repaint();
      }

      function productItems() {
        if (!state.data) return [];
        var branch = state.branchSel ? state.branchSel.value : "";
        var items = state.data.products.map(function (p) {
          var bal = branch ? Stock.balanceOf(state.data.stocks, branch, p.productId) : null;
          return { value: p.productId, label: p.productName, group: p.category, meta: bal == null ? "" : "bal " + bal };
        });
        /* Outward only offers what the branch actually holds. */
        if (!isIn && branch) {
          items = items.filter(function (i) {
            return Stock.balanceOf(state.data.stocks, branch, i.value) > 0;
          });
        }
        return items;
      }

      /* Recompute every line's balance preview. Lines are projected in
         order, so the same product appearing twice on one document
         shows the right running figure on each row. */
      function repaint() {
        if (!state.data) return;
        var branch = state.branchSel ? state.branchSel.value : "";
        var projected = {};
        var totalQty = 0, filled = 0, problems = 0;

        state.lines.forEach(function (ln) {
          if (!ln.sel) return;
          var pid = ln.sel.value;
          var qty = Number(ln.qtyEl.value) || 0;
          ln.root.classList.remove("bad");
          ln.noteEl.textContent = "";
          ln.noteEl.classList.remove("error");

          if (!pid || !branch) { if (ln.balEl) ln.balEl.innerHTML = "&mdash;"; return; }

          if (!(pid in projected)) projected[pid] = Stock.balanceOf(state.data.stocks, branch, pid);
          var before = projected[pid];
          var after = isIn ? before + qty : before - qty;

          var prod = state.data.products.find(function (p) { return p.productId === pid; });
          var lvl = Stock.reorderLevel(prod);
          var short = !isIn && after < 0;

          if (ln.balEl) ln.balEl.innerHTML =
            '<span class="bal-now">' + UI.num(before) + "</span> " +
            '<span class="bal-arrow">\u2192</span> ' +
            '<b class="' + (short ? "bal-bad" : after <= lvl ? "bal-warn" : "") + '">' + UI.num(after) + "</b>";

          if (short) {
            problems++;
            ln.root.classList.add("bad");
            ln.noteEl.textContent = "Only " + UI.num(before) + " available at " + branch + ".";
            ln.noteEl.classList.add("error");
          } else if (qty > 0 && after <= lvl) {
            ln.noteEl.textContent = "Leaves this branch at or below its reorder level of " + lvl + ".";
          }

          if (qty > 0) {
            projected[pid] = after;
            totalQty += qty;
            filled++;
          }
        });

        var lc = d.getElementById("lineCount");
        if (lc) lc.textContent =
          state.lines.length + " line" + (state.lines.length === 1 ? "" : "s");
        var dt = d.getElementById("docTotals");
        if (dt) dt.innerHTML =
          filled
            ? "<b>" + filled + "</b> line" + (filled === 1 ? "" : "s") + " ready \u00b7 <b>" +
              UI.num(totalQty) + "</b> units total" +
              (problems ? ' \u00b7 <span style="color:var(--bad-600)"><b>' + problems +
                          "</b> line" + (problems === 1 ? "" : "s") + " short on stock</span>" : "")
            : "Nothing to save yet.";

        var fChallan = d.getElementById("fChallan");
        var fInvoice = d.getElementById("fInvoice");
        if (fChallan && fInvoice) {
          var ref = [fChallan.value, fInvoice.value]
            .filter(Boolean).join(" \u00b7 ");
          var docRef = d.getElementById("docRef");
          if (docRef) docRef.textContent = ref;
        }
        var le = d.getElementById("lineEmpty");
        if (le) le.classList.toggle("hidden", state.lines.length > 0);
      }

      /* ---------- data ---------- */

      function refresh() {
        return w.API.scopedData(user).then(function (data) {
          var fBranchMount = d.getElementById("fBranchMount");
          if (!fBranchMount) return;
          state.data = data;

          if (!state.branchSel) {
            var writable = data.branches.filter(function (b) {
              return w.RBAC.canWriteBranch(user, b.branchCode);
            });;
            state.branchSel = UI.searchableSelect(d.getElementById("fBranchMount"), {
              placeholder: "Select branch",
              items: writable.map(function (b) {
                return { value: b.branchCode, label: b.branchCode + " \u2014 " + b.branchName, group: b.zone };
              }),
              value: user.role === "HO_ADMIN" ? "" : user.branch,
              onChange: function () {
                state.lines.forEach(function (l) { l.sel.setItems(productItems()); });
                repaint();
              }
            });
            d.getElementById("branchHint").textContent = user.role === "HO_ADMIN"
              ? "You can post for any branch."
              : "Fixed to your branch.";
            if (user.role !== "HO_ADMIN") {
              d.getElementById("fBranchMount").querySelector(".ss-toggle").disabled = true;
            }
          }

          if (!state.lines.length) addLine();
          else state.lines.forEach(function (l) { l.sel.setItems(productItems()); });

          paintRecent();
          repaint();
        }).catch(function (e) {
          UI.toast("Failed to load page data", e.message, "bad");
        });
      }

      /* Group this user's transactions back into the documents they
         were entered as. */
      function paintRecent() {
        var mine = state.data.txns.filter(function (t) {
          return t.enteredBy === user.username && t.txnType === type;
        });
        var docs = {};
        mine.forEach(function (t) {
          var k = t.batchId || t.transactionId;
          var doc = docs[k] || (docs[k] = {
            ref: t.challanNo || t.invoiceNo || "\u2014",
            date: t.date, entryDate: t.entryDate || "", cat: t.movementCategory || "\u2014",
            branch: t.branch, party: t.partyName,
            lines: 0, qty: 0, timestamp: t.timestamp,
            products: []
          });
          doc.lines++; doc.qty += Number(t.qty) || 0;
          doc.products.push(t.productName + " \u00d7 " + t.qty);
        });
        var rows = Object.keys(docs).map(function (k) { return docs[k]; })
          .sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); })
          .slice(0, 10);

        UI.grid(d.getElementById("recentMount"), {
          search: false, pageSize: 10,
          emptyTitle: "No documents from you yet",
          emptyText: "Saved challans and invoices appear here.",
          columns: [
            { key: "date", label: "Movement date", render: function (r) {
                return UI.fmtDate(r.date) +
                  (r.entryDate && r.entryDate !== r.date
                    ? '<br><span class="muted small">entered ' + UI.fmtDate(r.entryDate) + "</span>"
                    : ""); } },
            { key: "cat", label: "Category", render: function (r) {
                return '<span class="badge neutral">' + UI.esc(r.cat) + "</span>"; } },
            { key: "ref", label: "Challan / invoice", render: function (r) {
                return '<span class="mono">' + UI.esc(r.ref) + "</span>"; } },
            { key: "lines", label: "Lines", type: "num", render: function (r) {
                return '<span class="badge neutral" title="' + UI.esc(r.products.join("\n")) + '">' +
                  r.lines + "</span>"; } },
            { key: "qty", label: "Total qty", type: "num", render: function (r) { return UI.num(r.qty); } }
          ],
          rows: rows
        });
      }

      /* ---------- actions ---------- */

      if (isIn && d.getElementById("bulkBtn")) {
        d.getElementById("bulkBtn").onclick = function () {
          if (!state.data) { UI.toast("Still loading", "Please wait for the page data to finish loading.", "warn"); return; }
          if (!w.BulkUpload) { UI.toast("Not available", "The bulk upload module is not loaded.", "bad"); return; }
          w.BulkUpload.open({
            user: user,
            branches: state.data.branches,
            products: state.data.products,
            onDone: refresh
          });
        };
      }

      d.getElementById("addLineBtn").onclick = function () {
        var rec = addLine();
        rec.sel.focus();
      };
      d.getElementById("fChallan").addEventListener("input", repaint);
      d.getElementById("fInvoice").addEventListener("input", repaint);

      d.getElementById("clearBtn").onclick = function () {
        UI.modal({
          title: "Clear this document?", okText: "Clear it", danger: true,
          body: "<p>Removes every line and empties the header. Nothing already saved is affected.</p>",
          onOk: function () {
            ["fChallan", "fInvoice", "fParty", "fRemarks"].forEach(function (k) { d.getElementById(k).value = ""; });
            d.getElementById("fMoveCat").value = "";
            d.getElementById("fDate").value = w.API.today();
            var linesEl = d.getElementById("lines"); if (linesEl) linesEl.innerHTML = "";
            state.lines = [];
            addLine();
            repaint();
          }
        });
      };

      /* Accepts the JSON an invoice-extraction step produces, so lines
         can be filled from a scanned challan instead of typed. Product
         names are matched against the master; anything unmatched is
         listed rather than guessed at. */
      d.getElementById("importBtn").onclick = function () {
        UI.modal({
          title: "Paste extracted lines",
          okText: "Fill the lines",
          body:
            '<p class="small muted">Paste the JSON from your invoice extraction step. ' +
            "The challan or invoice number fills the header; each material becomes a line.</p>" +
            '<textarea class="input mono" id="impText" style="min-height:180px" placeholder=\'{\n "InvoiceOrChallanNo": "CH/2026/0184",\n "Materials": [\n  { "MaterialName": "Battery 120AH Exide", "Quantity": "10" }\n ]\n}\'></textarea>' +
            '<div class="hint" id="impHint">Material names are matched against the 111-product master.</div>',
          onOk: function (root) {
            var raw = root.querySelector("#impText").value.trim();
            if (!raw) { UI.toast("Nothing pasted", "Paste the extraction JSON first.", "warn"); return false; }
            var parsed;
            try { parsed = JSON.parse(raw); }
            catch (e) { UI.toast("Could not read that", "It is not valid JSON. Check for a missing bracket or comma.", "bad"); return false; }

            var mats = parsed.Materials || parsed.materials || [];
            if (!mats.length) { UI.toast("No materials found", "The JSON has no Materials array.", "warn"); return false; }

            var ref = parsed.InvoiceOrChallanNo || parsed.invoiceOrChallanNo || "";
            if (ref) {
              var f = /inv/i.test(ref) ? "fInvoice" : "fChallan";
              d.getElementById(f).value = ref;
            }

            var matched = 0, unmatched = [];
            var pool = productItems();
            var linesEl = d.getElementById("lines"); if (linesEl) linesEl.innerHTML = "";
            state.lines = [];

            mats.forEach(function (m) {
              var name = String(m.MaterialName || m.materialName || "").trim();
              var qty = String(m.Quantity == null ? "" : m.Quantity).replace(/[^0-9.]/g, "");
              var hit = matchProduct(name, pool);
              if (hit) matched++; else if (name) unmatched.push(name);
              addLine({ productId: hit ? hit.value : "", qty: qty, remarks: hit ? "" : name });
            });
            if (!state.lines.length) addLine();
            repaint();

            UI.toast(
              matched + " of " + mats.length + " matched",
              unmatched.length
                ? "Not matched: " + unmatched.slice(0, 3).join("; ") +
                  (unmatched.length > 3 ? " and " + (unmatched.length - 3) + " more" : "") +
                  ". Pick those products by hand."
                : "Check the quantities, then save.",
              unmatched.length ? "warn" : "ok"
            );
          }
        });
      };

      /* Exact name first, then a normalised comparison, then a token
         overlap. Anything weaker is left for a person to decide. */
      function matchProduct(name, pool) {
        if (!name) return null;
        var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); };
        var target = norm(name);
        var exact = pool.find(function (p) { return norm(p.label) === target; });
        if (exact) return exact;
        var contains = pool.find(function (p) {
          var n = norm(p.label);
          return n.indexOf(target) >= 0 || target.indexOf(n) >= 0;
        });
        if (contains) return contains;
        var tokens = target.split(" ").filter(function (t) { return t.length > 1; });
        if (tokens.length < 2) return null;
        var best = null, bestScore = 0;
        pool.forEach(function (p) {
          var n = norm(p.label);
          var hits = tokens.filter(function (t) { return n.indexOf(t) >= 0; }).length;
          var score = hits / tokens.length;
          if (score > bestScore) { bestScore = score; best = p; }
        });
        return bestScore >= 0.7 ? best : null;
      }

      d.getElementById("saveBtn").onclick = function () {
        if (!state.data || !state.branchSel) { UI.toast("Still loading", "Please wait for the page data to finish loading.", "warn"); return; }
        var branch = state.branchSel.value;
        if (!branch) { UI.toast("Branch missing", "Select the branch this document belongs to.", "warn"); return; }
        if (!w.RBAC.canWriteBranch(user, branch)) {
          UI.toast("Not allowed", "Your role cannot post entries for " + branch + ".", "bad");
          return;
        }

        var lines = [], blank = 0;
        for (var i = 0; i < state.lines.length; i++) {
          var ln = state.lines[i];
          var pid = ln.sel.value, qty = Number(ln.qtyEl.value);
          if (!pid && !qty) { blank++; continue; }
          if (!pid) {
            ln.sel.markInvalid(true);
            UI.toast("Line " + (i + 1) + " has no product", "Pick a product or remove the line.", "warn");
            return;
          }
          if (!qty || qty <= 0 || qty !== Math.floor(qty)) {
            ln.qtyEl.classList.add("err");
            ln.qtyEl.focus();
            UI.toast("Line " + (i + 1) + " needs a quantity", "Enter a whole number above zero.", "warn");
            return;
          }
          ln.qtyEl.classList.remove("err");
          var prod = state.data.products.find(function (p) { return p.productId === pid; });
          lines.push({
            productId: pid, productName: prod.productName, category: prod.category,
            qty: qty, remarks: ln.remEl.value
          });
        }

        if (!lines.length) {
          UI.toast("Nothing to save", "Add at least one product line with a quantity.", "warn");
          return;
        }

        var moveCat = d.getElementById("fMoveCat").value;
        if (!moveCat) {
          UI.toast((isIn ? "Inward" : "Outward") + " category needed",
            "Choose why the stock is moving.", "warn");
          d.getElementById("fMoveCat").focus();
          return;
        }

        var docDate = dateEl.value;
        if (!isIn && docDate < w.API.today() && !canBackdate) {
          UI.toast("Date not allowed",
            "Outward entries cannot be back-dated at branch level. Ask HO to post it if it " +
            "genuinely belongs to " + UI.fmtDate(docDate) + ".", "bad");
          dateEl.focus();
          return;
        }

        var branchRow = state.data.branches.find(function (b) { return b.branchCode === branch; });
        var header = {
          date: d.getElementById("fDate").value,
          challanNo: d.getElementById("fChallan").value,
          invoiceNo: d.getElementById("fInvoice").value,
          branch: branch,
          zone: branchRow ? branchRow.zone : user.zone,
          txnType: type,
          movementCategory: moveCat,
          partyName: d.getElementById("fParty").value,
          remarks: d.getElementById("fRemarks").value
        };

        var btn = d.getElementById("saveBtn");
        btn.disabled = true;
        UI.loader(true);

        w.API.createBatch(header, lines, user).then(function (res) {
          var ref = header.challanNo || header.invoiceNo;
          UI.toast(
            (isIn ? "Inward saved" : "Outward saved") + " \u00b7 " + res.lineCount + " line" + (res.lineCount === 1 ? "" : "s"),
            (ref ? ref + " \u2014 " : "") + UI.num(res.totalQty) + " units at " + branch + ".",
            "ok"
          );
          var linesEl = d.getElementById("lines"); if (linesEl) linesEl.innerHTML = "";
          state.lines = [];
          ["fChallan", "fInvoice", "fRemarks"].forEach(function (k) { d.getElementById(k).value = ""; });
          d.getElementById("fMoveCat").value = "";
          addLine();
          return refresh();
        }).catch(function (err) {
          UI.toast("Document not saved", err.message + " Nothing was posted.", "bad");
        }).then(function () {
          btn.disabled = false;
          UI.loader(false);
        });
      };

      refresh();
      w.API.onChange(function () {
        if (state.data) refresh();
      });
    }
  };

  w.StockForm = StockForm;
})(window, document);
