/* ============================================================
   auditapi.js — the Stock Auditor data layer

   Extends window.API with the audit collections. Kept separate
   from api.js so the stock write path and the audit write path
   stay physically apart: an auditor's session never touches a
   function that can move a balance.

   Correction model: FRD §0.1 Option C. The auditor never writes
   stock. Closing a case with a residual variance raises a
   PENDING adjustment; an HO Admin approves it, and only then
   does a normal transaction post through the ordinary stock
   path. Switch APP_CONFIG.audit.correctionModel to "document"
   to close cases without ever raising one.
   ============================================================ */
(function (w) {
  "use strict";

  var CFG = w.APP_CONFIG;
  var A = (CFG.audit = CFG.audit || {});
  if (!A.correctionModel) A.correctionModel = "adjust";   /* "adjust" | "document" */
  if (!A.sla) A.sla = { branchResponseDays: 3, branchEscalateDays: 5, branchFinalDays: 10, auditorReviewDays: 3 };
  if (A.allowAttachments == null) A.allowAttachments = false;  /* see FRD §5.7 */
  /* Non-working days excluded from SLA ageing. ISO dates, e.g. "2026-11-08". */
  if (!A.holidays) A.holidays = [];

  var STATUS = {
    PENDING: "PENDING_VERIFICATION",
    VERIFIED: "VERIFIED",
    JUSTIFICATION: "JUSTIFICATION_REQUESTED",
    RESPONDED: "BRANCH_RESPONDED",
    CLARIFICATION: "CLARIFICATION_REQUESTED",
    CLOSED: "CLOSED",
    UNRESOLVED: "CLOSED_UNRESOLVED",
    CANCELLED: "CANCELLED"
  };

  var LABEL = {};
  LABEL[STATUS.PENDING] = "Pending verification";
  LABEL[STATUS.VERIFIED] = "Verified";
  LABEL[STATUS.JUSTIFICATION] = "Justification requested";
  LABEL[STATUS.RESPONDED] = "Branch responded";
  LABEL[STATUS.CLARIFICATION] = "Clarification requested";
  LABEL[STATUS.CLOSED] = "Closed";
  LABEL[STATUS.UNRESOLVED] = "Closed \u2014 unresolved";
  LABEL[STATUS.CANCELLED] = "Cancelled";

  var TERMINAL = [STATUS.VERIFIED, STATUS.CLOSED, STATUS.UNRESOLVED, STATUS.CANCELLED];

  /* Every permitted move. Anything absent is refused and logged as a
     tamper attempt — FRD §6.1. */
  var TRANSITIONS = [
    { from: STATUS.PENDING,       to: STATUS.VERIFIED,      cap: "canAudit" },
    { from: STATUS.PENDING,       to: STATUS.JUSTIFICATION, cap: "canAudit" },
    { from: STATUS.PENDING,       to: STATUS.CANCELLED,     cap: "canAudit" },
    { from: STATUS.JUSTIFICATION, to: STATUS.RESPONDED,     cap: "canJustify" },
    { from: STATUS.JUSTIFICATION, to: STATUS.CANCELLED,     cap: "canAudit" },
    { from: STATUS.JUSTIFICATION, to: STATUS.UNRESOLVED,    cap: "canManageUsers" },
    { from: STATUS.RESPONDED,     to: STATUS.CLOSED,        cap: "canAudit" },
    { from: STATUS.RESPONDED,     to: STATUS.CLARIFICATION, cap: "canAudit" },
    { from: STATUS.CLARIFICATION, to: STATUS.RESPONDED,     cap: "canJustify" },
    { from: STATUS.CLARIFICATION, to: STATUS.UNRESOLVED,    cap: "canManageUsers" },
    { from: STATUS.CLOSED,        to: STATUS.RESPONDED,     cap: "canManageUsers" }   /* reopen */
  ];

  function can(actor, cap) {
    var def = w.RBAC.def(actor);
    if (cap === "canJustify") return def.canWrite === true && actor.role !== "STOCK_AUDITOR";
    return def[cap] === true;
  }

  function allowed(from, to, actor) {
    return TRANSITIONS.some(function (t) {
      return t.from === from && t.to === to && can(actor, t.cap);
    });
  }

  function nowISO() { return new Date().toISOString(); }
  function norm(s) { return String(s == null ? "" : s).trim(); }

  /* ---------- storage ---------- */
  var impl = w.API.impl;
  function read(name) {
    if (impl._read) return impl._read(name, []);
    try { return JSON.parse(localStorage.getItem(CFG.storageKey + "." + name) || "[]"); } catch(e) { return []; }
  }
  function write(name, rows) {
    if (impl._write) return impl._write(name, rows);
    localStorage.setItem(CFG.storageKey + "." + name, JSON.stringify(rows));
    return true;
  }
  function uid(p) { return w.API.uid(p); }

  function trail(action, detail, actor) {
    var rows = read("audit");
    rows.push({
      auditId: uid("AUD"),
      action: action,
      entity: detail.entity || "",
      document: detail.document || "",
      auditLineId: detail.auditLineId || "",
      branch: detail.branch || "",
      productName: detail.productName || "",
      qty: detail.qty == null ? "" : detail.qty,
      oldStock: detail.oldStock == null ? "" : detail.oldStock,
      newStock: detail.newStock == null ? "" : detail.newStock,
      beforeValue: detail.beforeValue == null ? "" : detail.beforeValue,
      afterValue: detail.afterValue == null ? "" : detail.afterValue,
      user: actor ? actor.username : "system",
      userName: actor ? actor.fullName : "System",
      role: actor ? actor.role : "SYSTEM",
      timestamp: nowISO()
    });
    write("audit", rows);
  }

  function reject(msg, actor, detail) {
    if (actor) trail("AUDIT_TAMPER_ATTEMPT", detail || {}, actor);
    return Promise.reject(new Error(msg));
  }

  /* ---------- variance, FRD §10.2 ---------- */
  function variance(systemQty, physicalQty) {
    var diff = physicalQty - systemQty;
    var pct = null;
    if (systemQty > 0) pct = Math.round((diff / systemQty) * 1000) / 10;
    else if (systemQty === 0 && physicalQty === 0) pct = 0;
    /* systemQty 0 with physical stock present stays null on purpose —
       dividing by zero would hide the more serious finding. */
    return { difference: diff, variancePercent: pct };
  }

  var Audit = {
    STATUS: STATUS,
    LABEL: LABEL,
    TERMINAL: TERMINAL,
    isTerminal: function (s) { return TERMINAL.indexOf(s) >= 0; },
    variance: variance,
    config: A,

    cycles: function () { return Promise.resolve(read("auditCycles")); },
    lines: function () { return Promise.resolve(read("auditLines")); },
    responses: function () { return Promise.resolve(read("auditResponses")); },

    linesFor: function (cycleId) {
      return this.lines().then(function (rows) {
        return rows.filter(function (l) { return l.cycleId === cycleId; });
      });
    },
    thread: function (lineId) {
      return this.responses().then(function (rows) {
        return rows.filter(function (r) { return r.lineId === lineId; })
                   .sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
      });
    },

    /* Branches this actor may see audit data for. An auditor's own
       branch is excluded — FRD §10.6. */
    scopeFor: function (actor, branches) {
      if (!actor) return [];
      if (actor.role === "HO_ADMIN") return branches.map(function (b) { return b.branchCode; });
      if (actor.role === "STOCK_AUDITOR") {
        var scope = actor.auditScope || [];
        var list;
        if (scope.indexOf("ALL") >= 0) {
          list = branches.map(function (b) { return b.branchCode; });
        } else if (actor.auditScopeType === "ZONE") {
          list = branches.filter(function (b) { return scope.indexOf(b.zone) >= 0; })
                         .map(function (b) { return b.branchCode; });
        } else {
          list = branches.filter(function (b) { return scope.indexOf(b.branchCode) >= 0; })
                         .map(function (b) { return b.branchCode; });
        }
        return list.filter(function (b) { return b !== actor.branch; });
      }
      if (actor.role === "REGIONAL_MANAGER") {
        var zones = actor.zones && actor.zones.length ? actor.zones : [actor.zone];
        return branches.filter(function (b) { return zones.indexOf(b.zone) >= 0; })
                       .map(function (b) { return b.branchCode; });
      }
      return actor.branch ? [actor.branch] : [];
    },

    /* ---------- cycles ---------- */
    openCycle: function (opts, actor) {
      if (!can(actor, "canAudit")) return reject("Your role cannot open an audit cycle.", actor, {});
      var branch = norm(opts.branch);
      if (!branch) return reject("Select a branch.", null);
      if (actor.role === "STOCK_AUDITOR" && actor.branch === branch) {
        return reject(
          "You are posted to " + branch + ", so you cannot audit it. Segregation of duties.",
          actor, { branch: branch, entity: "auditCycles" });
      }

      var cycles = read("auditCycles");
      var open = cycles.find(function (c) { return c.branch === branch && c.status === "OPEN"; });
      if (open) {
        return Promise.reject(new Error(
          "A cycle is already open for " + branch + " (" + open.periodLabel +
          ", opened by " + open.openedByName + "). Close it before starting another."));
      }

      return Promise.all([w.API.getProducts(), w.API.getStocks()]).then(function (r) {
        var products = r[0], stocks = r[1];
        var balOf = function (pid) {
          var s = stocks.find(function (x) { return x.branch === branch && x.productId === pid; });
          return s ? Number(s.currentBalance) || 0 : 0;
        };
        var scoped = products.filter(function (p) {
          if (opts.scopeType === "CATEGORY" && w.Master.of(p.productId) !== opts.scopeValue) return false;
          if (opts.scopeType === "IN_STOCK_ONLY" && balOf(p.productId) <= 0) return false;
          return true;
        });
        if (!scoped.length) return Promise.reject(new Error("No products match that scope at " + branch + "."));

        var cycleId = uid("CYC");
        var stamp = nowISO();
        var cycle = {
          cycleId: cycleId, branch: branch, zone: opts.zone || "",
          periodLabel: norm(opts.periodLabel) || new Date().toISOString().slice(0, 7),
          scopeType: opts.scopeType || "ALL", scopeValue: opts.scopeValue || "",
          status: "OPEN",
          openedByUserId: actor.id, openedByName: actor.fullName, openedByUsername: actor.username,
          openedAt: stamp, closedAt: null, closedByUserId: null,
          lineCount: scoped.length
        };

        var lines = read("auditLines");
        scoped.forEach(function (p) {
          lines.push({
            lineId: uid("ALN"), cycleId: cycleId, branch: branch,
            productId: p.productId, productName: p.productName,
            masterCategory: w.Master.parentLabel(w.Master.parentOf(w.Master.of(p.productId))),
            subCategory: w.Master.label(w.Master.of(p.productId)),
            masterKey: w.Master.of(p.productId),
            systemQtyAtOpen: balOf(p.productId),
            systemQtyAtSubmit: null,
            stockMovedDuringAudit: false,
            physicalQty: null, physicalQtyFaulty: null,
            qtyDifference: null, variancePercent: null,
            status: STATUS.PENDING,
            auditorRemarks: "",
            verifiedAt: null, verifiedByUserId: null, verifiedByName: null,
            submittedAt: null, closedAt: null, closedByUserId: null,
            closureRemark: "", cancelReason: "",
            roundCount: 0,
            adjustmentStatus: "NONE", adjustmentTxnId: null,
            createdAt: stamp
          });
        });

        cycles.push(cycle);
        write("auditLines", lines);
        write("auditCycles", cycles);
        trail("AUDIT_CYCLE_OPENED", {
          entity: "auditCycles/" + cycleId, branch: branch, document: cycle.periodLabel,
          afterValue: scoped.length + " lines, scope " + cycle.scopeType
        }, actor);
        return cycle;
      });
    },

    closeCycle: function (cycleId, actor, force, reason) {
      if (!can(actor, "canAudit")) return reject("Your role cannot close an audit cycle.", actor, {});
      var cycles = read("auditCycles");
      var i = cycles.findIndex(function (c) { return c.cycleId === cycleId; });
      if (i < 0) return Promise.reject(new Error("Cycle not found."));

      var lines = read("auditLines");
      var open = lines.filter(function (l) {
        return l.cycleId === cycleId && TERMINAL.indexOf(l.status) < 0;
      });
      if (open.length && !force) {
        return Promise.reject(new Error(
          open.length + " line" + (open.length === 1 ? " is" : "s are") +
          " still open. Finish them, or ask HO to force-close the cycle."));
      }
      if (open.length && force) {
        if (!can(actor, "canManageUsers")) return reject("Only HO Admin can force-close a cycle.", actor, {});
        if (!norm(reason)) return Promise.reject(new Error("A reason is required to force-close."));
        open.forEach(function (l) {
          var j = lines.findIndex(function (x) { return x.lineId === l.lineId; });
          lines[j].status = STATUS.UNRESOLVED;
          lines[j].closureRemark = "Force-closed with cycle: " + norm(reason);
          lines[j].closedAt = nowISO();
          trail("AUDIT_CASE_FORCE_CLOSED", {
            entity: "auditLines/" + l.lineId, auditLineId: l.lineId, branch: l.branch,
            productName: l.productName, beforeValue: l.status, afterValue: STATUS.UNRESOLVED
          }, actor);
        });
        write("auditLines", lines);
      }

      cycles[i].status = "CLOSED";
      cycles[i].closedAt = nowISO();
      cycles[i].closedByUserId = actor.id;
      write("auditCycles", cycles);
      trail("AUDIT_CYCLE_CLOSED", {
        entity: "auditCycles/" + cycleId, branch: cycles[i].branch,
        document: cycles[i].periodLabel,
        afterValue: force ? "force-closed: " + norm(reason) : "all lines terminal"
      }, actor);
      return Promise.resolve(cycles[i]);
    },

    /* ---------- line actions ---------- */

    /* Re-reads the live balance and reports whether it moved since the
       cycle snapshot — FRD §0.2 / §10.1. Called before every commit. */
    liveCheck: function (lineId) {
      var line = read("auditLines").find(function (l) { return l.lineId === lineId; });
      if (!line) return Promise.reject(new Error("Line not found."));
      return w.API.getStocks().then(function (stocks) {
        var s = stocks.find(function (x) { return x.branch === line.branch && x.productId === line.productId; });
        var live = s ? Number(s.currentBalance) || 0 : 0;
        return { line: line, liveQty: live, moved: live !== line.systemQtyAtOpen };
      });
    },

    saveRemark: function (lineId, text, actor) {
      if (!can(actor, "canAudit")) return reject("Your role cannot edit auditor remarks.", actor, {});
      var lines = read("auditLines");
      var i = lines.findIndex(function (l) { return l.lineId === lineId; });
      if (i < 0) return Promise.reject(new Error("Line not found."));
      if (TERMINAL.indexOf(lines[i].status) >= 0) return Promise.reject(new Error("This line is closed."));
      var before = lines[i].auditorRemarks;
      lines[i].auditorRemarks = norm(text).slice(0, 500);
      write("auditLines", lines);
      trail("AUDIT_REMARK_EDITED", {
        entity: "auditLines/" + lineId, auditLineId: lineId, branch: lines[i].branch,
        productName: lines[i].productName, beforeValue: before, afterValue: lines[i].auditorRemarks
      }, actor);
      return Promise.resolve(lines[i]);
    },

    verify: function (lineId, opts, actor) {
      var self = this;
      opts = opts || {};
      return this.liveCheck(lineId).then(function (chk) {
        var line = chk.line;
        if (!allowed(line.status, STATUS.VERIFIED, actor)) {
          return reject("You cannot verify a line at status " + LABEL[line.status] + ".",
            actor, { entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch });
        }
        if (chk.moved && !opts.confirmedMovement) {
          return Promise.reject(Object.assign(
            new Error("Stock moved during the audit: " + line.systemQtyAtOpen +
                      " when you opened this line, " + chk.liveQty + " now."),
            { code: "STOCK_MOVED", liveQty: chk.liveQty, openQty: line.systemQtyAtOpen }));
        }

        var lines = read("auditLines");
        var i = lines.findIndex(function (l) { return l.lineId === lineId; });
        lines[i].status = STATUS.VERIFIED;
        lines[i].systemQtyAtSubmit = chk.liveQty;
        lines[i].stockMovedDuringAudit = chk.moved;
        lines[i].physicalQty = chk.liveQty;
        lines[i].qtyDifference = 0;
        lines[i].variancePercent = 0;
        lines[i].verifiedAt = nowISO();
        lines[i].verifiedByUserId = actor.id;
        lines[i].verifiedByName = actor.fullName;
        if (norm(opts.remarks)) lines[i].auditorRemarks = norm(opts.remarks).slice(0, 500);
        write("auditLines", lines);

        trail("AUDIT_LINE_VERIFIED", {
          entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch,
          productName: line.productName, qty: chk.liveQty,
          beforeValue: STATUS.PENDING, afterValue: STATUS.VERIFIED,
          document: line.cycleId
        }, actor);
        if (chk.moved) {
          trail("AUDIT_STOCK_MOVED_CONFIRMED", {
            entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch,
            productName: line.productName, oldStock: line.systemQtyAtOpen, newStock: chk.liveQty
          }, actor);
        }
        return lines[i];
      });
    },

    raiseDiscrepancy: function (lineId, opts, actor) {
      return this.liveCheck(lineId).then(function (chk) {
        var line = chk.line;
        if (!allowed(line.status, STATUS.JUSTIFICATION, actor)) {
          return reject("You cannot raise a discrepancy on a line at status " + LABEL[line.status] + ".",
            actor, { entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch });
        }

        var phys = Number(opts.physicalQty);
        if (!isFinite(phys) || phys < 0 || phys !== Math.floor(phys)) {
          return Promise.reject(new Error("Physical quantity must be a whole number of zero or more."));
        }
        if (phys > 999999) return Promise.reject(new Error("Physical quantity looks wrong \u2014 over 999,999."));
        var remarks = norm(opts.remarks);
        if (remarks.length < 10) {
          return Promise.reject(new Error("Discrepancy remarks are required, at least 10 characters."));
        }
        if (chk.moved && !opts.confirmedMovement) {
          return Promise.reject(Object.assign(
            new Error("Stock moved during the audit: " + line.systemQtyAtOpen +
                      " when you opened this line, " + chk.liveQty + " now."),
            { code: "STOCK_MOVED", liveQty: chk.liveQty, openQty: line.systemQtyAtOpen }));
        }
        if (phys === chk.liveQty) {
          return Promise.reject(new Error(
            "Physical matches the system figure of " + chk.liveQty + ". Use Verified OK instead."));
        }

        var v = variance(chk.liveQty, phys);
        var lines = read("auditLines");
        var i = lines.findIndex(function (l) { return l.lineId === lineId; });
        lines[i].status = STATUS.JUSTIFICATION;
        lines[i].systemQtyAtSubmit = chk.liveQty;
        lines[i].stockMovedDuringAudit = chk.moved;
        lines[i].physicalQty = phys;
        lines[i].physicalQtyFaulty = opts.physicalQtyFaulty == null ? null : Number(opts.physicalQtyFaulty);
        lines[i].qtyDifference = v.difference;
        lines[i].variancePercent = v.variancePercent;
        lines[i].auditorRemarks = remarks.slice(0, 500);
        lines[i].submittedAt = nowISO();
        lines[i].verifiedByUserId = actor.id;
        lines[i].verifiedByName = actor.fullName;
        write("auditLines", lines);

        var responses = read("auditResponses");
        responses.push({
          responseId: uid("RSP"), lineId: lineId, roundNo: 1,
          authorUserId: actor.id, authorName: actor.fullName, authorRole: actor.role,
          responseType: "DISCREPANCY_RAISED", text: remarks, attachments: [],
          createdAt: nowISO()
        });
        write("auditResponses", responses);

        trail("AUDIT_DISCREPANCY_RAISED", {
          entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch,
          productName: line.productName, qty: phys,
          oldStock: chk.liveQty, newStock: phys, document: line.cycleId,
          beforeValue: STATUS.PENDING, afterValue: STATUS.JUSTIFICATION
        }, actor);
        return lines[i];
      });
    },

    cancelLine: function (lineId, reason, actor) {
      var lines = read("auditLines");
      var i = lines.findIndex(function (l) { return l.lineId === lineId; });
      if (i < 0) return Promise.reject(new Error("Line not found."));
      if (!allowed(lines[i].status, STATUS.CANCELLED, actor)) {
        return reject("This line cannot be cancelled at status " + LABEL[lines[i].status] + ".",
          actor, { entity: "auditLines/" + lineId, auditLineId: lineId });
      }
      if (norm(reason).length < 10) return Promise.reject(new Error("A cancellation reason of at least 10 characters is required."));
      var before = lines[i].status;
      lines[i].status = STATUS.CANCELLED;
      lines[i].cancelReason = norm(reason);
      lines[i].closedAt = nowISO();
      lines[i].closedByUserId = actor.id;
      write("auditLines", lines);
      trail("AUDIT_CASE_CANCELLED", {
        entity: "auditLines/" + lineId, auditLineId: lineId, branch: lines[i].branch,
        productName: lines[i].productName, beforeValue: before, afterValue: STATUS.CANCELLED
      }, actor);
      return Promise.resolve(lines[i]);
    },

    /* ---------- branch justification ---------- *
       Only text and attachments are accepted. Any attempt to send a
       quantity is refused and logged — FRD §5.x, US-09 AC 4. */
    submitJustification: function (lineId, payload, actor) {
      var lines = read("auditLines");
      var i = lines.findIndex(function (l) { return l.lineId === lineId; });
      if (i < 0) return Promise.reject(new Error("Case not found."));
      var line = lines[i];

      if (!allowed(line.status, STATUS.RESPONDED, actor)) {
        return reject("You cannot respond to a case at status " + LABEL[line.status] + ".",
          actor, { entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch });
      }
      if (actor.role !== "HO_ADMIN" && actor.branch !== line.branch) {
        return reject("This case belongs to " + line.branch + ", not your branch.",
          actor, { entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch });
      }
      /* Tamper guard: these fields are the auditor's, full stop. */
      var forbidden = ["systemQtyAtSubmit", "physicalQty", "qtyDifference", "auditorRemarks", "status"];
      var attempted = forbidden.filter(function (k) { return payload && payload[k] !== undefined; });
      if (attempted.length) {
        return reject("A branch response cannot change " + attempted.join(", ") + ".",
          actor, { entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch,
                   afterValue: "attempted: " + attempted.join(",") });
      }

      var text = norm(payload.text);
      if (text.length < 20) return Promise.reject(new Error("A justification of at least 20 characters is required."));
      if (text.length > 2000) return Promise.reject(new Error("Keep the justification under 2000 characters."));

      var atts = (payload.attachments || []).slice(0, 3);
      if (atts.length && !A.allowAttachments) {
        return Promise.reject(new Error(
          "Attachments need the shared backend. Describe the document in your response instead."));
      }

      var responses = read("auditResponses");
      var round = responses.filter(function (r) { return r.lineId === lineId; }).length + 1;
      responses.push({
        responseId: uid("RSP"), lineId: lineId, roundNo: round,
        authorUserId: actor.id, authorName: actor.fullName, authorRole: actor.role,
        responseType: "JUSTIFICATION", text: text, attachments: atts,
        createdAt: nowISO()
      });
      write("auditResponses", responses);

      var before = line.status;
      lines[i].status = STATUS.RESPONDED;
      lines[i].roundCount = (lines[i].roundCount || 0) + 1;
      lines[i].lastResponseAt = nowISO();
      write("auditLines", lines);

      trail("BRANCH_JUSTIFICATION_SUBMITTED", {
        entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch,
        productName: line.productName, beforeValue: before, afterValue: STATUS.RESPONDED,
        document: "round " + round
      }, actor);
      return Promise.resolve(lines[i]);
    },

    /* ---------- auditor review ---------- */
    acceptCase: function (lineId, remark, actor) {
      var lines = read("auditLines");
      var i = lines.findIndex(function (l) { return l.lineId === lineId; });
      if (i < 0) return Promise.reject(new Error("Case not found."));
      var line = lines[i];
      if (!allowed(line.status, STATUS.CLOSED, actor)) {
        return reject("A case at status " + LABEL[line.status] + " cannot be closed.",
          actor, { entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch });
      }
      if (norm(remark).length < 10) return Promise.reject(new Error("A closure remark of at least 10 characters is required."));

      var raiseAdj = A.correctionModel === "adjust" && Number(line.qtyDifference) !== 0;

      lines[i].status = STATUS.CLOSED;
      lines[i].closureRemark = norm(remark);
      lines[i].closedAt = nowISO();
      lines[i].closedByUserId = actor.id;
      lines[i].closedByName = actor.fullName;
      lines[i].adjustmentStatus = raiseAdj ? "PENDING" : "NONE";
      write("auditLines", lines);

      var responses = read("auditResponses");
      responses.push({
        responseId: uid("RSP"), lineId: lineId,
        roundNo: responses.filter(function (r) { return r.lineId === lineId; }).length + 1,
        authorUserId: actor.id, authorName: actor.fullName, authorRole: actor.role,
        responseType: "ACCEPTANCE", text: norm(remark), attachments: [], createdAt: nowISO()
      });
      write("auditResponses", responses);

      trail("AUDIT_CASE_ACCEPTED", {
        entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch,
        productName: line.productName, beforeValue: STATUS.RESPONDED, afterValue: STATUS.CLOSED
      }, actor);
      if (raiseAdj) {
        trail("STOCK_ADJUSTMENT_RAISED", {
          entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch,
          productName: line.productName, qty: Math.abs(line.qtyDifference),
          oldStock: line.systemQtyAtSubmit, newStock: line.physicalQty,
          afterValue: "PENDING HO approval"
        }, actor);
      }
      return Promise.resolve({ line: lines[i], adjustmentRaised: raiseAdj });
    },

    requestClarification: function (lineId, reason, actor) {
      var lines = read("auditLines");
      var i = lines.findIndex(function (l) { return l.lineId === lineId; });
      if (i < 0) return Promise.reject(new Error("Case not found."));
      var line = lines[i];
      if (!allowed(line.status, STATUS.CLARIFICATION, actor)) {
        return reject("A case at status " + LABEL[line.status] + " cannot be sent back.",
          actor, { entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch });
      }
      if (norm(reason).length < 10) return Promise.reject(new Error("A reason of at least 10 characters is required."));

      var responses = read("auditResponses");
      responses.push({
        responseId: uid("RSP"), lineId: lineId,
        roundNo: responses.filter(function (r) { return r.lineId === lineId; }).length + 1,
        authorUserId: actor.id, authorName: actor.fullName, authorRole: actor.role,
        responseType: "CLARIFICATION_REQUEST", text: norm(reason), attachments: [], createdAt: nowISO()
      });
      write("auditResponses", responses);

      lines[i].status = STATUS.CLARIFICATION;
      write("auditLines", lines);
      trail("AUDIT_CLARIFICATION_REQUESTED", {
        entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch,
        productName: line.productName, beforeValue: STATUS.RESPONDED, afterValue: STATUS.CLARIFICATION
      }, actor);
      return Promise.resolve(lines[i]);
    },

    reopenCase: function (lineId, reason, actor) {
      if (!can(actor, "canManageUsers")) return reject("Only HO Admin can reopen a case.", actor, {});
      var lines = read("auditLines");
      var i = lines.findIndex(function (l) { return l.lineId === lineId; });
      if (i < 0) return Promise.reject(new Error("Case not found."));
      if (lines[i].status !== STATUS.CLOSED) return Promise.reject(new Error("Only a closed case can be reopened."));
      if (norm(reason).length < 10) return Promise.reject(new Error("A reason of at least 10 characters is required."));
      if (lines[i].adjustmentStatus === "APPROVED") {
        return Promise.reject(new Error(
          "The correction for this case has already posted. Reverse it with a stock entry first."));
      }
      lines[i].status = STATUS.RESPONDED;
      lines[i].adjustmentStatus = "NONE";
      lines[i].closedAt = null;
      write("auditLines", lines);
      trail("AUDIT_CASE_REOPENED", {
        entity: "auditLines/" + lineId, auditLineId: lineId, branch: lines[i].branch,
        productName: lines[i].productName, beforeValue: STATUS.CLOSED, afterValue: STATUS.RESPONDED,
        afterValue2: norm(reason)
      }, actor);
      return Promise.resolve(lines[i]);
    },

    /* ---------- adjustments (HO Admin) ----------
       Any HO Admin may decide a correction, so two of them can be
       looking at the same one. First decision wins; the second is
       refused with the name and time of the first, because "no
       adjustment is pending" tells the second admin nothing about
       whether it was handled or lost. */
    decidedMessage: function (line) {
      var who = line.adjustmentApprovedBy || line.adjustmentRejectedBy || "another HO Admin";
      var when = line.adjustmentApprovedAt || line.adjustmentRejectedAt;
      var stamp = when ? new Date(when) : null;
      var at = stamp && !isNaN(stamp)
        ? " on " + String(stamp.getDate()).padStart(2, "0") + " " +
          ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][stamp.getMonth()] +
          " " + stamp.getFullYear() + " at " +
          String(stamp.getHours()).padStart(2, "0") + ":" + String(stamp.getMinutes()).padStart(2, "0")
        : "";
      if (line.adjustmentStatus === "APPROVED") {
        return "Already approved by " + who + at + ". The stock has moved and nothing further is needed.";
      }
      if (line.adjustmentStatus === "REJECTED") {
        return "Already rejected by " + who + at + ". The balance was left as it was.";
      }
      return "There is no correction pending on this case.";
    },

    pendingAdjustments: function () {
      return this.lines().then(function (rows) {
        return rows.filter(function (l) { return l.adjustmentStatus === "PENDING"; });
      });
    },

    /* Approval posts through the ordinary stock path, so the correction
       shows up in Stock summary and Reports like any other movement.
       The adjustment applies to the balance now, not the balance at
       count time — FRD §6.2 item 4. */
    approveAdjustment: function (lineId, actor) {
      if (!can(actor, "canManageUsers")) return reject("Only HO Admin can approve a stock adjustment.", actor, {});
      var lines = read("auditLines");
      var i = lines.findIndex(function (l) { return l.lineId === lineId; });
      if (i < 0) return Promise.reject(new Error("Case not found."));
      var line = lines[i];
      if (line.adjustmentStatus !== "PENDING") {
        return Promise.reject(Object.assign(new Error(this.decidedMessage(line)), { code: "ALREADY_DECIDED" }));
      }

      var diff = Number(line.qtyDifference) || 0;
      if (!diff) return Promise.reject(new Error("There is no difference to adjust."));

      return w.API.createBatch({
        date: w.API.today(),
        challanNo: "ADJ/" + line.cycleId.slice(-6),
        invoiceNo: "",
        branch: line.branch,
        zone: line.zone || "",
        txnType: diff > 0 ? "IN" : "OUT",
        partyName: "Stock audit correction",
        remarks: "Audit " + line.lineId + " \u2014 counted " + line.physicalQty +
                 " against system " + line.systemQtyAtSubmit + ". Approved by " + actor.fullName + "."
      }, [{
        productId: line.productId, productName: line.productName,
        category: line.subCategory, qty: Math.abs(diff)
      }], actor).then(function (res) {
        var rows = read("auditLines");
        var j = rows.findIndex(function (l) { return l.lineId === lineId; });
        rows[j].adjustmentStatus = "APPROVED";
        rows[j].adjustmentTxnId = res.txns[0].transactionId;
        rows[j].adjustmentApprovedBy = actor.fullName;
        rows[j].adjustmentApprovedAt = nowISO();
        write("auditLines", rows);
        trail("STOCK_ADJUSTMENT_APPROVED", {
          entity: "auditLines/" + lineId, auditLineId: lineId, branch: line.branch,
          productName: line.productName, qty: Math.abs(diff),
          oldStock: res.lines[0].oldBalance, newStock: res.lines[0].newBalance,
          document: res.txns[0].transactionId
        }, actor);
        return { line: rows[j], result: res };
      });
    },

    rejectAdjustment: function (lineId, reason, actor) {
      if (!can(actor, "canManageUsers")) return reject("Only HO Admin can reject a stock adjustment.", actor, {});
      if (norm(reason).length < 10) return Promise.reject(new Error("A reason of at least 10 characters is required."));
      var lines = read("auditLines");
      var i = lines.findIndex(function (l) { return l.lineId === lineId; });
      if (i < 0) return Promise.reject(new Error("Case not found."));
      /* The same guard as approve. Without it a second admin could reject
         a correction that has already posted, leaving a record marked
         REJECTED with the stock already moved. */
      if (lines[i].adjustmentStatus !== "PENDING") {
        return Promise.reject(Object.assign(new Error(this.decidedMessage(lines[i])), { code: "ALREADY_DECIDED" }));
      }
      lines[i].adjustmentStatus = "REJECTED";
      lines[i].adjustmentRejectReason = norm(reason);
      lines[i].adjustmentRejectedBy = actor.fullName;
      lines[i].adjustmentRejectedAt = nowISO();
      write("auditLines", lines);
      trail("STOCK_ADJUSTMENT_REJECTED", {
        entity: "auditLines/" + lineId, auditLineId: lineId, branch: lines[i].branch,
        productName: lines[i].productName, qty: Math.abs(Number(lines[i].qtyDifference) || 0),
        afterValue: norm(reason)
      }, actor);
      return Promise.resolve(lines[i]);
    },

    /* ---------- SLA, FRD §6.3 ----------
       Counted in working days, not calendar days. An SLA that runs over
       Diwali produces escalations nobody deserves, and people learn to
       ignore the alerts. Sundays plus APP_CONFIG.audit.holidays are
       excluded. */
    workingDaysBetween: function (fromISO, toMs) {
      var start = new Date(fromISO);
      if (isNaN(start)) return 0;
      var end = new Date(toMs == null ? Date.now() : toMs);
      var holidays = A.holidays || [];
      var days = 0;
      var cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      var last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cur < last) {
        cur.setDate(cur.getDate() + 1);
        var dow = cur.getDay();
        var iso = cur.toISOString().slice(0, 10);
        if (dow !== 0 && holidays.indexOf(iso) < 0) days++;
      }
      return days;
    },

    ageInDays: function (line) {
      var from = line.lastResponseAt || line.submittedAt || line.createdAt;
      if (!from) return 0;
      return this.workingDaysBetween(from);
    },

    calendarAge: function (line) {
      var from = line.lastResponseAt || line.submittedAt || line.createdAt;
      if (!from) return 0;
      return Math.floor((Date.now() - new Date(from).getTime()) / 86400000);
    },

    slaState: function (line) {
      var age = this.ageInDays(line);
      if (line.status === STATUS.JUSTIFICATION || line.status === STATUS.CLARIFICATION) {
        if (age >= A.sla.branchFinalDays)
          return { level: "final", age: age, owner: "Branch", escalateTo: "HO Admin", label: "Escalate to HO" };
        if (age >= A.sla.branchEscalateDays)
          return { level: "escalate", age: age, owner: "Branch", escalateTo: "Regional Manager", label: "Escalate to RM" };
        if (age >= A.sla.branchResponseDays)
          return { level: "due", age: age, owner: "Branch", escalateTo: "", label: "Overdue" };
      }
      if (line.status === STATUS.RESPONDED && age >= A.sla.auditorReviewDays) {
        return { level: "due", age: age, owner: "Auditor", escalateTo: "HO Admin", label: "Awaiting auditor review" };
      }
      return { level: "ok", age: age, owner: "", escalateTo: "", label: "" };
    },

    /* ---------- analytics, FRD §8 ----------
       Two accuracy figures on purpose. Line accuracy answers "how often
       is the branch right"; unit accuracy answers "how wrong are they
       when they are wrong". A branch out by 500 units on one line of a
       hundred scores 99% on the first and far worse on the second, and
       quoting only one of them is a decision, not a simplification. */
    accuracyFor: function (lines) {
      var counted = lines.filter(function (l) {
        return l.status !== STATUS.PENDING && l.status !== STATUS.CANCELLED;
      });
      var clean = counted.filter(function (l) { return !l.qtyDifference; });
      var sysUnits = counted.reduce(function (a, l) {
        return a + Math.abs(Number(l.systemQtyAtSubmit) || 0);
      }, 0);
      var varUnits = counted.reduce(function (a, l) {
        return a + Math.abs(Number(l.qtyDifference) || 0);
      }, 0);
      return {
        counted: counted.length,
        clean: clean.length,
        lineAccuracy: counted.length ? Math.round((clean.length / counted.length) * 1000) / 10 : null,
        unitAccuracy: sysUnits ? Math.round((1 - varUnits / sysUnits) * 1000) / 10 : null,
        systemUnits: sysUnits,
        varianceUnits: varUnits,
        netVariance: counted.reduce(function (a, l) { return a + (Number(l.qtyDifference) || 0); }, 0)
      };
    },

    /* Open cases bucketed by age, for the ageing report. */
    ageBuckets: function (lines) {
      var self = this;
      var b = { "0-3": 0, "4-7": 0, "8-14": 0, "15+": 0 };
      lines.filter(function (l) { return !self.isTerminal(l.status) && l.status !== STATUS.PENDING; })
        .forEach(function (l) {
          var a = self.ageInDays(l);
          if (a <= 3) b["0-3"]++;
          else if (a <= 7) b["4-7"]++;
          else if (a <= 14) b["8-14"]++;
          else b["15+"]++;
        });
      return b;
    },

    /* Everything currently sitting on someone, for the task badge. */
    tasksFor: function (user, lines) {
      var self = this;
      if (!user) return [];
      if (user.role === "BRANCH_USER") {
        return lines.filter(function (l) {
          return l.branch === user.branch &&
            (l.status === STATUS.JUSTIFICATION || l.status === STATUS.CLARIFICATION);
        });
      }
      if (user.role === "STOCK_AUDITOR") {
        return lines.filter(function (l) { return l.status === STATUS.RESPONDED; });
      }
      if (user.role === "HO_ADMIN") {
        return lines.filter(function (l) {
          return l.adjustmentStatus === "PENDING" ||
            (self.slaState(l).level === "final");
        });
      }
      if (user.role === "REGIONAL_MANAGER") {
        return lines.filter(function (l) {
          var s = self.slaState(l);
          return s.level === "escalate" || s.level === "final";
        });
      }
      return [];
    }
  };

  w.Audit = Audit;
})(window);
