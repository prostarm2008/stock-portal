/* ============================================================
   audit-case.js — the discrepancy thread, and HO adjustments

   One page, three role views. The facts panel is identical for
   everyone and read-only for everyone; only the action panel
   differs. A branch user gets no input control anywhere near a
   quantity — and the server refuses one anyway.
   ============================================================ */
(function (w, d) {
  "use strict";

  function badge(status) {
    var A = w.Audit, cls = "neutral";
    if (status === A.STATUS.VERIFIED || status === A.STATUS.CLOSED) cls = "in";
    else if (status === A.STATUS.JUSTIFICATION || status === A.STATUS.CLARIFICATION) cls = "warn";
    else if (status === A.STATUS.RESPONDED) cls = "info";
    else if (status === A.STATUS.UNRESOLVED || status === A.STATUS.CANCELLED) cls = "out";
    return '<span class="badge ' + cls + '">' + w.UI.esc(A.LABEL[status] || status) + "</span>";
  }

  w.AuditCase = {
    mount: function () {
      var user = w.Auth.require("audit-case");
      if (!user) return;
      var UI = w.UI, A = w.Audit;
      var lineId = new URLSearchParams(location.search).get("line");
      var content = UI.shell(user, "audit-case", "Discrepancy case");
      var state = {};

      if (!lineId) {
        if (content) content.innerHTML = '<div class="alert bad"><div><b>No case selected</b></div></div>';
        return;
      }

      function load() {
        return Promise.all([A.lines(), A.thread(lineId), w.API.getBranches()]).then(function (r) {
          var line = r[0].find(function (l) { return l.lineId === lineId; });
          if (!line) {
            if (content) content.innerHTML = '<div class="alert bad"><div><b>Case not found</b></div></div>';
            return;
          }
          /* Scope check before anything renders. */
          var allowed = user.role === "HO_ADMIN" ||
            (user.role === "STOCK_AUDITOR" && A.scopeFor(user, r[2]).indexOf(line.branch) >= 0) ||
            (user.role === "BRANCH_USER" && user.branch === line.branch) ||
            (user.role === "REGIONAL_MANAGER" && w.RBAC.visibleBranches(user, r[2]).indexOf(line.branch) >= 0);
          if (!allowed) {
            if (content) content.innerHTML = '<div class="alert bad"><div><b>Not available</b>' +
              "This case is outside the branches you can see.</div></div>";
            return;
          }
          state.line = line;
          state.thread = r[1];
          paint();
        });
      }

      function paint() {
        var l = state.line;
        var isAuditor = user.role === "STOCK_AUDITOR" || user.role === "HO_ADMIN";
        var isBranch = user.role === "BRANCH_USER" && user.branch === l.branch;
        var sla = A.slaState(l);

        if (content) content.innerHTML =
          '<div class="page-head"><div class="grow">' +
            "<h1>" + UI.esc(l.productName) + "</h1>" +
            '<p><span class="mono">' + UI.esc(l.productId) + "</span> \u00b7 " + UI.esc(l.branch) +
            " \u00b7 " + UI.esc(l.subCategory) + " \u00b7 case <span class=\"mono\">" +
            UI.esc(l.lineId) + "</span></p></div>" +
            '<div class="btn-row no-print">' + badge(l.status) +
            (isAuditor ? '<a class="btn btn-ghost btn-sm" href="audit-cycle.html?cycle=' +
              encodeURIComponent(l.cycleId) + '">Back to cycle</a>' : "") + "</div></div>" +

          timeline(l.status) +

          (sla.level !== "ok"
            ? '<div class="alert ' + (sla.level === "final" ? "bad" : "warn") + ' no-print"><div><b>' +
              UI.esc(sla.label) + " \u2014 " + sla.age + " days</b>" +
              (sla.owner === "Branch"
                ? "The branch has not responded within the agreed time."
                : "This has been waiting on the auditor.") + "</div></div>"
            : "") +

          '<div class="grid g-2" style="align-items:start">' +
            '<div class="card"><div class="card-head"><h3>The finding</h3>' +
              '<span class="sub">read-only for everyone</span></div>' +
              '<div class="card-body">' + factsTable(l) + "</div></div>" +
            '<div class="card"><div class="card-head"><h3>Conversation</h3>' +
              '<span class="sub">' + state.thread.length + " entr" + (state.thread.length === 1 ? "y" : "ies") + "</span></div>" +
              '<div class="card-body scroll-y" id="thread">' + threadHtml() + "</div></div>" +
          "</div>" +

          '<div class="card mt no-print" id="actionCard"></div>';

        renderAction(isAuditor, isBranch);
      }

      function timeline(current) {
        var A2 = w.Audit;
        var steps = [A2.STATUS.PENDING, A2.STATUS.JUSTIFICATION, A2.STATUS.RESPONDED,
                     A2.STATUS.CLARIFICATION, A2.STATUS.CLOSED];
        var idx = steps.indexOf(current);
        return '<div class="timeline no-print">' + steps.map(function (s, i) {
          var cls = s === current ? "now" : (idx >= 0 && i < idx ? "done" : "");
          return '<div class="tl-step ' + cls + '"><span class="tl-dot"></span>' +
            '<span class="tl-label">' + UI.esc(A2.LABEL[s]) + "</span></div>";
        }).join("") + "</div>";
      }

      /* The fixed facts. No role gets an input control here. */
      function factsTable(l) {
        var rows = [
          ["System quantity", UI.num(l.systemQtyAtSubmit != null ? l.systemQtyAtSubmit : l.systemQtyAtOpen)],
          ["Physical quantity counted", l.physicalQty == null ? "\u2014" : "<b>" + UI.num(l.physicalQty) + "</b>"],
          ["Difference", l.qtyDifference == null ? "\u2014" :
            '<b style="color:' + (l.qtyDifference < 0 ? "var(--bad-600)" : "var(--warn-600)") + '">' +
            (l.qtyDifference > 0 ? "+" : "") + UI.num(l.qtyDifference) + "</b>"],
          ["Variance", l.variancePercent == null
            ? '<span class="muted">n/a \u2014 system quantity is zero</span>'
            : l.variancePercent.toFixed(1) + "%"],
          ["Counted by", UI.esc(l.verifiedByName || "\u2014")],
          ["Counted on", l.submittedAt ? UI.fmtDateTime(l.submittedAt) : "\u2014"],
          ["Auditor remarks", '<div style="white-space:pre-wrap">' + (UI.esc(l.auditorRemarks) || "\u2014") + "</div>"],
          ["Rounds", String(l.roundCount || 0)]
        ];
        if (l.stockMovedDuringAudit) {
          rows.push(["Note", '<span class="badge warn">Stock moved during the audit</span>' +
            '<div class="muted small">Balance was ' + UI.num(l.systemQtyAtOpen) +
            " when the line was opened.</div>"]);
        }
        if (l.adjustmentStatus && l.adjustmentStatus !== "NONE") {
          var cls = l.adjustmentStatus === "APPROVED" ? "in" : l.adjustmentStatus === "REJECTED" ? "out" : "warn";
          rows.push(["Stock correction", '<span class="badge ' + cls + '">' + l.adjustmentStatus + "</span>" +
            (l.adjustmentStatus === "PENDING"
              ? '<div class="small" style="margin-top:4px">Awaiting HO Admin. ' +
                (user.role === "HO_ADMIN"
                  ? '<a href="adjustments.html">Open Stock corrections</a>'
                  : "Approved under Stock corrections.") + "</div>"
              : "") +
            (l.adjustmentTxnId ? '<div class="muted small mono">' + UI.esc(l.adjustmentTxnId) + "</div>" : "") +
            (l.adjustmentRejectReason ? '<div class="muted small">' + UI.esc(l.adjustmentRejectReason) + "</div>" : "")]);
        }
        return '<table class="tbl"><tbody>' + rows.map(function (r) {
          return "<tr><td style=\"width:44%\">" + r[0] + "</td><td>" + r[1] + "</td></tr>";
        }).join("") + "</tbody></table>";
      }

      function threadHtml() {
        if (!state.thread.length) return '<div class="empty"><b>Nothing yet</b></div>';
        var TYPE = {
          DISCREPANCY_RAISED: ["Discrepancy raised", "warn"],
          JUSTIFICATION: ["Branch justification", "info"],
          CLARIFICATION_REQUEST: ["Clarification requested", "warn"],
          ACCEPTANCE: ["Accepted and closed", "in"],
          REJECTION: ["Rejected", "out"],
          CANCELLATION: ["Cancelled", "out"]
        };
        return state.thread.map(function (r) {
          var t = TYPE[r.responseType] || [r.responseType, "neutral"];
          return '<div class="msg ' + (r.authorRole === "BRANCH_USER" ? "branch" : "auditor") + '">' +
            '<div class="msg-head"><span class="badge ' + t[1] + '">' + UI.esc(t[0]) + "</span>" +
            '<span class="muted small">' + UI.esc(r.authorName) + " \u00b7 " +
            UI.esc(w.RBAC.roles[r.authorRole] ? w.RBAC.roles[r.authorRole].label : r.authorRole) +
            " \u00b7 " + UI.fmtDateTime(r.createdAt) + " \u00b7 round " + r.roundNo + "</span></div>" +
            '<div class="msg-body">' + UI.esc(r.text) + "</div>" +
            (r.attachments && r.attachments.length
              ? '<div class="muted small">' + r.attachments.length + " attachment(s)</div>" : "") +
          "</div>";
        }).join("");
      }

      function renderAction(isAuditor, isBranch) {
        var l = state.line, host = d.getElementById("actionCard");
        if (!host) return;
        var S = A.STATUS;

        /* Branch: respond only. No quantity control exists on this page
           for a branch user, and the server refuses one regardless. */
        if (isBranch && (l.status === S.JUSTIFICATION || l.status === S.CLARIFICATION)) {
          if (host) host.innerHTML =
            '<div class="card-head"><h3>' +
            (l.status === S.CLARIFICATION ? "The auditor has asked for more detail" : "Your justification is required") +
            "</h3></div><div class=\"card-body\">" +
            '<div class="alert info"><div><b>What you can and cannot change</b>' +
            "You can explain the difference. You cannot change the system quantity, the counted quantity or the " +
            "auditor's remarks \u2014 those belong to the audit.</div></div>" +
            '<div class="field"><label for="jText">Justification <span class="req">*</span></label>' +
            '<textarea class="input" id="jText" style="min-height:110px" maxlength="2000" ' +
            'placeholder="Explain the difference \u2014 what happened, when, and what document supports it."></textarea>' +
            '<div class="hint" id="jCount">At least 20 characters.</div></div>' +
            (A.config.allowAttachments
              ? '<div class="field"><label>Supporting documents</label><input class="input" type="file" id="jFiles" multiple accept=".pdf,.jpg,.jpeg,.png"><div class="hint">Up to 3 files, 2 MB each.</div></div>'
              : '<div class="alert warn"><div><b>Attachments are not available on this backend</b>' +
                "Browser storage cannot hold files. Describe the document and its number in your response; " +
                "attachments become available on the shared Power Automate backend.</div></div>") +
            '<div class="btn-row"><button class="btn btn-primary" id="jSubmit">Submit justification</button></div></div>';

          var ta = d.getElementById("jText");
          ta.addEventListener("input", function () {
            var n = ta.value.trim().length;
            d.getElementById("jCount").textContent = n < 20
              ? (20 - n) + " more character" + (20 - n === 1 ? "" : "s") + " needed."
              : n + " characters.";
          });
          d.getElementById("jSubmit").onclick = function () {
            UI.loader(true);
            A.submitJustification(lineId, { text: ta.value }, user).then(function () {
              UI.toast("Justification submitted", "The auditor has been notified.", "ok");
              return load();
            }).catch(function (e) {
              UI.toast("Not submitted", e.message, "bad");
            }).then(function () { UI.loader(false); });
          };
          return;
        }

        /* Auditor: accept or send back. */
        if (isAuditor && l.status === S.RESPONDED) {
          if (host) host.innerHTML =
            '<div class="card-head"><h3>Your review</h3><span class="sub">' +
            UI.esc(l.branch) + " has responded</span></div><div class=\"card-body\">" +
            '<div class="field"><label for="rText">Remark <span class="req">*</span></label>' +
            '<textarea class="input" id="rText" style="min-height:90px" maxlength="500" ' +
            'placeholder="Why you are accepting, or what further detail you need."></textarea>' +
            '<div class="hint">At least 10 characters. Required either way.</div></div>' +
            (A.config.correctionModel === "adjust" && Number(l.qtyDifference) !== 0
              ? '<div class="alert info"><div><b>Accepting raises a stock correction</b>' +
                "The difference of " + (l.qtyDifference > 0 ? "+" : "") + UI.num(l.qtyDifference) +
                " goes to an HO Admin, who approves it under <b>Stock corrections</b> in their sidebar. " +
                "You are not moving stock yourself \u2014 their approval posts the transaction." +
                (w.API.mode === "local"
                  ? "<br><br><b>On this backend the correction is only visible on this computer.</b> " +
                    "Browser storage does not travel between machines, so an HO Admin signing in " +
                    "elsewhere will not see it. Switch to the Power Automate backend before the two " +
                    "roles work on different PCs."
                  : "") +
                "</div></div>"
              : "") +
            '<div class="btn-row">' +
            '<button class="btn btn-primary" id="accept">Accept and close</button>' +
            '<button class="btn btn-ghost" id="reject">Reject and request clarification</button>' +
            "</div></div>";

          d.getElementById("accept").onclick = function () {
            UI.loader(true);
            A.acceptCase(lineId, d.getElementById("rText").value, user).then(function (res) {
              UI.toast("Case closed",
                res.adjustmentRaised
                  ? "A correction of " + (l.qtyDifference > 0 ? "+" : "") + l.qtyDifference +
                    " is waiting under Stock corrections for an HO Admin to approve."
                  : "No stock correction was needed.", "ok");
              return load();
            }).catch(function (e) { UI.toast("Not closed", e.message, "bad"); })
              .then(function () { UI.loader(false); });
          };
          d.getElementById("reject").onclick = function () {
            UI.loader(true);
            A.requestClarification(lineId, d.getElementById("rText").value, user).then(function () {
              UI.toast("Sent back", UI.esc(l.branch) + " has been asked for more detail.", "ok");
              return load();
            }).catch(function (e) { UI.toast("Not sent", e.message, "bad"); })
              .then(function () { UI.loader(false); });
          };
          return;
        }

        if (isAuditor && l.status === S.JUSTIFICATION) {
          if (host) host.innerHTML = '<div class="card-body"><div class="alert info"><div>' +
            "<b>Waiting on " + UI.esc(l.branch) + "</b>" +
            "Raised " + UI.fmtDateTime(l.submittedAt) + ". " + A.ageInDays(l) + " days ago. " +
            "You can cancel this case if it was raised in error.</div></div>" +
            '<div class="btn-row"><button class="btn btn-ghost btn-sm" id="cancelCase">Cancel this case</button></div></div>';
          d.getElementById("cancelCase").onclick = function () {
            UI.modal({
              title: "Cancel this case?", okText: "Cancel case", danger: true,
              body: '<div class="field"><label>Reason <span class="req">*</span></label>' +
                '<textarea class="input" id="cReason" maxlength="500" placeholder="Why this was raised in error"></textarea>' +
                '<div class="hint">At least 10 characters. Kept on the audit trail.</div></div>',
              onOk: function (root) {
                A.cancelLine(lineId, root.querySelector("#cReason").value, user).then(function () {
                  UI.toast("Case cancelled", "", "ok"); load();
                }).catch(function (e) { UI.toast("Not cancelled", e.message, "bad"); });
              }
            });
          };
          return;
        }

        if (l.status === S.CLOSED && user.role === "HO_ADMIN") {
          if (host) host.innerHTML = '<div class="card-body"><div class="alert info"><div><b>Case closed</b>' +
            UI.esc(l.closureRemark) + "</div></div>" +
            '<div class="btn-row"><button class="btn btn-ghost btn-sm" id="reopen">Reopen case</button></div></div>';
          d.getElementById("reopen").onclick = function () {
            UI.modal({
              title: "Reopen this case?", okText: "Reopen",
              body: "<p>The case returns to <b>Branch responded</b> for another review.</p>" +
                '<div class="field"><label>Reason <span class="req">*</span></label>' +
                '<textarea class="input" id="roReason" maxlength="500"></textarea></div>',
              onOk: function (root) {
                A.reopenCase(lineId, root.querySelector("#roReason").value, user).then(function () {
                  UI.toast("Case reopened", "", "ok"); load();
                }).catch(function (e) { UI.toast("Not reopened", e.message, "bad"); });
              }
            });
          };
          return;
        }

        if (host) host.innerHTML = '<div class="card-body"><p class="muted">' +
          (A.isTerminal(l.status)
            ? "This case is closed. " + UI.esc(l.closureRemark || l.cancelReason || "")
            : "Nothing is required from you at this stage.") + "</p></div>";
      }

      load();
      w.API.onChange(UI.debounce(load, 400));
    }
  };

  /* ============================================================
     ADJUSTMENTS — HO Admin
     ============================================================ */
  w.Adjustments = {
    mount: function () {
      var user = w.Auth.require("adjustments");
      if (!user) return;
      var UI = w.UI, A = w.Audit;
      var content = UI.shell(user, "adjustments", "Stock corrections");
      var state = {};

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1>Stock corrections</h1>' +
        "<p>Differences confirmed by a closed audit case. Approving posts a normal stock transaction; " +
        "the auditor never moves stock directly.</p></div>" +
        '<div class="btn-row no-print"><button class="btn btn-ghost btn-sm" id="xlBtn">Excel</button></div></div>' +
        '<div class="grid g-4" id="adjKpis"></div>' +
        '<div class="card mt"><div class="card-head"><h3>Pending approval</h3>' +
          '<span class="sub" id="pendSub"></span></div><div id="pendGrid"></div></div>' +
        '<div class="card mt"><div class="card-head"><h3>Decided</h3></div><div id="doneGrid"></div></div>';

      function load() {
        return Promise.all([A.lines(), w.API.getStocks()]).then(function (r) {
          var lines = r[0], stocks = r[1];
          state.stocks = stocks;
          state.pending = lines.filter(function (l) { return l.adjustmentStatus === "PENDING"; });
          state.done = lines.filter(function (l) {
            return l.adjustmentStatus === "APPROVED" || l.adjustmentStatus === "REJECTED";
          });
          paint();
        });
      }

      function liveOf(l) {
        var s = state.stocks.find(function (x) { return x.branch === l.branch && x.productId === l.productId; });
        return s ? Number(s.currentBalance) || 0 : 0;
      }

      function paint() {
        var adjKpis = d.getElementById("adjKpis");
        if (!adjKpis) return;
        var netUp = state.pending.filter(function (l) { return l.qtyDifference > 0; })
          .reduce(function (a, l) { return a + l.qtyDifference; }, 0);
        var netDown = state.pending.filter(function (l) { return l.qtyDifference < 0; })
          .reduce(function (a, l) { return a + Math.abs(l.qtyDifference); }, 0);

        var adjKpis = d.getElementById("adjKpis"); if(adjKpis) adjKpis.innerHTML =
          kpi("Pending", state.pending.length, "awaiting your decision", state.pending.length ? "warn" : "ok") +
          kpi("Units to add", netUp, "found beyond system") +
          kpi("Units to remove", netDown, "short against system", netDown ? "bad" : "") +
          kpi("Decided", state.done.length, "approved or rejected");

        d.getElementById("pendSub").textContent = state.pending.length + " case" + (state.pending.length === 1 ? "" : "s");

        UI.grid(d.getElementById("pendGrid"), {
          rows: state.pending, search: false, pageSize: 15,
          emptyTitle: "Nothing pending",
          emptyText: "Corrections appear here when an auditor closes a case with a difference.",
          columns: [
            { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
            { key: "productName", label: "Product", render: function (r) {
                return '<a href="audit-case.html?line=' + encodeURIComponent(r.lineId) + '">' +
                  UI.esc(r.productName) + "</a>"; } },
            { key: "systemQtyAtSubmit", label: "At count", type: "num", render: function (r) { return UI.num(r.systemQtyAtSubmit); } },
            { key: "physicalQty", label: "Counted", type: "num", render: function (r) { return UI.num(r.physicalQty); } },
            { key: "live", label: "Balance now", type: "num",
              raw: function (r) { return liveOf(r); },
              render: function (r) {
                var live = liveOf(r);
                var moved = live !== r.systemQtyAtSubmit;
                return UI.num(live) + (moved
                  ? '<br><span class="badge warn" title="The balance changed after the count. The correction applies to this figure.">moved</span>'
                  : ""); } },
            { key: "qtyDifference", label: "Correction", type: "num", render: function (r) {
                return '<b style="color:' + (r.qtyDifference < 0 ? "var(--bad-600)" : "var(--ok-600)") + '">' +
                  (r.qtyDifference > 0 ? "+" : "") + UI.num(r.qtyDifference) + "</b>"; } },
            { key: "closedByName", label: "Closed by", render: function (r) { return UI.esc(r.closedByName || ""); } },
            { key: "act", label: "", sortable: false, render: function (r) {
                return '<div class="btn-row no-print">' +
                  '<button class="btn btn-primary btn-sm" data-ok="' + UI.esc(r.lineId) + '">Approve</button>' +
                  '<button class="btn btn-ghost btn-sm" data-no="' + UI.esc(r.lineId) + '">Reject</button></div>'; } }
          ],
          afterRender: function (root) {
            root.querySelectorAll("[data-ok]").forEach(function (b) {
              b.onclick = function () { approve(b.getAttribute("data-ok")); };
            });
            root.querySelectorAll("[data-no]").forEach(function (b) {
              b.onclick = function () { rejectAdj(b.getAttribute("data-no")); };
            });
          }
        });

        UI.grid(d.getElementById("doneGrid"), {
          rows: state.done, search: false, pageSize: 10,
          emptyTitle: "Nothing decided yet", emptyText: "",
          columns: [
            { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
            { key: "productName", label: "Product", render: function (r) { return UI.esc(r.productName); } },
            { key: "qtyDifference", label: "Correction", type: "num", render: function (r) {
                return (r.qtyDifference > 0 ? "+" : "") + UI.num(r.qtyDifference); } },
            { key: "adjustmentStatus", label: "Outcome", render: function (r) {
                return '<span class="badge ' + (r.adjustmentStatus === "APPROVED" ? "in" : "out") + '">' +
                  r.adjustmentStatus + "</span>"; } },
            { key: "decidedBy", label: "Decided by",
              raw: function (r) { return r.adjustmentApprovedBy || r.adjustmentRejectedBy || ""; },
              render: function (r) {
                var who = r.adjustmentApprovedBy || r.adjustmentRejectedBy;
                var when = r.adjustmentApprovedAt || r.adjustmentRejectedAt;
                return who
                  ? UI.esc(who) + (when ? '<br><span class="muted small">' + UI.fmtDateTime(when) + "</span>" : "")
                  : "\u2014"; } },
            { key: "adjustmentTxnId", label: "Transaction", render: function (r) {
                return r.adjustmentTxnId ? '<span class="mono small">' + UI.esc(r.adjustmentTxnId) + "</span>"
                  : '<span class="muted small">' + UI.esc(r.adjustmentRejectReason || "") + "</span>"; } }
          ]
        });
      }

      function approve(id) {
        var l = state.pending.find(function (x) { return x.lineId === id; });
        var live = liveOf(l);
        UI.modal({
          title: "Approve this correction?", okText: "Approve and post",
          body:
            "<p>Posts a stock " + (l.qtyDifference > 0 ? "inward" : "outward") + " of <b>" +
            UI.num(Math.abs(l.qtyDifference)) + "</b> for <b>" + UI.esc(l.productName) +
            "</b> at <b>" + UI.esc(l.branch) + "</b>.</p>" +
            '<table class="tbl"><tbody>' +
            "<tr><td>System at count</td><td class=\"num\">" + UI.num(l.systemQtyAtSubmit) + "</td></tr>" +
            "<tr><td>Auditor counted</td><td class=\"num\">" + UI.num(l.physicalQty) + "</td></tr>" +
            "<tr><td>Balance now</td><td class=\"num\">" + UI.num(live) + "</td></tr>" +
            "<tr><td><b>Balance after posting</b></td><td class=\"num\"><b>" +
              UI.num(live + l.qtyDifference) + "</b></td></tr></tbody></table>" +
            (live !== l.systemQtyAtSubmit
              ? '<div class="alert warn" style="margin-top:12px"><div><b>The balance moved after the count</b>' +
                "It was " + UI.num(l.systemQtyAtSubmit) + " when counted and is " + UI.num(live) +
                " now. The correction applies to the current figure, so the result will not equal the counted " +
                "figure of " + UI.num(l.physicalQty) + ".</div></div>"
              : ""),
          onOk: function () {
            UI.loader(true);
            A.approveAdjustment(id, user).then(function (res) {
              UI.toast("Correction posted",
                l.productName + " at " + l.branch + " is now " + res.result.lines[0].newBalance + ".", "ok");
              return load();
            }).catch(function (e) {
              /* Another HO Admin got there first. Say who, and take the
                 row off this screen so it is not clicked again. */
              UI.toast(e.code === "ALREADY_DECIDED" ? "Handled by someone else" : "Not posted",
                e.message, e.code === "ALREADY_DECIDED" ? "warn" : "bad");
              return load();
            }).then(function () { UI.loader(false); });
          }
        });
      }

      function rejectAdj(id) {
        UI.modal({
          title: "Reject this correction?", okText: "Reject", danger: true,
          body: "<p>The balance stays as it is. The variance remains on record as accepted but uncorrected.</p>" +
            '<div class="field"><label>Reason <span class="req">*</span></label>' +
            '<textarea class="input" id="rr" maxlength="500"></textarea>' +
            '<div class="hint">At least 10 characters.</div></div>',
          onOk: function (root) {
            A.rejectAdjustment(id, root.querySelector("#rr").value, user).then(function () {
              UI.toast("Correction rejected", "The balance was left as it was.", "ok");
              load();
            }).catch(function (e) {
              UI.toast(e.code === "ALREADY_DECIDED" ? "Handled by someone else" : "Not rejected",
                e.message, e.code === "ALREADY_DECIDED" ? "warn" : "bad");
              load();
            });
          }
        });
      }

      function kpi(l, v, foot, kind) {
        return '<div class="kpi ' + (kind || "") + '"><div class="lbl">' + UI.esc(l) + '</div><div class="val">' +
          UI.num(v) + '</div><div class="foot">' + UI.esc(foot) + "</div></div>";
      }

      d.getElementById("xlBtn").onclick = function () {
        UI.exportWorkbook("Stock-Corrections-" + w.API.today(), [{
          name: "Adjustment Register",
          columns: [
            { label: "Branch", width: 18 }, { label: "Product Code", width: 14 },
            { label: "Product Name", width: 44 }, { label: "System at count", width: 16 },
            { label: "Physical counted", width: 16 }, { label: "Correction", width: 12 },
            { label: "Status", width: 14 }, { label: "Transaction ID", width: 26 },
            { label: "Closed by", width: 22 }, { label: "Reason if rejected", width: 40 }
          ],
          rows: state.pending.concat(state.done).map(function (l) {
            return [l.branch, l.productId, l.productName, l.systemQtyAtSubmit, l.physicalQty,
              l.qtyDifference, l.adjustmentStatus, l.adjustmentTxnId || "",
              l.closedByName || "", l.adjustmentRejectReason || ""];
          })
        }]);
      };

      /* Two HO Admins can be on this screen at once. The list refreshes
         on any data change and on a timer, so a correction decided by
         one disappears from the other's screen instead of sitting there
         waiting to be clicked. */
      var lastIds = null;
      function loadAndNotice() {
        return load().then(function () {
          var nowIds = state.pending.map(function (l) { return l.lineId; });
          if (lastIds) {
            /* Only report what someone else decided. Announcing this
               admin's own approval back to them reads like an error. */
            var goneToOthers = lastIds.filter(function (id) {
              if (nowIds.indexOf(id) >= 0) return false;
              var l = state.done.find(function (x) { return x.lineId === id; });
              if (!l) return false;
              var who = l.adjustmentApprovedBy || l.adjustmentRejectedBy || "";
              return who && who !== user.fullName;
            });
            if (goneToOthers.length) {
              var n = goneToOthers.length;
              var l0 = state.done.find(function (x) { return x.lineId === goneToOthers[0]; });
              var who = l0 ? (l0.adjustmentApprovedBy || l0.adjustmentRejectedBy) : "another HO Admin";
              UI.toast(n + " correction" + (n === 1 ? "" : "s") + " handled by " + who,
                "Removed from your list. Nothing further is needed on " +
                (n === 1 ? "it" : "them") + ".", "info");
            }
          }
          lastIds = nowIds;
        });
      }

      loadAndNotice();
      w.API.onChange(UI.debounce(loadAndNotice, 400));
      setInterval(loadAndNotice, Math.max(10, w.APP_CONFIG.refreshSeconds || 15) * 1000);
    }
  };
})(window, document);
