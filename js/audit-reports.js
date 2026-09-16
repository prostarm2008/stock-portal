/* ============================================================
   audit-reports.js — HO audit dashboard and the standard reports

   FRD §8. One screen: branch-wise audit status, category-wise
   variance, ageing of open cases, and five reports that export
   through the existing .xlsx writer.

   Read-only throughout. Nothing on this screen changes a case.
   ============================================================ */
(function (w, d) {
  "use strict";

  w.AuditDashboard = {
    mount: function () {
      var user = w.Auth.require("audit-dashboard");
      if (!user) return;

      var UI = w.UI, A = w.Audit, Master = w.Master;
      var content = UI.shell(user, "audit-dashboard", "Audit dashboard");
      var state = { lines: [], cycles: [], branches: [], report: "cycle" };

      var REPORTS = [
        { id: "cycle",     label: "Cycle summary" },
        { id: "register",  label: "Discrepancy register" },
        { id: "accuracy",  label: "Branch accuracy" },
        { id: "auditor",   label: "Auditor activity" },
        { id: "ageing",    label: "Ageing" },
        { id: "history",   label: "Case history" }
      ];

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1>Audit dashboard</h1>' +
        "<p>" + UI.esc(w.RBAC.scopeLabel(user)) + " \u00b7 counts only. " +
        "Open a case from the register to see its full thread.</p></div>" +
        '<div class="btn-row no-print">' +
          '<button class="btn btn-ghost btn-sm" id="xlBtn">Excel</button>' +
          '<button class="btn btn-ghost btn-sm" id="pdfBtn">PDF</button>' +
        "</div></div>" +
        '<div id="escNote"></div>' +
        '<div class="grid g-5" id="dKpis"></div>' +

        '<div class="grid g-2 mt">' +
          '<div class="card"><div class="card-head"><h3>Branch-wise audit status</h3>' +
            '<span class="sub" id="brSub"></span></div>' +
            '<div class="card-body" id="brChart"></div><div id="brGrid"></div></div>' +
          '<div class="stack">' +
            '<div class="card"><div class="card-head"><h3>Ageing of open cases</h3>' +
              '<span class="sub">working days with the branch</span></div>' +
              '<div class="card-body" id="ageChart"></div></div>' +
            '<div class="card"><div class="card-head"><h3>Category-wise variance</h3></div>' +
              '<div class="card-body" id="catChart"></div></div>' +
          "</div>" +
        "</div>" +

        '<div class="card mt"><div class="card-head"><h3>Reports</h3>' +
          '<div class="topbar-spacer"></div><span class="sub" id="repSub"></span></div>' +
          '<div class="card-body no-print"><div class="btn-row" id="repTabs"></div></div>' +
          '<div id="repGrid"></div></div>';

      var repTabs = d.getElementById("repTabs"); if(repTabs) repTabs.innerHTML = REPORTS.map(function (r, i) {
        return '<button class="btn ' + (i === 0 ? "btn-primary" : "btn-ghost") +
          ' btn-sm" data-rep="' + r.id + '">' + r.label + "</button>";
      }).join("");
      d.querySelectorAll("[data-rep]").forEach(function (b) {
        b.onclick = function () {
          state.report = b.getAttribute("data-rep");
          d.querySelectorAll("[data-rep]").forEach(function (x) {
            x.className = "btn btn-sm " + (x === b ? "btn-primary" : "btn-ghost");
          });
          renderReport();
        };
      });

      function load() {
        return Promise.all([A.lines(), A.cycles(), w.API.getBranches(), A.responses()])
          .then(function (r) {
            var scope = A.scopeFor(user, r[2]);
            var inScope = function (b) { return scope.indexOf(b) >= 0; };
            state.branches = r[2];
            state.scope = scope;
            state.lines = r[0].filter(function (l) { return inScope(l.branch); });
            state.cycles = r[1].filter(function (c) { return inScope(c.branch); });
            state.responses = r[3];
            paint();
          });
      }

      function paint() {
        var dKpis = d.getElementById("dKpis");
        if (!dKpis) return;
        var lines = state.lines;
        var acc = A.accuracyFor(lines);
        var open = lines.filter(function (l) {
          return !A.isTerminal(l.status) && l.status !== A.STATUS.PENDING;
        });
        var pendingAdj = lines.filter(function (l) { return l.adjustmentStatus === "PENDING"; });
        var escalations = open.filter(function (l) {
          var s = A.slaState(l);
          return s.level === "escalate" || s.level === "final";
        });

        var dKpis = d.getElementById("dKpis"); if(dKpis) dKpis.innerHTML =
          kpi("Cycles", state.cycles.length,
              state.cycles.filter(function (c) { return c.status === "OPEN"; }).length + " open") +
          kpi("Lines counted", acc.counted, lines.length + " generated") +
          kpi("Line accuracy", acc.lineAccuracy == null ? "\u2014" : acc.lineAccuracy + "%",
              acc.clean + " of " + acc.counted + " clean", acc.lineAccuracy >= 95 ? "ok" : "warn") +
          kpi("Unit accuracy", acc.unitAccuracy == null ? "\u2014" : acc.unitAccuracy + "%",
              UI.num(acc.varianceUnits) + " units in variance", acc.unitAccuracy >= 98 ? "ok" : "warn") +
          kpi("Open cases", open.length,
              escalations.length ? escalations.length + " past escalation" : "none escalated",
              escalations.length ? "bad" : "");

        var host = d.getElementById("escNote");
        if (!host) return;
        if (host) host.innerHTML = escalations.length
          ? '<div class="alert ' + (escalations.some(function (l) { return A.slaState(l).level === "final"; }) ? "bad" : "warn") +
            ' no-print"><div><b>' + escalations.length + " case" + (escalations.length === 1 ? "" : "s") +
            " past the escalation threshold</b>" +
            escalations.slice(0, 4).map(function (l) {
              var s = A.slaState(l);
              return UI.esc(l.branch) + " \u00b7 " + UI.esc(l.productName) + " \u00b7 " +
                s.age + "d \u2192 " + UI.esc(s.escalateTo);
            }).join("; ") +
            (escalations.length > 4 ? "; and " + (escalations.length - 4) + " more" : "") +
            ". Ageing is in working days, Sundays and configured holidays excluded.</div></div>"
          : "";

        /* ---- branch-wise ---- */
        var byBranch = {};
        state.scope.forEach(function (b) {
          var meta = state.branches.find(function (x) { return x.branchCode === b; });
          byBranch[b] = { branch: b, zone: meta ? meta.zone : "", lines: [], cycles: 0, open: 0, overdue: 0 };
        });
        lines.forEach(function (l) { if (byBranch[l.branch]) byBranch[l.branch].lines.push(l); });
        state.cycles.forEach(function (c) { if (byBranch[c.branch]) byBranch[c.branch].cycles++; });
        open.forEach(function (l) {
          if (!byBranch[l.branch]) return;
          byBranch[l.branch].open++;
          if (A.slaState(l).level !== "ok") byBranch[l.branch].overdue++;
        });
        var brRows = Object.keys(byBranch).map(function (k) {
          var b = byBranch[k];
          var a = A.accuracyFor(b.lines);
          return Object.assign(b, a);
        }).filter(function (b) { return b.lines.length; })
          .sort(function (a, b) { return (a.lineAccuracy || 0) - (b.lineAccuracy || 0); });
        state.brRows = brRows;

        var brSub = d.getElementById("brSub");
        if (brSub) brSub.textContent = brRows.length + " branch" + (brRows.length === 1 ? "" : "es") + " audited";
        var brChart = d.getElementById("brChart");
        if (brChart) UI.barChart(brChart,
          brRows.slice(0, 10).map(function (b) { return { label: b.branch, value: b.lineAccuracy || 0 }; }),
          { aria: "Line accuracy by branch", height: 220 });

        var brGrid = d.getElementById("brGrid");
        if (brGrid) UI.grid(brGrid, {
          rows: brRows, search: false, pageSize: 8,
          emptyTitle: "No branch has been audited yet",
          emptyText: "Figures appear once an auditor completes lines.",
          columns: [
            { key: "branch", label: "Branch", render: function (r) { return "<b>" + UI.esc(r.branch) + "</b>"; } },
            { key: "counted", label: "Counted", type: "num", render: function (r) { return UI.num(r.counted); } },
            { key: "lineAccuracy", label: "Line acc.", type: "num", render: function (r) {
                return r.lineAccuracy == null ? "\u2014"
                  : '<span class="badge ' + (r.lineAccuracy >= 95 ? "in" : "warn") + '">' + r.lineAccuracy + "%</span>"; } },
            { key: "unitAccuracy", label: "Unit acc.", type: "num", render: function (r) {
                return r.unitAccuracy == null ? "\u2014" : r.unitAccuracy + "%"; } },
            { key: "netVariance", label: "Net var.", type: "num", render: function (r) {
                return r.netVariance ? '<span style="color:' + (r.netVariance < 0 ? "var(--bad-600)" : "var(--warn-600)") +
                  '">' + (r.netVariance > 0 ? "+" : "") + UI.num(r.netVariance) + "</span>" : "0"; } },
            { key: "open", label: "Open", type: "num", render: function (r) {
                return r.open ? '<span class="badge warn">' + r.open + "</span>" : "0"; } },
            { key: "overdue", label: "Overdue", type: "num", render: function (r) {
                return r.overdue ? '<span class="badge out">' + r.overdue + "</span>" : "\u2014"; } }
          ]
        });

        /* ---- ageing ---- */
        var buckets = A.ageBuckets(lines);
        var ageChart = d.getElementById("ageChart");
        if (ageChart) UI.barChart(ageChart,
          Object.keys(buckets).map(function (k) { return { label: k + " days", value: buckets[k] }; }),
          { aria: "Open cases by age", height: 190, alt: true });

        /* ---- category variance ---- */
        var byCat = {};
        lines.forEach(function (l) {
          if (!l.qtyDifference) return;
          var k = l.subCategory || "\u2014";
          byCat[k] = (byCat[k] || 0) + Math.abs(l.qtyDifference);
        });
        var catRows = Object.keys(byCat).map(function (k) { return { label: k, value: byCat[k] }; })
          .sort(function (a, b) { return b.value - a.value; });
        var catChart = d.getElementById("catChart");
        if (catChart) {
          if (catRows.length) {
            UI.donutChart(catChart, catRows.slice(0, 6),
              { centerLabel: "units", aria: "Variance by category" });
          } else {
            if (catChart) catChart.innerHTML =
              '<div class="empty"><b>No variance recorded</b>Every counted line matched.</div>';
          }
        }

        renderReport();
      }

      /* ---------- reports ---------- */
      function buildReport() {
        var lines = state.lines;
        var byId = {};
        state.cycles.forEach(function (c) { byId[c.cycleId] = c; });

        if (state.report === "cycle") {
          var rows = state.cycles.map(function (c) {
            var cl = lines.filter(function (l) { return l.cycleId === c.cycleId; });
            var a = A.accuracyFor(cl);
            return {
              branch: c.branch, period: c.periodLabel, scope: c.scopeType === "CATEGORY" ? c.scopeValue : c.scopeType,
              status: c.status, opened: c.openedAt, by: c.openedByName,
              lines: cl.length, counted: a.counted, clean: a.clean,
              lineAccuracy: a.lineAccuracy, netVariance: a.netVariance,
              outstanding: cl.filter(function (l) { return !A.isTerminal(l.status); }).length
            };
          }).sort(function (a, b) { return String(b.opened).localeCompare(String(a.opened)); });
          return {
            title: "Audit cycle summary",
            head: ["Branch", "Period", "Scope", "Status", "Opened by", "Lines", "Counted", "Clean", "Line accuracy %", "Net variance", "Outstanding"],
            rows: rows,
            flat: function (r) { return [r.branch, r.period, r.scope, r.status, r.by, r.lines, r.counted, r.clean, r.lineAccuracy, r.netVariance, r.outstanding]; },
            cols: [
              { key: "branch", label: "Branch", render: function (r) { return "<b>" + UI.esc(r.branch) + "</b>"; } },
              { key: "period", label: "Period", render: function (r) { return UI.esc(r.period); } },
              { key: "scope", label: "Scope", render: function (r) { return '<span class="badge neutral">' + UI.esc(r.scope) + "</span>"; } },
              { key: "status", label: "Cycle", render: function (r) {
                  return '<span class="badge ' + (r.status === "OPEN" ? "info" : "neutral") + '">' + UI.esc(r.status) + "</span>"; } },
              { key: "counted", label: "Counted", type: "num", render: function (r) { return UI.num(r.counted) + " / " + UI.num(r.lines); } },
              { key: "lineAccuracy", label: "Line acc.", type: "num", render: function (r) {
                  return r.lineAccuracy == null ? "\u2014" : r.lineAccuracy + "%"; } },
              { key: "netVariance", label: "Net var.", type: "num", render: function (r) { return UI.num(r.netVariance); } },
              { key: "outstanding", label: "Open", type: "num", render: function (r) {
                  return r.outstanding ? '<span class="badge warn">' + r.outstanding + "</span>" : "0"; } },
              { key: "by", label: "Opened by", render: function (r) { return UI.esc(r.by); } }
            ]
          };
        }

        if (state.report === "register") {
          var reg = lines.filter(function (l) { return l.qtyDifference; })
            .sort(function (a, b) { return Math.abs(b.qtyDifference) - Math.abs(a.qtyDifference); });
          return {
            title: "Discrepancy register",
            head: ["Branch", "Product code", "Product", "Category", "Subcategory", "System qty", "Physical qty",
                   "Difference", "Variance %", "Status", "Age (working days)", "Auditor", "Auditor remarks"],
            rows: reg,
            flat: function (l) {
              return [l.branch, l.productId, l.productName, l.masterCategory, l.subCategory,
                l.systemQtyAtSubmit, l.physicalQty, l.qtyDifference,
                l.variancePercent == null ? "n/a" : l.variancePercent,
                A.LABEL[l.status], A.ageInDays(l), l.verifiedByName || "", l.auditorRemarks || ""];
            },
            cols: [
              { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
              { key: "productName", label: "Product", render: function (r) {
                  return '<a href="audit-case.html?line=' + encodeURIComponent(r.lineId) + '">' +
                    UI.esc(r.productName) + "</a>"; } },
              { key: "subCategory", label: "Subcategory", render: function (r) {
                  return '<span class="badge neutral">' + UI.esc(r.subCategory) + "</span>"; } },
              { key: "systemQtyAtSubmit", label: "System", type: "num", render: function (r) { return UI.num(r.systemQtyAtSubmit); } },
              { key: "physicalQty", label: "Counted", type: "num", render: function (r) { return UI.num(r.physicalQty); } },
              { key: "qtyDifference", label: "Diff", type: "num", render: function (r) {
                  return '<b style="color:' + (r.qtyDifference < 0 ? "var(--bad-600)" : "var(--warn-600)") + '">' +
                    (r.qtyDifference > 0 ? "+" : "") + UI.num(r.qtyDifference) + "</b>"; } },
              { key: "variancePercent", label: "Var %", type: "num", render: function (r) {
                  return r.variancePercent == null ? '<span class="muted">n/a</span>' : r.variancePercent.toFixed(1) + "%"; } },
              { key: "status", label: "Status", render: function (r) {
                  var cls = r.status === "CLOSED" ? "in" : A.isTerminal(r.status) ? "neutral" : "warn";
                  return '<span class="badge ' + cls + '">' + UI.esc(A.LABEL[r.status]) + "</span>"; } },
              { key: "age", label: "Age", type: "num", raw: function (r) { return A.ageInDays(r); },
                render: function (r) {
                  var s = A.slaState(r);
                  return s.level === "ok" ? s.age + "d" : '<span class="badge out">' + s.age + "d</span>"; } }
            ]
          };
        }

        if (state.report === "accuracy") {
          return {
            title: "Branch accuracy scorecard",
            head: ["Branch", "Zone", "Lines counted", "Clean lines", "Line accuracy %", "Unit accuracy %",
                   "System units", "Variance units", "Net variance", "Open cases", "Overdue"],
            rows: state.brRows,
            flat: function (r) {
              return [r.branch, r.zone, r.counted, r.clean, r.lineAccuracy, r.unitAccuracy,
                r.systemUnits, r.varianceUnits, r.netVariance, r.open, r.overdue];
            },
            cols: [
              { key: "branch", label: "Branch", render: function (r) { return "<b>" + UI.esc(r.branch) + "</b>"; } },
              { key: "zone", label: "Zone", render: function (r) { return '<span class="badge neutral">' + UI.esc(r.zone) + "</span>"; } },
              { key: "counted", label: "Counted", type: "num", render: function (r) { return UI.num(r.counted); } },
              { key: "lineAccuracy", label: "Line accuracy", type: "num", render: function (r) {
                  return r.lineAccuracy == null ? "\u2014" :
                    '<div class="progress"><span style="width:' + r.lineAccuracy + '%"></span></div>' +
                    '<span class="small">' + r.lineAccuracy + "%</span>"; } },
              { key: "unitAccuracy", label: "Unit accuracy", type: "num", render: function (r) {
                  return r.unitAccuracy == null ? "\u2014" : r.unitAccuracy + "%"; } },
              { key: "varianceUnits", label: "Units out", type: "num", render: function (r) { return UI.num(r.varianceUnits); } },
              { key: "overdue", label: "Overdue", type: "num", render: function (r) {
                  return r.overdue ? '<span class="badge out">' + r.overdue + "</span>" : "\u2014"; } }
            ]
          };
        }

        if (state.report === "auditor") {
          var byAud = {};
          lines.forEach(function (l) {
            var who = l.verifiedByName;
            if (!who) return;
            var a = byAud[who] || (byAud[who] = {
              auditor: who, verified: 0, discrepancies: 0, closed: 0, varianceUnits: 0, days: []
            });
            if (l.status === A.STATUS.VERIFIED) a.verified++;
            if (l.qtyDifference) { a.discrepancies++; a.varianceUnits += Math.abs(l.qtyDifference); }
            if (l.status === A.STATUS.CLOSED) {
              a.closed++;
              if (l.submittedAt && l.closedAt) {
                a.days.push(A.workingDaysBetween(l.submittedAt, new Date(l.closedAt).getTime()));
              }
            }
          });
          var audRows = Object.keys(byAud).map(function (k) {
            var a = byAud[k];
            a.cycles = state.cycles.filter(function (c) { return c.openedByName === k; }).length;
            a.avgClosure = a.days.length
              ? Math.round((a.days.reduce(function (x, y) { return x + y; }, 0) / a.days.length) * 10) / 10 : null;
            return a;
          }).sort(function (a, b) { return (b.verified + b.discrepancies) - (a.verified + a.discrepancies); });
          return {
            title: "Auditor activity",
            head: ["Auditor", "Cycles opened", "Lines verified", "Discrepancies raised", "Cases closed",
                   "Variance units found", "Avg closure (working days)"],
            rows: audRows,
            flat: function (r) {
              return [r.auditor, r.cycles, r.verified, r.discrepancies, r.closed, r.varianceUnits,
                r.avgClosure == null ? "" : r.avgClosure];
            },
            cols: [
              { key: "auditor", label: "Auditor", render: function (r) { return "<b>" + UI.esc(r.auditor) + "</b>"; } },
              { key: "cycles", label: "Cycles", type: "num", render: function (r) { return UI.num(r.cycles); } },
              { key: "verified", label: "Verified", type: "num", render: function (r) { return UI.num(r.verified); } },
              { key: "discrepancies", label: "Discrepancies", type: "num", render: function (r) { return UI.num(r.discrepancies); } },
              { key: "closed", label: "Closed", type: "num", render: function (r) { return UI.num(r.closed); } },
              { key: "varianceUnits", label: "Units found", type: "num", render: function (r) { return UI.num(r.varianceUnits); } },
              { key: "avgClosure", label: "Avg closure", type: "num", render: function (r) {
                  return r.avgClosure == null ? "\u2014" : r.avgClosure + "d"; } }
            ]
          };
        }

        if (state.report === "ageing") {
          var openCases = lines.filter(function (l) {
            return !A.isTerminal(l.status) && l.status !== A.STATUS.PENDING;
          }).map(function (l) {
            var s = A.slaState(l);
            return Object.assign({}, l, { _age: s.age, _level: s.level, _to: s.escalateTo, _cal: A.calendarAge(l) });
          }).sort(function (a, b) { return b._age - a._age; });
          return {
            title: "Ageing of open cases",
            head: ["Branch", "Product", "Status", "Working days", "Calendar days", "Owner", "Escalate to", "Rounds"],
            rows: openCases,
            flat: function (r) {
              return [r.branch, r.productName, A.LABEL[r.status], r._age, r._cal,
                A.slaState(r).owner, r._to, r.roundCount || 0];
            },
            cols: [
              { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
              { key: "productName", label: "Product", render: function (r) {
                  return '<a href="audit-case.html?line=' + encodeURIComponent(r.lineId) + '">' +
                    UI.esc(r.productName) + "</a>"; } },
              { key: "status", label: "Status", render: function (r) {
                  return '<span class="badge warn">' + UI.esc(A.LABEL[r.status]) + "</span>"; } },
              { key: "_age", label: "Working days", type: "num", render: function (r) {
                  var cls = r._level === "final" ? "out" : r._level === "ok" ? "neutral" : "warn";
                  return '<span class="badge ' + cls + '">' + r._age + "d</span>"; } },
              { key: "_cal", label: "Calendar", type: "num", render: function (r) { return r._cal + "d"; } },
              { key: "_to", label: "Escalate to", render: function (r) {
                  return r._to ? UI.esc(r._to) : "\u2014"; } },
              { key: "roundCount", label: "Rounds", type: "num", render: function (r) { return r.roundCount || 0; } }
            ]
          };
        }

        /* case history — every thread entry, flattened */
        var lineById = {};
        lines.forEach(function (l) { lineById[l.lineId] = l; });
        var hist = (state.responses || []).filter(function (r) { return lineById[r.lineId]; })
          .map(function (r) {
            var l = lineById[r.lineId];
            return {
              branch: l.branch, productName: l.productName, lineId: r.lineId,
              roundNo: r.roundNo, type: r.responseType, author: r.authorName,
              role: r.authorRole, text: r.text, at: r.createdAt,
              difference: l.qtyDifference, status: l.status
            };
          }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
        return {
          title: "Case history",
          head: ["Timestamp", "Branch", "Product", "Round", "Entry type", "Author", "Role", "Text", "Case status", "Difference"],
          rows: hist,
          flat: function (r) {
            return [UI.fmtDateTime(r.at), r.branch, r.productName, r.roundNo, r.type, r.author,
              w.RBAC.roles[r.role] ? w.RBAC.roles[r.role].label : r.role, r.text,
              A.LABEL[r.status], r.difference == null ? "" : r.difference];
          },
          cols: [
            { key: "at", label: "When", render: function (r) { return UI.fmtDateTime(r.at); } },
            { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
            { key: "productName", label: "Product", render: function (r) {
                return '<a href="audit-case.html?line=' + encodeURIComponent(r.lineId) + '">' +
                  UI.esc(r.productName) + "</a>"; } },
            { key: "type", label: "Entry", render: function (r) {
                var cls = r.type === "ACCEPTANCE" ? "in" : r.type === "JUSTIFICATION" ? "info" : "warn";
                return '<span class="badge ' + cls + '">' + UI.esc(r.type.replace(/_/g, " ").toLowerCase()) + "</span>"; } },
            { key: "author", label: "Author", render: function (r) {
                return UI.esc(r.author) + '<br><span class="muted small">' +
                  UI.esc(w.RBAC.roles[r.role] ? w.RBAC.roles[r.role].label : r.role) + "</span>"; } },
            { key: "text", label: "Text", render: function (r) {
                var t = String(r.text || "");
                return '<span title="' + UI.esc(t) + '">' + UI.esc(t.length > 70 ? t.slice(0, 69) + "\u2026" : t) + "</span>"; } }
          ]
        };
      }

      function renderReport() {
        var rep = buildReport();
        state.rep = rep;
        var repSub = d.getElementById("repSub");
        if (repSub) repSub.textContent = rep.title + " \u00b7 " + rep.rows.length +
          " row" + (rep.rows.length === 1 ? "" : "s");
        var repGrid = d.getElementById("repGrid");
        if (repGrid) UI.grid(repGrid, {
          columns: rep.cols, rows: rep.rows, pageSize: 15,
          searchPlaceholder: "Search this report\u2026",
          emptyTitle: "Nothing to report yet",
          emptyText: "Figures appear once auditors complete lines."
        });
      }

      function kpi(l, v, foot, kind) {
        return '<div class="kpi ' + (kind || "") + '"><div class="lbl">' + UI.esc(l) + '</div><div class="val">' +
          (typeof v === "number" ? UI.num(v) : UI.esc(v)) + '</div><div class="foot">' + UI.esc(foot) + "</div></div>";
      }

      /* Everything on screen, in one workbook. */
      d.getElementById("xlBtn").onclick = function () {
        var acc = A.accuracyFor(state.lines);
        var buckets = A.ageBuckets(state.lines);
        var overview = [
          [{ v: "AUDIT OVERVIEW", s: w.XLSX.styles.GROUP }, "", ""],
          ["Scope", w.RBAC.scopeLabel(user), ""],
          ["Cycles", state.cycles.length, ""],
          ["Lines counted", acc.counted, "of " + state.lines.length + " generated"],
          ["Clean lines", acc.clean, ""],
          ["Line accuracy %", acc.lineAccuracy, "clean lines / lines counted"],
          ["Unit accuracy %", acc.unitAccuracy, "1 - variance units / system units"],
          ["Variance units", acc.varianceUnits, ""],
          ["Net variance", acc.netVariance, ""],
          [],
          [{ v: "OPEN CASES BY AGE (working days)", s: w.XLSX.styles.GROUP }, "", ""]
        ];
        Object.keys(buckets).forEach(function (k) { overview.push([k + " days", buckets[k], ""]); });

        var rep = state.rep;
        UI.exportWorkbook("Audit-Dashboard-" + w.API.today(), [
          { name: "Overview", autoFilter: false,
            columns: [{ label: "Measure", width: 30 }, { label: "Value", width: 18 }, { label: "Note", width: 40 }],
            rows: overview },
          { name: "Branch Accuracy",
            columns: ["Branch", "Zone", "Lines counted", "Clean lines", "Line accuracy %", "Unit accuracy %",
                      "System units", "Variance units", "Net variance", "Open cases", "Overdue"]
              .map(function (h) { return { label: h, width: Math.max(14, h.length + 4) }; }),
            rows: state.brRows.map(function (r) {
              return [r.branch, r.zone, r.counted, r.clean, r.lineAccuracy, r.unitAccuracy,
                r.systemUnits, r.varianceUnits, r.netVariance, r.open, r.overdue];
            }) },
          { name: rep.title.slice(0, 28),
            columns: rep.head.map(function (h) { return { label: h, width: Math.max(12, Math.min(46, h.length + 6)) }; }),
            rows: rep.rows.map(rep.flat) }
        ]);
      };
      d.getElementById("pdfBtn").onclick = function () {
        UI.exportPDF("Audit dashboard \u2014 " + w.RBAC.scopeLabel(user));
      };

      load();
      w.API.onChange(UI.debounce(load, 400));
    }
  };
})(window, document);
