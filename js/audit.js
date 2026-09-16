/* ============================================================
   audit.js — the Stock Auditor screens

     AuditWorkspace  dashboard, cycles, my review queue
     AuditCycle      line-by-line verification
     AuditCase       the discrepancy thread, three role views
     Adjustments     HO approval of audit corrections

   All state changes go through window.Audit. No screen here can
   reach a stock write.
   ============================================================ */
(function (w, d) {
  "use strict";

  function statusBadge(status) {
    var A = w.Audit, cls = "neutral";
    if (status === A.STATUS.VERIFIED || status === A.STATUS.CLOSED) cls = "in";
    else if (status === A.STATUS.JUSTIFICATION || status === A.STATUS.CLARIFICATION) cls = "warn";
    else if (status === A.STATUS.RESPONDED) cls = "info";
    else if (status === A.STATUS.UNRESOLVED || status === A.STATUS.CANCELLED) cls = "out";
    return '<span class="badge ' + cls + '">' + w.UI.esc(A.LABEL[status] || status) + "</span>";
  }

  function varianceCell(line) {
    var UI = w.UI;
    if (line.qtyDifference == null) return "\u2014";
    var diff = line.qtyDifference;
    var pct = line.variancePercent;
    var colour = diff === 0 ? "inherit" : diff < 0 ? "var(--bad-600)" : "var(--warn-600)";
    return '<span style="color:' + colour + '">' + (diff > 0 ? "+" : "") + UI.num(diff) + "</span>" +
      (pct == null
        ? '<br><span class="muted small" title="System quantity is zero, so a percentage cannot be calculated">n/a</span>'
        : '<br><span class="muted small">' + pct.toFixed(1) + "%</span>");
  }

  function caseLink(lineId, label) {
    return '<a href="audit-case.html?line=' + encodeURIComponent(lineId) + '">' + w.UI.esc(label) + "</a>";
  }

  /* ============================================================
     AUDIT WORKSPACE
     ============================================================ */
  w.AuditWorkspace = {
    mount: function () {
      var user = w.Auth.require("audit-workspace");
      if (!user) return;
      var UI = w.UI, A = w.Audit;
      var content = UI.shell(user, "audit-workspace", "Audit workspace");
      var state = {};

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1>Audit workspace</h1>' +
        "<p>" + UI.esc(w.RBAC.scopeLabel(user)) + ". Open a cycle for a branch, then work the line list.</p></div>" +
        '<div class="btn-row no-print"><button class="btn btn-primary btn-sm" id="newCycle">Open audit cycle</button></div></div>' +
        '<div id="notices"></div>' +
        '<div class="grid g-5" id="aKpis"></div>' +
        '<div class="card mt"><div class="card-head"><h3>Awaiting my review</h3>' +
          '<span class="sub" id="reviewSub"></span></div><div id="reviewGrid"></div></div>' +
        '<div class="card mt"><div class="card-head"><h3>Audit cycles</h3>' +
          '<span class="sub" id="cycleSub"></span></div><div id="cycleGrid"></div></div>';

      function load() {
        return Promise.all([w.API.getBranches(), A.cycles(), A.lines()]).then(function (r) {
          var branches = r[0], cycles = r[1], lines = r[2];
          var scope = A.scopeFor(user, branches);
          var inScope = function (b) { return scope.indexOf(b) >= 0; };

          state.branches = branches;
          state.scope = scope;
          cycles = cycles.filter(function (c) { return inScope(c.branch); });
          lines = lines.filter(function (l) { return inScope(l.branch); });
          state.cycles = cycles;

          var pending = lines.filter(function (l) { return l.status === A.STATUS.PENDING; });
          var open = lines.filter(function (l) { return !A.isTerminal(l.status) && l.status !== A.STATUS.PENDING; });
          var review = lines.filter(function (l) { return l.status === A.STATUS.RESPONDED; });
          var overdue = open.filter(function (l) { return A.slaState(l).level !== "ok" && A.slaState(l).owner === "Branch"; });

          var aKpis = d.getElementById("aKpis");
          if (!aKpis) return;
          if (aKpis) aKpis.innerHTML =
            kpi("Open cycles", cycles.filter(function (c) { return c.status === "OPEN"; }).length, "in your scope") +
            kpi("Lines pending", pending.length, "still to count") +
            kpi("Discrepancies open", open.length, "with branches", open.length ? "warn" : "") +
            kpi("Awaiting my review", review.length, review.length ? "branch has responded" : "nothing waiting", review.length ? "bad" : "ok") +
            kpi("Overdue with branch", overdue.length, "past SLA", overdue.length ? "bad" : "");

          if (!scope.length) {
            var notices = d.getElementById("notices");
            if (notices) {
              if (notices) notices.innerHTML =
                '<div class="alert warn"><div><b>No branches in your audit scope</b>' +
                "Ask HO Admin to set your scope on the Users screen. If your own branch is the only one listed, " +
                "it is excluded on purpose \u2014 an auditor cannot audit their own branch.</div></div>";
            }
          }

          d.getElementById("reviewSub").textContent = review.length + " case" + (review.length === 1 ? "" : "s");
          UI.grid(d.getElementById("reviewGrid"), {
            rows: review.sort(function (a, b) { return A.ageInDays(b) - A.ageInDays(a); }),
            search: false, pageSize: 10,
            emptyTitle: "Nothing waiting on you",
            emptyText: "Cases appear here when a branch has answered.",
            columns: [
              { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
              { key: "productName", label: "Product", render: function (r) { return caseLink(r.lineId, r.productName); } },
              { key: "systemQtyAtSubmit", label: "System", type: "num", render: function (r) { return UI.num(r.systemQtyAtSubmit); } },
              { key: "physicalQty", label: "Counted", type: "num", render: function (r) { return UI.num(r.physicalQty); } },
              { key: "qtyDifference", label: "Difference", type: "num", render: varianceCell },
              { key: "roundCount", label: "Rounds", type: "num", render: function (r) { return r.roundCount || 1; } },
              { key: "age", label: "Age", type: "num",
                raw: function (r) { return A.ageInDays(r); },
                render: function (r) {
                  var s = A.slaState(r);
                  return s.level === "ok" ? s.age + "d"
                    : '<span class="badge warn">' + s.age + "d</span>"; } },
              { key: "act", label: "", sortable: false, render: function (r) {
                  return '<a class="btn btn-primary btn-sm no-print" href="audit-case.html?line=' +
                    encodeURIComponent(r.lineId) + '">Review</a>'; } }
            ]
          });

          d.getElementById("cycleSub").textContent = cycles.length + " cycle" + (cycles.length === 1 ? "" : "s");
          var byCycle = {};
          lines.forEach(function (l) {
            var c = byCycle[l.cycleId] || (byCycle[l.cycleId] = { total: 0, done: 0, disc: 0 });
            c.total++;
            if (A.isTerminal(l.status)) c.done++;
            if (l.qtyDifference != null && l.qtyDifference !== 0) c.disc++;
          });
          UI.grid(d.getElementById("cycleGrid"), {
            rows: cycles.sort(function (a, b) { return String(b.openedAt).localeCompare(String(a.openedAt)); }),
            searchPlaceholder: "Search branch or period\u2026", pageSize: 10,
            emptyTitle: "No cycles yet",
            emptyText: "Open one to start counting a branch.",
            columns: [
              { key: "branch", label: "Branch", render: function (r) { return "<b>" + UI.esc(r.branch) + "</b>"; } },
              { key: "periodLabel", label: "Period", render: function (r) { return UI.esc(r.periodLabel); } },
              { key: "scopeType", label: "Scope", render: function (r) {
                  return '<span class="badge neutral">' + UI.esc(r.scopeType === "CATEGORY" ? r.scopeValue : r.scopeType) + "</span>"; } },
              { key: "progress", label: "Progress", sortable: false, render: function (r) {
                  var c = byCycle[r.cycleId] || { total: 0, done: 0 };
                  var pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
                  return '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
                    '<span class="muted small">' + c.done + " of " + c.total + " \u00b7 " + pct + "%</span>"; } },
              { key: "disc", label: "Discrepancies", type: "num",
                raw: function (r) { return (byCycle[r.cycleId] || {}).disc || 0; },
                render: function (r) {
                  var n = (byCycle[r.cycleId] || {}).disc || 0;
                  return n ? '<span class="badge warn">' + n + "</span>" : "0"; } },
              { key: "status", label: "Status", render: function (r) {
                  return '<span class="badge ' + (r.status === "OPEN" ? "info" : "neutral") + '">' + UI.esc(r.status) + "</span>"; } },
              { key: "openedByName", label: "Opened by", render: function (r) { return UI.esc(r.openedByName); } },
              { key: "act", label: "", sortable: false, render: function (r) {
                  return '<a class="btn btn-ghost btn-sm no-print" href="audit-cycle.html?cycle=' +
                    encodeURIComponent(r.cycleId) + '">' + (r.status === "OPEN" ? "Continue" : "View") + "</a>"; } }
            ]
          });
        });
      }

      function kpi(l, v, foot, kind) {
        return '<div class="kpi ' + (kind || "") + '"><div class="lbl">' + UI.esc(l) + '</div><div class="val">' +
          UI.num(v) + '</div><div class="foot">' + UI.esc(foot) + "</div></div>";
      }

      /* Bulk verification — FRD §10.9. Only lines with no physical
         quantity entered. Each is still snapshotted, movement-checked
         and trailed individually; a bulk action must never collapse
         into one audit row. */
      function wireBulk(rows) {
        var picks = function () {
          return Array.prototype.slice.call(d.querySelectorAll(".line-row .pick:checked"))
            .map(function (c) { return c.closest(".line-row").id.replace("row-", ""); });
        };
        function sync() {
          var n = picks().length;
          var bar = d.getElementById("bulkBar"); if (bar) bar.classList.toggle("hidden", n === 0);
          var bc = d.getElementById("bulkCount"); if (bc) bc.innerHTML = "<b>" + n + "</b> line" + (n === 1 ? "" : "s") + " selected";
        }
        d.querySelectorAll(".line-row .pick").forEach(function (c) { c.onchange = sync; });
        var all = d.getElementById("pickAll");
        if (all) all.onchange = function () {
          d.querySelectorAll(".line-row .pick").forEach(function (c) { c.checked = all.checked; });
          sync();
        };
        var clear = d.getElementById("bulkClear");
        if (clear) clear.onclick = function () {
          d.querySelectorAll(".line-row .pick").forEach(function (c) { c.checked = false; });
          if (all) all.checked = false;
          sync();
        };
        var go = d.getElementById("bulkVerify");
        if (go) go.onclick = function () {
          var ids = picks();
          if (!ids.length) return;
          UI.modal({
            title: "Verify " + ids.length + " line" + (ids.length === 1 ? "" : "s") + "?",
            okText: "Verify " + ids.length,
            body:
              "<p>Marks each selected line as physically matching the system figure. " +
              "Each line is checked for stock movement separately and gets its own audit entry.</p>" +
              (ids.length > 50
                ? '<div class="field"><label>Type <b>VERIFY</b> to confirm a bulk action this large</label>' +
                  '<input class="input" id="bulkConfirm"></div>'
                : "") +
              '<div class="alert warn"><div><b>Only use this for lines you have actually counted</b>' +
              "Bulk verifying an uncounted line puts a false clean record on the audit trail in your name.</div></div>",
            onOk: function (root) {
              if (ids.length > 50) {
                var t = root.querySelector("#bulkConfirm");
                if (!t || t.value.trim().toUpperCase() !== "VERIFY") {
                  UI.toast("Not confirmed", "Type VERIFY to run a bulk action this large.", "warn");
                  return false;
                }
              }
              UI.loader(true);
              var done = 0, moved = 0, failed = [];
              ids.reduce(function (chain, id) {
                return chain.then(function () {
                  return A.verify(id, { confirmedMovement: true }, user)
                    .then(function (line) { done++; if (line.stockMovedDuringAudit) moved++; })
                    .catch(function (e) { failed.push(e.message); });
                });
              }, Promise.resolve()).then(function () {
                UI.toast(done + " line" + (done === 1 ? "" : "s") + " verified",
                  (moved ? moved + " had stock movement during the audit and are flagged. " : "") +
                  (failed.length ? failed.length + " could not be verified." : ""),
                  failed.length ? "warn" : "ok");
                UI.loader(false);
                return load();
              });
            }
          });
        };
        sync();
      }

      d.getElementById("newCycle").onclick = function () {
        var opts = state.scope.map(function (b) { return '<option value="' + UI.esc(b) + '">' + UI.esc(b) + "</option>"; }).join("");
        if (!opts) { UI.toast("No branches in scope", "Ask HO Admin to set your audit scope.", "warn"); return; }
        UI.modal({
          title: "Open an audit cycle", okText: "Open cycle",
          body:
            '<div class="field"><label>Branch <span class="req">*</span></label>' +
              '<select class="input" id="cBranch">' + opts + "</select></div>" +
            '<div class="field"><label>Period label</label>' +
              '<input class="input" id="cPeriod" value="' + new Date().toISOString().slice(0, 7) + '" maxlength="30"></div>' +
            '<div class="field"><label>Scope</label><select class="input" id="cScope">' +
              '<option value="IN_STOCK_ONLY">Products with stock on hand</option>' +
              '<option value="ALL">Every product in the master</option>' +
              '<option value="CATEGORY">One master category</option></select></div>' +
            '<div class="field hidden" id="catWrap"><label>Category</label>' +
              '<select class="input" id="cCat">' +
              w.Master.keys().map(function (k) {
                return '<option value="' + k + '">' + UI.esc(w.Master.label(k)) + "</option>";
              }).join("") + "</select></div>" +
            '<div class="hint">The cycle snapshots the system quantity for every product in scope. ' +
            "Products added later join the next cycle, not this one.</div>",
          onOk: function (root) {
            var scopeType = root.querySelector("#cScope").value;
            var branch = root.querySelector("#cBranch").value;
            var bRow = state.branches.find(function (b) { return b.branchCode === branch; });
            UI.loader(true);
            A.openCycle({
              branch: branch, zone: bRow ? bRow.zone : "",
              periodLabel: root.querySelector("#cPeriod").value,
              scopeType: scopeType,
              scopeValue: scopeType === "CATEGORY" ? root.querySelector("#cCat").value : ""
            }, user).then(function (c) {
              UI.toast("Cycle opened", c.branch + " \u00b7 " + c.lineCount + " lines to count.", "ok");
              location.href = "audit-cycle.html?cycle=" + encodeURIComponent(c.cycleId);
            }).catch(function (e) {
              UI.toast("Not opened", e.message, "bad");
            }).then(function () { UI.loader(false); });
          }
        });
        d.getElementById("cScope").onchange = function () {
          d.getElementById("catWrap").classList.toggle("hidden", this.value !== "CATEGORY");
        };
      };

      load();
      w.API.onChange(UI.debounce(load, 300));
    }
  };

  /* ============================================================
     AUDIT CYCLE — line verification
     ============================================================ */
  w.AuditCycle = {
    mount: function () {
      var user = w.Auth.require("audit-cycle");
      if (!user) return;
      var UI = w.UI, A = w.Audit;
      var cycleId = new URLSearchParams(location.search).get("cycle");
      var content = UI.shell(user, "audit-cycle", "Audit cycle");
      var state = { lines: [], cycle: null, mode: {} };

      if (!cycleId) {
        if (content) content.innerHTML = '<div class="alert bad"><div><b>No cycle selected</b>' +
          'Open one from the <a href="audit-workspace.html">audit workspace</a>.</div></div>';
        return;
      }

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1 id="cycTitle">Audit cycle</h1>' +
        '<p id="cycSub"></p></div>' +
        '<div class="btn-row no-print">' +
          '<a class="btn btn-ghost btn-sm" href="audit-workspace.html">Back to workspace</a>' +
          '<button class="btn btn-ghost btn-sm" id="xlBtn">Excel</button>' +
          '<button class="btn btn-primary btn-sm" id="closeCycle">Close cycle</button>' +
        "</div></div>" +
        '<div id="cycNotice"></div>' +
        '<div class="grid g-5" id="cycKpis"></div>' +
        '<div class="card mt no-print"><div class="card-body"><div class="grid g-4" style="gap:0 14px">' +
          '<div class="field"><label for="fCat">Category</label><select class="input" id="fCat">' +
            w.Master.optionsHtml("All categories") + "</select></div>" +
          '<div class="field"><label for="fStatus">Status</label><select class="input" id="fStatus">' +
            '<option value="open">Outstanding only</option><option value="">All lines</option>' +
            '<option value="PENDING_VERIFICATION">Pending verification</option>' +
            '<option value="VERIFIED">Verified</option>' +
            '<option value="JUSTIFICATION_REQUESTED">Justification requested</option>' +
            '<option value="CLOSED">Closed</option></select></div>' +
          '<div class="field"><label for="fSearch">Product</label><input class="input" id="fSearch" type="search" placeholder="Search\u2026"></div>' +
          '<div class="field"><label>&nbsp;</label><button class="btn btn-ghost btn-block" id="applyBtn">Apply</button></div>' +
        "</div></div></div>" +
        '<div class="card mt"><div class="card-head"><h3>Lines</h3>' +
          '<span class="sub" id="lineSub"></span></div>' +
          '<div class="card-body"><div id="lineList"></div></div></div>';

      function load() {
        return Promise.all([A.cycles(), A.linesFor(cycleId), w.API.getBranches()]).then(function (r) {
          state.cycle = r[0].find(function (c) { return c.cycleId === cycleId; });
          state.lines = r[1];
          if (!state.cycle) {
            if (content) content.innerHTML = '<div class="alert bad"><div><b>Cycle not found</b></div></div>';
            return;
          }
          var scope = A.scopeFor(user, r[2]);
          if (scope.indexOf(state.cycle.branch) < 0) {
            if (content) content.innerHTML = '<div class="alert bad"><div><b>Outside your audit scope</b>' +
              "This cycle is for " + UI.esc(state.cycle.branch) + ".</div></div>";
            return;
          }
          paint();
        });
      }

      function paint() {
        var cycTitle = d.getElementById("cycTitle");
        if (!cycTitle) return;
        var c = state.cycle, lines = state.lines;
        var done = lines.filter(function (l) { return A.isTerminal(l.status); }).length;
        var pending = lines.filter(function (l) { return l.status === A.STATUS.PENDING; }).length;
        var openCases = lines.filter(function (l) {
          return !A.isTerminal(l.status) && l.status !== A.STATUS.PENDING;
        }).length;
        var disc = lines.filter(function (l) { return l.qtyDifference != null && l.qtyDifference !== 0; }).length;
        var netVar = lines.reduce(function (a, l) { return a + (Number(l.qtyDifference) || 0); }, 0);

        d.getElementById("cycTitle").textContent = c.branch + " \u2014 " + c.periodLabel;
        d.getElementById("cycSub").textContent =
          "Opened " + UI.fmtDate(c.openedAt) + " by " + c.openedByName + " \u00b7 scope " +
          (c.scopeType === "CATEGORY" ? c.scopeValue : c.scopeType) + " \u00b7 cycle " + c.status;

        var cycKpis = d.getElementById("cycKpis"); if (cycKpis) cycKpis.innerHTML =
          kpi("Lines", lines.length, "in this cycle") +
          kpi("Counted", done, Math.round((done / lines.length) * 100) + "% complete", done === lines.length ? "ok" : "") +
          kpi("Pending", pending, "still to count", pending ? "warn" : "ok") +
          kpi("Open cases", openCases, "with the branch", openCases ? "warn" : "") +
          kpi("Net variance", netVar, disc + " line" + (disc === 1 ? "" : "s") + " differ", netVar ? "bad" : "ok");

        var moved = lines.filter(function (l) { return l.stockMovedDuringAudit; });
        var cycNotice = d.getElementById("cycNotice"); if (cycNotice) cycNotice.innerHTML = moved.length
          ? '<div class="alert warn no-print"><div><b>' + moved.length + " line" +
            (moved.length === 1 ? " had" : "s had") + " stock movement during the audit</b>" +
            "The balance changed between opening the line and submitting it. The figure used is the one at " +
            "submission. Worth asking the branch why stock moved mid-count.</div></div>"
          : "";

        renderLines();
      }

      function visible() {
        var fCat = d.getElementById("fCat");
        if (!fCat) return [];
        var cat = fCat.value;
        var st = d.getElementById("fStatus").value;
        var q = d.getElementById("fSearch").value.trim().toLowerCase();
        return state.lines.filter(function (l) {
          if (cat && l.masterKey !== cat) return false;
          if (st === "open" && A.isTerminal(l.status)) return false;
          if (st && st !== "open" && l.status !== st) return false;
          if (q && l.productName.toLowerCase().indexOf(q) < 0 && l.productId.toLowerCase().indexOf(q) < 0) return false;
          return true;
        });
      }

      function renderLines() {
        var rows = visible();
        var lineSub = d.getElementById("lineSub");
        if (lineSub) lineSub.textContent = rows.length + " line" + (rows.length === 1 ? "" : "s") + " shown";
        var host = d.getElementById("lineList");
        if (!host) return;
        if (!rows.length) {
          if (host) host.innerHTML = '<div class="empty"><b>Nothing matches</b>Widen the filters above.</div>';
          return;
        }
        if (host) host.innerHTML =
          '<div class="line-head no-print" style="grid-template-columns:28px minmax(190px,1fr) 90px 110px 120px minmax(140px,.8fr) 180px">' +
          '<div><input type="checkbox" id="pickAll" title="Select all shown pending lines" aria-label="Select all"></div>' +
          "<div>Product</div><div>System</div><div>Counted</div><div>Difference</div><div>Remarks</div><div>Action</div></div>" +
          '<div class="lines">' + rows.map(rowHtml).join("") + "</div>" +
          '<div class="bulk-bar no-print hidden" id="bulkBar">' +
            '<span id="bulkCount"></span>' +
            '<button class="btn btn-primary btn-sm" id="bulkVerify">Verify selected</button>' +
            '<button class="btn btn-ghost btn-sm" id="bulkClear">Clear selection</button></div>';

        rows.forEach(function (l) { wire(l); });
        wireBulk(rows);
      }

      function rowHtml(l) {
        var UI = w.UI;
        var terminal = A.isTerminal(l.status);
        var open = !terminal && l.status !== A.STATUS.PENDING;
        var disc = state.mode[l.lineId] === "disc";

        return '<div class="line-row" id="row-' + l.lineId + '" ' +
          'style="grid-template-columns:28px minmax(190px,1fr) 90px 110px 120px minmax(140px,.8fr) 180px">' +
          '<div class="line-cell line-pick">' +
            (terminal || open ? "" :
              '<input type="checkbox" class="pick" aria-label="Select ' + UI.esc(l.productName) + '">') +
          "</div>" +
          '<div class="line-cell" data-label="Product"><b>' + UI.esc(l.productName) + "</b>" +
            '<div class="muted small mono">' + UI.esc(l.productId) + " \u00b7 " + UI.esc(l.subCategory) + "</div>" +
            (l.stockMovedDuringAudit ? '<div class="hint error">Stock moved during the audit</div>' : "") +
          "</div>" +
          '<div class="line-cell" data-label="System"><div class="line-bal"><b>' +
            UI.num(l.systemQtyAtSubmit != null ? l.systemQtyAtSubmit : l.systemQtyAtOpen) + "</b></div></div>" +
          '<div class="line-cell" data-label="Counted">' +
            (terminal || open
              ? '<div class="line-bal">' + (l.physicalQty == null ? "\u2014" : UI.num(l.physicalQty)) +
                (l.physicalQtyFaulty ? '<div class="muted small">' + UI.num(l.physicalQtyFaulty) + " faulty</div>" : "") + "</div>"
              : (disc
                  ? '<input class="input phys" type="number" min="0" step="1" placeholder="0">' +
                    '<input class="input faulty" type="number" min="0" step="1" placeholder="of which faulty" ' +
                    'style="margin-top:6px;font-size:12px" title="How many of the counted units are faulty">'
                  : '<div class="line-bal muted">\u2014</div>')) +
          "</div>" +
          '<div class="line-cell" data-label="Difference"><div class="line-bal" id="diff-' + l.lineId + '">' +
            varianceCell(l) + "</div></div>" +
          '<div class="line-cell" data-label="Remarks">' +
            (terminal || open
              ? '<div class="muted small">' + (UI.esc(l.auditorRemarks) || "\u2014") + "</div>"
              : '<input class="input rem" maxlength="500" placeholder="' +
                (disc ? "Why it differs (required)" : "Optional") + '" value="' + UI.esc(l.auditorRemarks) + '">') +
          "</div>" +
          '<div class="line-cell" data-label="Action">' + actionHtml(l, disc, terminal, open) + "</div>" +
        "</div>";
      }

      function actionHtml(l, disc, terminal, open) {
        if (terminal) {
          return statusBadge(l.status) +
            (l.status === A.STATUS.CLOSED ? '<br><a class="small" href="audit-case.html?line=' +
              encodeURIComponent(l.lineId) + '">View case</a>' : "");
        }
        if (open) {
          return statusBadge(l.status) +
            '<br><a class="btn btn-ghost btn-sm no-print" style="margin-top:5px" href="audit-case.html?line=' +
            encodeURIComponent(l.lineId) + '">Open case</a>';
        }
        if (disc) {
          return '<div class="btn-row no-print">' +
            '<button class="btn btn-primary btn-sm" data-act="submit" data-id="' + l.lineId + '">Submit</button>' +
            '<button class="btn btn-ghost btn-sm" data-act="cancelmode" data-id="' + l.lineId + '">Cancel</button></div>';
        }
        return '<div class="btn-row no-print">' +
          '<button class="btn btn-primary btn-sm" data-act="verify" data-id="' + l.lineId + '">Verified OK</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="discmode" data-id="' + l.lineId + '">Discrepancy</button></div>';
      }

      function wire(l) {
        var row = d.getElementById("row-" + l.lineId);
        if (!row) return;
        var phys = row.querySelector(".phys");
        if (phys) {
          phys.addEventListener("input", function () {
            var sys = l.systemQtyAtSubmit != null ? l.systemQtyAtSubmit : l.systemQtyAtOpen;
            var q = phys.value === "" ? null : Number(phys.value);
            var cell = d.getElementById("diff-" + l.lineId);
            if (!cell) return;
            if (q == null || !isFinite(q)) { if (cell) cell.innerHTML = "\u2014"; return; }
            var v = A.variance(sys, q);
            if (cell) cell.innerHTML = varianceCell({
              qtyDifference: v.difference, variancePercent: v.variancePercent
            });
          });
        }
        row.querySelectorAll("[data-act]").forEach(function (b) {
          b.onclick = function () { act(b.getAttribute("data-act"), l, row); };
        });
      }

      /* Every commit re-reads the balance. If it moved, the auditor is
         shown what changed and must confirm — FRD §10.1. */
      function withMovementCheck(runner) {
        return runner(false).catch(function (err) {
          if (err.code !== "STOCK_MOVED") throw err;
          return new Promise(function (resolve, reject) {
            UI.modal({
              title: "Stock moved during the audit",
              okText: "Use the current figure",
              body:
                '<div class="alert warn"><div><b>The balance changed while you were counting</b>' +
                "When you opened this line the system said <b>" + UI.num(err.openQty) +
                "</b>. It now says <b>" + UI.num(err.liveQty) + "</b>.</div></div>" +
                "<p>Continuing records the current figure of <b>" + UI.num(err.liveQty) +
                "</b> as the system quantity. The line is flagged so the movement shows on the cycle report.</p>" +
                '<p class="muted small">If you did not expect a movement mid-count, check with the branch before continuing.</p>',
              onOk: function () { runner(true).then(resolve).catch(reject); }
            });
          });
        });
      }

      function act(kind, l, row) {
        if (kind === "discmode") { state.mode[l.lineId] = "disc"; renderLines(); return; }
        if (kind === "cancelmode") { delete state.mode[l.lineId]; renderLines(); return; }

        if (kind === "verify") {
          var remarks = row.querySelector(".rem") ? row.querySelector(".rem").value : "";
          UI.loader(true);
          withMovementCheck(function (confirmed) {
            return A.verify(l.lineId, { remarks: remarks, confirmedMovement: confirmed }, user);
          }).then(function () {
            UI.toast("Verified", l.productName + " marked verified.", "ok");
            return load();
          }).catch(function (e) {
            UI.toast("Not verified", e.message, "bad");
          }).then(function () { UI.loader(false); });
          return;
        }

        if (kind === "submit") {
          var physEl = row.querySelector(".phys");
          var remEl = row.querySelector(".rem");
          var q = physEl.value === "" ? null : Number(physEl.value);
          if (q == null) { UI.toast("Counted quantity needed", "Enter what you physically counted.", "warn"); physEl.focus(); return; }
          var fEl0 = row.querySelector(".faulty");
          if (fEl0 && fEl0.value !== "" && Number(fEl0.value) > q) {
            UI.toast("Faulty count too high", "Faulty units cannot exceed the " + q + " counted.", "warn");
            fEl0.focus(); return;
          }
          if ((remEl.value || "").trim().length < 10) {
            UI.toast("Remarks needed", "Explain the difference in at least 10 characters.", "warn");
            remEl.focus(); return;
          }
          UI.loader(true);
          withMovementCheck(function (confirmed) {
            var fEl = row.querySelector(".faulty");
            var faulty = fEl && fEl.value !== "" ? Number(fEl.value) : null;
            return A.raiseDiscrepancy(l.lineId, {
              physicalQty: q, physicalQtyFaulty: faulty,
              remarks: remEl.value, confirmedMovement: confirmed
            }, user);
          }).then(function (line) {
            delete state.mode[l.lineId];
            UI.toast("Discrepancy raised",
              l.productName + " \u00b7 difference " + (line.qtyDifference > 0 ? "+" : "") +
              line.qtyDifference + ". Sent to " + line.branch + " for justification.", "ok");
            return load();
          }).catch(function (e) {
            UI.toast("Not submitted", e.message, "bad");
          }).then(function () { UI.loader(false); });
        }
      }

      function kpi(l, v, foot, kind) {
        return '<div class="kpi ' + (kind || "") + '"><div class="lbl">' + UI.esc(l) + '</div><div class="val">' +
          UI.num(v) + '</div><div class="foot">' + UI.esc(foot) + "</div></div>";
      }

      /* Bulk verification — FRD §10.9. Only lines with no physical
         quantity entered. Each is still snapshotted, movement-checked
         and trailed individually; a bulk action must never collapse
         into one audit row. */
      function wireBulk(rows) {
        var picks = function () {
          return Array.prototype.slice.call(d.querySelectorAll(".line-row .pick:checked"))
            .map(function (c) { return c.closest(".line-row").id.replace("row-", ""); });
        };
        function sync() {
          var n = picks().length;
          var bar = d.getElementById("bulkBar"); if (bar) bar.classList.toggle("hidden", n === 0);
          var bc = d.getElementById("bulkCount"); if (bc) bc.innerHTML = "<b>" + n + "</b> line" + (n === 1 ? "" : "s") + " selected";
        }
        d.querySelectorAll(".line-row .pick").forEach(function (c) { c.onchange = sync; });
        var all = d.getElementById("pickAll");
        if (all) all.onchange = function () {
          d.querySelectorAll(".line-row .pick").forEach(function (c) { c.checked = all.checked; });
          sync();
        };
        var clear = d.getElementById("bulkClear");
        if (clear) clear.onclick = function () {
          d.querySelectorAll(".line-row .pick").forEach(function (c) { c.checked = false; });
          if (all) all.checked = false;
          sync();
        };
        var go = d.getElementById("bulkVerify");
        if (go) go.onclick = function () {
          var ids = picks();
          if (!ids.length) return;
          UI.modal({
            title: "Verify " + ids.length + " line" + (ids.length === 1 ? "" : "s") + "?",
            okText: "Verify " + ids.length,
            body:
              "<p>Marks each selected line as physically matching the system figure. " +
              "Each line is checked for stock movement separately and gets its own audit entry.</p>" +
              (ids.length > 50
                ? '<div class="field"><label>Type <b>VERIFY</b> to confirm a bulk action this large</label>' +
                  '<input class="input" id="bulkConfirm"></div>'
                : "") +
              '<div class="alert warn"><div><b>Only use this for lines you have actually counted</b>' +
              "Bulk verifying an uncounted line puts a false clean record on the audit trail in your name.</div></div>",
            onOk: function (root) {
              if (ids.length > 50) {
                var t = root.querySelector("#bulkConfirm");
                if (!t || t.value.trim().toUpperCase() !== "VERIFY") {
                  UI.toast("Not confirmed", "Type VERIFY to run a bulk action this large.", "warn");
                  return false;
                }
              }
              UI.loader(true);
              var done = 0, moved = 0, failed = [];
              ids.reduce(function (chain, id) {
                return chain.then(function () {
                  return A.verify(id, { confirmedMovement: true }, user)
                    .then(function (line) { done++; if (line.stockMovedDuringAudit) moved++; })
                    .catch(function (e) { failed.push(e.message); });
                });
              }, Promise.resolve()).then(function () {
                UI.toast(done + " line" + (done === 1 ? "" : "s") + " verified",
                  (moved ? moved + " had stock movement during the audit and are flagged. " : "") +
                  (failed.length ? failed.length + " could not be verified." : ""),
                  failed.length ? "warn" : "ok");
                UI.loader(false);
                return load();
              });
            }
          });
        };
        sync();
      }

      d.getElementById("applyBtn").onclick = renderLines;
      d.getElementById("fSearch").addEventListener("input", UI.debounce(renderLines, 250));
      d.getElementById("fCat").onchange = renderLines;
      d.getElementById("fStatus").onchange = renderLines;

      d.getElementById("closeCycle").onclick = function () {
        var open = state.lines.filter(function (l) { return !A.isTerminal(l.status); });
        UI.modal({
          title: "Close this cycle?",
          okText: open.length ? "Cannot close" : "Close cycle",
          body: open.length
            ? '<div class="alert warn"><div><b>' + open.length + " line" + (open.length === 1 ? " is" : "s are") +
              " still open</b>Finish counting them, or ask HO Admin to force-close the cycle.</div></div>"
            : "<p>All " + state.lines.length + " lines are complete. Closing locks the cycle for reporting.</p>",
          onOk: function () {
            if (open.length) return false;
            A.closeCycle(cycleId, user).then(function () {
              UI.toast("Cycle closed", state.cycle.branch + " \u00b7 " + state.cycle.periodLabel, "ok");
              load();
            }).catch(function (e) { UI.toast("Not closed", e.message, "bad"); });
          }
        });
      };

      d.getElementById("xlBtn").onclick = function () {
        var rows = visible();
        UI.exportWorkbook("Audit-Cycle-" + state.cycle.branch + "-" + w.API.today(), [{
          name: "Audit Lines",
          columns: [
            { label: "Product Code", width: 14 }, { label: "Product Name", width: 44 },
            { label: "Category", width: 20 }, { label: "Subcategory", width: 22 },
            { label: "System Qty", width: 12 }, { label: "Physical Qty", width: 13 },
            { label: "Difference", width: 12 }, { label: "Variance %", width: 12 },
            { label: "Status", width: 24 }, { label: "Auditor Remarks", width: 40 },
            { label: "Verified By", width: 22 }, { label: "Verified At", width: 20 },
            { label: "Stock Moved", width: 13 }
          ],
          rows: rows.map(function (l) {
            return [l.productId, l.productName, l.masterCategory, l.subCategory,
              l.systemQtyAtSubmit != null ? l.systemQtyAtSubmit : l.systemQtyAtOpen,
              l.physicalQty == null ? "" : l.physicalQty,
              l.qtyDifference == null ? "" : l.qtyDifference,
              l.variancePercent == null ? "n/a" : l.variancePercent,
              A.LABEL[l.status], l.auditorRemarks || "", l.verifiedByName || "",
              l.verifiedAt ? UI.fmtDateTime(l.verifiedAt) : "",
              l.stockMovedDuringAudit ? "Yes" : ""];
          })
        }]);
      };

      load();
    }
  };
})(window, document);
