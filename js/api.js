/* ============================================================
   api.js — data layer

   Every screen talks to window.API and nothing else. Two adapters
   sit behind it, chosen by APP_CONFIG.backend:

     LocalAdapter          browser storage, single machine
     PowerAutomateAdapter  HTTP flows over SharePoint lists

   Both expose the same async methods, so switching environments
   is a one-line change in config.js.
   ============================================================ */
(function (w) {
  "use strict";

  var CFG = w.APP_CONFIG;
  var K = CFG.storageKey;

  /* ---------- small helpers ---------- */
  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" +
           Math.random().toString(36).slice(2, 7).toUpperCase();
  }
  function nowISO() { return new Date().toISOString(); }
  function today() { return new Date().toISOString().slice(0, 10); }
  var today_ = today;
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function norm(s) { return String(s == null ? "" : s).trim(); }

  /* ============================================================
     LOCAL ADAPTER
     ============================================================ */
  var Local = {
    _read: function (name, seed) {
      try {
        var raw = localStorage.getItem(K + "." + name);
        if (raw === null) {
          var init = seed ? clone(seed) : [];
          localStorage.setItem(K + "." + name, JSON.stringify(init));
          return init;
        }
        return JSON.parse(raw);
      } catch (e) {
        console.error("Storage read failed for " + name, e);
        return seed ? clone(seed) : [];
      }
    },

    _write: function (name, rows) {
      try {
        localStorage.setItem(K + "." + name, JSON.stringify(rows));
        localStorage.setItem(K + ".pulse", String(Date.now()));
        w.dispatchEvent(new CustomEvent("data:changed", { detail: { table: name } }));
        return true;
      } catch (e) {
        console.error("Storage write failed for " + name, e);
        if (e && e.name === "QuotaExceededError") {
          throw new Error("Browser storage is full. Export your data, then use Admin \u203a Reset demo data.");
        }
        throw e;
      }
    },

    /* ------------------------------------------------------------
       Seed reconciliation.

       Storage is written once on first visit. Without this step, a
       regenerated data/*.js file — a new user, a new product — is
       invisible to any browser that has already run the portal, and
       the person sees "no account matches" for an account that is
       plainly in the file.

       On every load: seed records missing from storage are added, and
       records the admin has never edited are refreshed from the file.
       Anything edited through Admin is left alone, so a password set
       in the portal is not overwritten by the file's default.
       ------------------------------------------------------------ */
    _reconcile: function (name, seed, keyField) {
      var summary = { table: name, added: [], updated: [] };
      if (!seed || !seed.length) return summary;

      var rows = this._read(name, seed);
      var index = {};
      rows.forEach(function (r, i) { index[r[keyField]] = i; });
      /* Products an admin deleted must not be resurrected from the file. */
      var gone = {};
      if (name === "products") {
        try { JSON.parse(localStorage.getItem(K + ".deletedProducts") || "[]").forEach(function (id) { gone[id] = 1; }); }
        catch (e) { /* none */ }
      }

      seed.forEach(function (s) {
        if (gone[s[keyField]]) return;
        var i = index[s[keyField]];
        if (i === undefined) {
          rows.push(clone(s));
          summary.added.push(s[keyField]);
          return;
        }
        if (rows[i].editedByAdmin) return;      /* admin edits win */
        var differs = Object.keys(s).some(function (k) {
          return JSON.stringify(rows[i][k]) !== JSON.stringify(s[k]);
        });
        if (differs) {
          rows[i] = Object.assign({}, rows[i], clone(s));
          summary.updated.push(s[keyField]);
        }
      });

      if (summary.added.length || summary.updated.length) {
        this._write(name, rows);
        /* The sync happens on whichever page loads first — usually the
           sign-in screen, where nobody is watching. Persist it so the
           Users screen can report it, and record it on the trail. */
        try {
          var log = JSON.parse(localStorage.getItem(K + ".lastSeedSync") || "[]");
          log.push({ table: name, added: summary.added, updated: summary.updated, at: nowISO() });
          localStorage.setItem(K + ".lastSeedSync", JSON.stringify(log.slice(-20)));
          var trail = this._read("audit", []);
          trail.push({
            auditId: uid("AUD"), action: "SEED_RECONCILED", entity: name,
            document: "", branch: "", productName: "",
            qty: summary.added.length + summary.updated.length,
            oldStock: "", newStock: "",
            beforeValue: summary.updated.join(", ").slice(0, 300),
            afterValue: summary.added.join(", ").slice(0, 300),
            user: "system", userName: "Data file sync", role: "SYSTEM", timestamp: nowISO()
          });
          localStorage.setItem(K + ".audit", JSON.stringify(trail));
        } catch (e) { /* reporting only — never block the sync */ }
      }
      return summary;
    },

    /* Full refresh, including records the admin has edited. Only run
       when someone explicitly asks for it. */
    resync: function () {
      var self = this;
      [["users", w.SEED_USERS, "username"],
       ["branches", w.SEED_BRANCHES, "branchCode"],
       ["products", w.SEED_PRODUCTS, "productId"]].forEach(function (t) {
        if (!t[1]) return;
        var rows = self._read(t[0], t[1]);
        var index = {};
        rows.forEach(function (r, i) { index[r[t[2]]] = i; });
        t[1].forEach(function (s) {
          var i = index[s[t[2]]];
          if (i === undefined) rows.push(clone(s));
          else rows[i] = Object.assign({}, rows[i], clone(s), { editedByAdmin: false });
        });
        self._write(t[0], rows);
      });
      return Promise.resolve();
    },

    init: function () {
      this._read("transactions", []);
      this._read("stocks", []);
      this._read("audit", []);
      this._read("auditCycles", []);
      this._read("auditLines", []);
      this._read("auditResponses", []);

      w.API_SEED_SYNC = [
        this._reconcile("users", w.SEED_USERS, "username"),
        this._reconcile("branches", w.SEED_BRANCHES, "branchCode"),
        this._reconcile("products", w.SEED_PRODUCTS, "productId")
      ].filter(function (s) { return s.added.length || s.updated.length; });
    },

    users:    function () { return Promise.resolve(this._read("users", w.SEED_USERS || [])); },
    branches: function () { return Promise.resolve(this._read("branches", w.SEED_BRANCHES || [])); },
    products: function () { return Promise.resolve(this._read("products", w.SEED_PRODUCTS || [])); },
    stocks:   function () { return Promise.resolve(this._read("stocks", [])); },
    txns:     function () { return Promise.resolve(this._read("transactions", [])); },
    audit:    function () { return Promise.resolve(this._read("audit", [])); },

    saveUser: function (user) {
      user.editedByAdmin = true;   /* protects it from seed reconciliation */
      var rows = this._read("users", w.SEED_USERS || []);
      var i = rows.findIndex(function (u) { return u.id === user.id; });
      if (i >= 0) { rows[i] = Object.assign(rows[i], user); }
      else { user.id = user.id || uid("U"); rows.push(user); }
      this._write("users", rows);
      return Promise.resolve(user);
    },

    /* Products are added by HO only. A new product carries its own
       master category, so the inventory report never has to guess. */
    saveProduct: function (product) {
      product.editedByAdmin = true;
      if (product.productId) {   /* re-adding a deleted code lifts its tombstone */
        try {
          var t0 = JSON.parse(localStorage.getItem(K + ".deletedProducts") || "[]");
          localStorage.setItem(K + ".deletedProducts", JSON.stringify(t0.filter(function (id) { return id !== product.productId; })));
        } catch (e) { /* ignore */ }
      }
      var rows = this._read("products", w.SEED_PRODUCTS || []);
      var i = rows.findIndex(function (p) { return p.productId === product.productId; });
      if (i >= 0) { rows[i] = Object.assign(rows[i], product); }
      else {
        if (!product.productId) {
          /* Continue the P### series past whatever the seed file ended on. */
          var max = rows.reduce(function (a, p) {
            var n = parseInt(String(p.productId).replace(/\D/g, ""), 10);
            return isFinite(n) && n > a ? n : a;
          }, 0);
          product.productId = "P" + String(max + 1).padStart(3, "0");
        }
        rows.push(product);
      }
      this._write("products", rows);
      return Promise.resolve(product);
    },

    deleteProduct: function (productId) {
      var rows = this._read("products", w.SEED_PRODUCTS || []);
      this._write("products", rows.filter(function (p) { return p.productId !== productId; }));
      try {
        var t = JSON.parse(localStorage.getItem(K + ".deletedProducts") || "[]");
        if (t.indexOf(productId) < 0) t.push(productId);
        localStorage.setItem(K + ".deletedProducts", JSON.stringify(t));
      } catch (e) { /* tombstone is best-effort */ }
      return Promise.resolve({ deleted: true, productId: productId });
    },

    balance: function (branch, productId) {
      var s = this._read("stocks", []).find(function (r) {
        return r.branch === branch && r.productId === productId;
      });
      return s ? Number(s.currentBalance) || 0 : 0;
    },

    /* The one write path that matters. A document (challan/invoice) can
       carry many product lines. Every line is validated against a
       projected balance before anything is written, so a document either
       saves whole or not at all — a half-posted challan is worse than a
       rejected one. */
    createBatch: function (header, lines, actor) {
      var self = this;
      return new Promise(function (resolve, reject) {
        if (!norm(header.branch)) return reject(new Error("This document has no branch attached."));
        if (!lines || !lines.length) return reject(new Error("Add at least one product line before saving."));

        /* Date rules. Future dates are refused for everything. A
           back-dated OUTWARD is refused unless the role is allowed one,
           because issuing stock on a past date changes a balance that
           reports, audits and stock summaries have already been run
           against. Inward is unrestricted backwards: goods arrive before
           the paperwork catches up, and recording that honestly is the
           point. */
        var today = today_();
        /* Two dates, deliberately. movementDate is when the stock
           physically moved and is the one every report runs on.
           entryDate is when it was typed into the portal, captured by
           the system and not editable. Where they differ, that gap is
           itself worth seeing. */
        var docDate = norm(header.date) || today;
        if (docDate > today) {
          return reject(new Error("The date is in the future. Stock cannot move before it happens."));
        }
        /* Movement category, validated against the list for this
           direction so an outward can never be filed as a Sales Return. */
        var cats = (CFG.movementCategories || {})[header.txnType] || [];
        var moveCat = norm(header.movementCategory);
        if (cats.length && moveCat && cats.indexOf(moveCat) < 0) {
          return reject(new Error(
            '"' + moveCat + '" is not a valid ' +
            (header.txnType === "IN" ? "inward" : "outward") + " category. Choose one of: " +
            cats.join(", ") + "."));
        }

        if (header.txnType === "OUT" && docDate < today &&
            !(w.RBAC && w.RBAC.can(actor, "canBackdateOutward"))) {
          return reject(new Error(
            "Outward entries cannot be back-dated at branch level. Use today's date, " +
            "or ask HO to post the entry if it genuinely belongs to " + docDate + "."));
        }

        var stocks = self._read("stocks", []);

        /* Project balances line by line, in the order they appear, so a
           product listed twice on the same document nets out correctly. */
        var projected = {};
        function keyOf(pid) { return header.branch + "\u0000" + pid; }
        function currentOf(pid) {
          var k = keyOf(pid);
          if (k in projected) return projected[k];
          var row = stocks.find(function (s) { return s.branch === header.branch && s.productId === pid; });
          projected[k] = row ? Number(row.currentBalance) || 0 : 0;
          return projected[k];
        }

        var planned = [];
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i];
          var label = "Line " + (i + 1) + " (" + (ln.productName || "no product") + ")";
          if (!norm(ln.productId)) return reject(new Error(label + ": pick a product."));
          var qty = Number(ln.qty);
          if (!isFinite(qty) || qty <= 0 || qty !== Math.floor(qty)) {
            return reject(new Error(label + ": quantity must be a whole number above zero."));
          }
          var before = currentOf(ln.productId);
          var after = header.txnType === "IN" ? before + qty : before - qty;
          if (header.txnType === "OUT" && after < 0 && CFG.blockNegativeStock) {
            return reject(new Error(
              label + ": only " + before + " in stock at " + header.branch +
              (before !== currentOf(ln.productId) ? "" : "") + ". Reduce the quantity or add an inward entry first."
            ));
          }
          projected[keyOf(ln.productId)] = after;
          planned.push({ line: ln, qty: qty, oldBalance: before, newBalance: after });
        }

        /* Everything checked out. Now write. */
        var batchId = uid("DOC");
        var stamp = nowISO();
        var txns = self._read("transactions", []);
        var audit = self._read("audit", []);
        var written = [];

        planned.forEach(function (pl) {
          var ln = pl.line;
          var row = {
            transactionId: uid("TXN"),
            batchId: batchId,
            date: docDate,                 /* when the stock moved */
            movementDate: docDate,         /* explicit alias, for reports */
            entryDate: today,              /* when it was entered here */
            movementCategory: moveCat,
            challanNo: norm(header.challanNo),
            invoiceNo: norm(header.invoiceNo),
            branch: header.branch,
            zone: header.zone || "",
            txnType: header.txnType,
            productId: ln.productId,
            productName: ln.productName,
            category: ln.category || "",
            qty: pl.qty,
            partyName: norm(header.partyName),
            remarks: norm(ln.remarks || header.remarks),
            enteredBy: actor.username,
            enteredByName: actor.fullName,
            timestamp: stamp
          };
          txns.push(row);
          written.push(row);

          var idx = stocks.findIndex(function (s) {
            return s.branch === header.branch && s.productId === ln.productId;
          });
          if (idx >= 0) {
            stocks[idx].currentBalance = pl.newBalance;
            stocks[idx].updatedAt = stamp;
          } else {
            stocks.push({
              stockId: uid("STK"), branch: header.branch, zone: header.zone || "",
              productId: ln.productId, productName: ln.productName, category: ln.category || "",
              currentBalance: pl.newBalance, updatedAt: stamp
            });
          }

          audit.push({
            auditId: uid("AUD"),
            action: header.txnType === "IN" ? "STOCK_INWARD" : "STOCK_OUTWARD",
            entity: "transactions/" + row.transactionId,
            document: norm(header.challanNo) || norm(header.invoiceNo) || batchId,
            movementCategory: moveCat,
            branch: header.branch, productName: ln.productName, qty: pl.qty,
            oldStock: pl.oldBalance, newStock: pl.newBalance,
            user: actor.username, userName: actor.fullName, role: actor.role,
            timestamp: stamp
          });
        });

        /* Transactions first: an orphan transaction is recoverable, a
           silent balance change is not. */
        self._write("transactions", txns);
        self._write("stocks", stocks);
        self._write("audit", audit);

        resolve({
          batchId: batchId,
          lineCount: planned.length,
          totalQty: planned.reduce(function (a, p) { return a + p.qty; }, 0),
          lines: planned.map(function (p) {
            return { productName: p.line.productName, qty: p.qty, oldBalance: p.oldBalance, newBalance: p.newBalance };
          }),
          txns: written
        });
      });
    },

    /* Single-line convenience wrapper, kept so older calls still work. */
    createTxn: function (txn, actor) {
      return this.createBatch({
        date: txn.date, challanNo: txn.challanNo, invoiceNo: txn.invoiceNo,
        branch: txn.branch, zone: txn.zone, txnType: txn.txnType,
        movementCategory: txn.movementCategory,
        partyName: txn.partyName, remarks: txn.remarks
      }, [{
        productId: txn.productId, productName: txn.productName,
        category: txn.category, qty: txn.qty, remarks: txn.remarks
      }], actor).then(function (res) {
        return { txn: res.txns[0], oldBalance: res.lines[0].oldBalance, newBalance: res.lines[0].newBalance };
      });
    },

    log: function (action, detail, actor) {
      var audit = this._read("audit", []);
      audit.push({
        auditId: uid("AUD"), action: action, entity: detail.entity || "",
        branch: detail.branch || "", productName: detail.productName || "",
        qty: detail.qty || 0, oldStock: detail.oldStock == null ? "" : detail.oldStock,
        newStock: detail.newStock == null ? "" : detail.newStock,
        user: actor ? actor.username : "system", userName: actor ? actor.fullName : "System",
        role: actor ? actor.role : "SYSTEM", timestamp: nowISO()
      });
      this._write("audit", audit);
      return Promise.resolve();
    },

    seedSyncLog: function () {
      try { return JSON.parse(localStorage.getItem(K + ".lastSeedSync") || "[]"); }
      catch (e) { return []; }
    },
    clearSeedSyncLog: function () {
      try { localStorage.removeItem(K + ".lastSeedSync"); } catch (e) {}
    },

    reset: function () {
      ["users", "branches", "products", "transactions", "stocks", "audit", "pulse",
       "auditCycles", "auditLines", "auditResponses", "lastSeedSync", "deletedProducts"]
        .forEach(function (t) { localStorage.removeItem(K + "." + t); });
      this.init();
      return Promise.resolve();
    },

    exportAll: function () {
      var self = this;
      var out = { exportedAt: nowISO(), version: CFG.version };
      ["users", "branches", "products", "transactions", "stocks", "audit"]
        .forEach(function (t) { out[t] = self._read(t, []); });
      return Promise.resolve(out);
    },

    importAll: function (payload) {
      var self = this;
      ["users", "branches", "products", "transactions", "stocks", "audit"]
        .forEach(function (t) { if (payload[t]) self._write(t, payload[t]); });
      return Promise.resolve();
    }
  };

  /* ============================================================
     POWER AUTOMATE ADAPTER
     Each method POSTs JSON to one HTTP-triggered flow. The flow
     does the SharePoint work and returns JSON. Flow definitions
     ============================================================ */
  var Flow = {
    /* Every call carries the signed-in user's session token. The flows check it
       against the Users list, so a copied flow URL alone gets nothing. */
    _call: function (flowName, body, opts) {
      opts = opts || {};
      var url = CFG.flows[flowName];
      if (!url) return Promise.reject(new Error('No URL configured for the "' + flowName + '" flow. Add it in js/config.js.'));
      var payload = Object.assign({}, body || {});
      if (!opts.noAuth) {
        var s = w.Auth && w.Auth.current ? w.Auth.current() : null;
        if (!s || !s.token) return Promise.reject(new Error("Your session has ended. Please sign in again."));
        payload.auth = { username: s.username, token: s.token };
      }
      return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (res) {
          return res.text().then(function (text) {
            var json = null;
            try { json = text ? JSON.parse(text) : {}; } catch (e) { /* not JSON */ }
            if (res.ok && json && !json.error) return json;
            var msg = json && json.error ? (typeof json.error === "object" ? (json.error.message || JSON.stringify(json.error)) : json.error) : "";
            if (!msg) {
              if (json && json.code && json.message) msg = json.code + ": " + json.message;
              else if (res.status === 504 || /timed out|timeout|upstream/i.test(text || "")) msg = "The flow took too long to answer. It may still have saved \u2014 check before sending again.";
              else msg = "Flow " + flowName + " returned " + res.status + ". " + String(text || "").slice(0, 200);
            }
            if (/TriggerRequestMethodNotValid/i.test(msg)) {
              msg = 'The "' + flowName + '" flow trigger is set to the wrong HTTP method. In Power Automate set the trigger Method to POST, save, and copy the new URL into js/config.js.';
            }
            var e = new Error(msg); e.status = res.status; e.flow = flowName;
            e.uncertain = res.status === 504 || /took too long/i.test(msg);
            if (res.status === 401 && !opts.noAuth) {
              try { w.Auth.signOut(true); } catch (x) { /* ignore */ }
              setTimeout(function () { location.href = "login.html?expired=1"; }, 1800);
            }
            throw e;
          });
        }, function () {
          throw new Error("Could not reach the server. Check your connection and try again.");
        });
    },
    _read: null,    /* set below: synchronous audit-store reads (see AuditStore) */
    init:      function () {},
    login:     function (u, p, hash) { return this._call("login", { username: u, passwordHash: hash }, { noAuth: true }); },
    resync:    function () { return Promise.resolve(); },
    _list: function (resource) { return this._call("read", { resource: resource }).then(function (r) { return r.value || []; }); },
    users:     function () { return this._list("users"); },
    branches:  function () {
      return this._list("branches").then(function (rows) { return rows.length ? rows : (w.SEED_BRANCHES || []); },
                                         function () { return w.SEED_BRANCHES || []; });
    },
    products:  function () { return this._list("products"); },
    stocks:    function () { return this._list("stocks"); },
    txns:      function () { return this._list("txns"); },
    audit:     function () { return this._list("auditlog"); },
    saveUser:    function (u) { return this._call("saveUser", u); },
    saveProduct: function (p, meta) {
      return this._call("saveProduct", Object.assign({}, p, { isNew: !!(meta && meta.isNew) })).then(function (r) {
        return Object.assign({}, p, r, { productId: r.productId || p.productId });
      });
    },
    deleteProduct: function (productId) { return this._call("deleteProduct", { productId: productId }); },

    /* A whole document is posted in one call. The flow checks every line
       before writing anything and refuses a BatchId it has already stored,
       so a retry after a timeout cannot post twice. */
    verifyBatches: function (ids) {
      return this.txns().then(function (list) {
        var seen = {};
        list.forEach(function (t) { if (t && t.batchId) seen[t.batchId] = true; });
        return { usable: true, found: ids.filter(function (i) { return seen[i]; }), missing: ids.filter(function (i) { return !seen[i]; }) };
      }).catch(function () { return { found: [], missing: ids.slice(), usable: false }; });
    },
    createBatch: function (header, lines, actor) {
      var batchId = header.batchId || uid("DOC");
      function s(v) { return v != null ? v : ""; }
      return this._call("createTxn", {
        header: { batchId: batchId, date: s(header.date), challanNo: s(header.challanNo), invoiceNo: s(header.invoiceNo),
                  branch: s(header.branch), zone: s(header.zone), txnType: s(header.txnType),
                  movementCategory: s(header.movementCategory), partyName: s(header.partyName), remarks: s(header.remarks) },
        lines: lines.map(function (l) {
          return { productId: s(l.productId), productName: s(l.productName), category: s(l.category),
                   qty: l.qty != null ? l.qty : 0, remarks: s(l.remarks) };
        })
      }).then(function (r) {
        var qty = lines.reduce(function (a, l) { return a + (Number(l.qty) || 0); }, 0);
        return { batchId: r.batchId || batchId, lineCount: r.lineCount != null ? r.lineCount : lines.length,
                 totalQty: r.totalQty != null ? r.totalQty : qty, lines: r.lines || [], raw: r };
      }).catch(function (e) { e.batchId = batchId; throw e; });
    },
    createTxn: function (txn, actor) {
      return this.createBatch({
        date: txn.date, challanNo: txn.challanNo, invoiceNo: txn.invoiceNo,
        branch: txn.branch, zone: txn.zone, txnType: txn.txnType,
        movementCategory: txn.movementCategory, partyName: txn.partyName, remarks: txn.remarks
      }, [{ productId: txn.productId, productName: txn.productName, category: txn.category, qty: txn.qty }], actor);
    },

    /* ---------- AuditStore ----------
       The Stock Auditor module reads and writes synchronously, so it works on an
       in-memory copy that is filled from SharePoint when a page opens and
       refreshed every CFG.auditRefreshSeconds. Every change is written back to
       SharePoint, one record at a time, through the saveRecords flow. A record
       with an unsent change is never overwritten by a refresh. */
    _keys: { auditCycles: "cycleId", auditLines: "lineId", auditResponses: "responseId", audit: "auditId" },
    _cache: { auditCycles: [], auditLines: [], auditResponses: [], audit: [] },
    _snap: { auditCycles: {}, auditLines: {}, auditResponses: {}, audit: {} },
    _queue: [], _busy: false, _hydrated: null, _timer: null,
    _readStore: function (name) { return clone(this._cache[name] || []); },
    _writeStore: function (name, rows) {
      var self = this, key = this._keys[name];
      if (!key) return true;
      this._cache[name] = rows;
      rows.forEach(function (r) {
        var id = r[key], str = JSON.stringify(r);
        if (id && self._snap[name][id] !== str) { self._snap[name][id] = str; self._enqueue(name, r); }
      });
      return true;
    },
    _enqueue: function (name, rec) {
      this._queue = this._queue.filter(function (q) { return !(q.name === name && q.rec[Flow._keys[name]] === rec[Flow._keys[name]]); });
      this._queue.push({ name: name, rec: clone(rec), tries: 0 });
      this._flush();
    },
    _pending: function (name, id) {
      return this._queue.some(function (q) { return q.name === name && q.rec[Flow._keys[name]] === id; });
    },
    _flush: function () {
      var self = this;
      if (self._busy || !self._queue.length) return;
      self._busy = true;
      var first = self._queue[0].name;
      var batch = [];
      for (var i = 0; i < self._queue.length && batch.length < 20; i++) if (self._queue[i].name === first) batch.push(self._queue[i]);
      self._call("saveRecords", { collection: first, records: batch.map(function (b) { return b.rec; }) }).then(function () {
        self._queue = self._queue.filter(function (q) { return batch.indexOf(q) < 0; });
      }).catch(function (e) {
        batch.forEach(function (b) { b.tries++; });
        var dead = batch.filter(function (b) { return b.tries >= 3; });
        if (dead.length) {
          self._queue = self._queue.filter(function (q) { return dead.indexOf(q) < 0; });
          if (w.UI) w.UI.toast("Not saved to SharePoint", dead.length + " change" + (dead.length === 1 ? "" : "s") + " could not be saved: " + e.message, "bad");
        }
      }).then(function () {
        self._busy = false;
        if (self._queue.length) setTimeout(function () { self._flush(); }, batch[0] && batch[0].tries ? 3000 : 50);
      });
    },
    hydrate: function () {
      var self = this;
      return this._call("read", { resource: "auditdata" }).then(function (r) {
        var map = { auditCycles: r.cycles, auditLines: r.lines, auditResponses: r.responses };
        Object.keys(map).forEach(function (name) {
          var key = self._keys[name], local = {}, rows = [];
          self._cache[name].forEach(function (x) { if (self._pending(name, x[key])) local[x[key]] = x; });
          (map[name] || []).forEach(function (p) {
            var rec; try { rec = JSON.parse(p); } catch (e) { return; }
            if (!rec || !rec[key]) return;
            if (local[rec[key]]) { rows.push(local[rec[key]]); delete local[rec[key]]; return; }
            self._snap[name][rec[key]] = JSON.stringify(rec); rows.push(rec);
          });
          Object.keys(local).forEach(function (id) { rows.push(local[id]); });
          self._cache[name] = rows;
        });
      });
    },
    ready: function () {
      var self = this;
      if (!self._hydrated) {
        self._hydrated = self.hydrate().then(function () {
          var every = Math.max(20, CFG.auditRefreshSeconds || 60) * 1000;
          if (!self._timer) self._timer = setInterval(function () {
            if (!document.hidden && !self._busy) self.hydrate().catch(function () { /* next tick */ });
          }, every);
        }).catch(function (e) {
          if (w.UI) w.UI.toast("Audit data not loaded", e.message, "bad");
        });
      }
      return self._hydrated;
    },
    log: function (action, d, actor) {
      d = d || {};
      var rec = { auditId: uid("AUD"), action: action, entity: d.entity || "", document: d.document || "", auditLineId: d.auditLineId || "",
        movementCategory: d.movementCategory || "", branch: d.branch || "", productName: d.productName || "",
        qty: d.qty == null ? "" : d.qty, oldStock: d.oldStock == null ? "" : d.oldStock, newStock: d.newStock == null ? "" : d.newStock,
        beforeValue: d.beforeValue == null ? "" : d.beforeValue, afterValue: d.afterValue == null ? "" : d.afterValue,
        timestamp: nowISO() };
      this._cache.audit.push(rec); this._snap.audit[rec.auditId] = JSON.stringify(rec);
      this._enqueue("audit", rec);
      return Promise.resolve();
    },
    reset:     function () { return Promise.reject(new Error("Reset is disabled against a shared backend.")); },
    exportAll: function () {
      var self = this;
      return Promise.all([self.users(), self.products(), self.stocks(), self.txns(), self.audit()])
        .then(function (r) {
          return { exportedAt: nowISO(), users: r[0], products: r[1], stocks: r[2], transactions: r[3], audit: r[4] };
        });
    },
    importAll: function () { return Promise.reject(new Error("Import is disabled against a shared backend.")); }
  };
  Flow._read = function (name) { return Flow._readStore(name); };
  Flow._write = function (name, rows) { return Flow._writeStore(name, rows); };

  /* ============================================================
     PUBLIC FACADE
     ============================================================ */
  var impl = CFG.backend === "powerautomate" ? Flow : Local;

  w.API = {
    mode: CFG.backend,
    impl: impl,
    uid: uid,
    today: today,
    nowISO: nowISO,

    init: function () { impl.init(); return this; },

    getUsers:    function () { return impl.users(); },
    login:       function (u, p, hash) { return impl.login ? impl.login(u, p, hash) : Promise.reject(new Error("Server login not supported")); },
    getBranches: function () { return impl.branches(); },
    getProducts: function () { return impl.products(); },
    getStocks:   function () { return impl.stocks(); },
    getTxns:     function () { return impl.txns(); },
    getAudit:    function () { return impl.audit(); },
    saveUser:    function (u) { return impl.saveUser(u); },
    saveProduct: function (p, meta) { return impl.saveProduct(p, meta); },
    deleteProduct: function (id, actor) { return impl.deleteProduct(id, actor); },
    /* Resolves when shared data the page needs synchronously is loaded. */
    ready:       function () { return impl.ready ? impl.ready() : Promise.resolve(); },
    createTxn:   function (t, actor) { return impl.createTxn(t, actor); },
    createBatch: function (header, lines, actor) { return impl.createBatch(header, lines, actor); },
    verifyBatches: function (ids) { return impl.verifyBatches ? impl.verifyBatches(ids) : Promise.resolve({found:[],missing:ids,usable:false}); },
    log:         function (a, d, actor) { return impl.log(a, d, actor); },
    reset:       function () { return impl.reset(); },
    seedSyncLog: function () { return impl.seedSyncLog ? impl.seedSyncLog() : []; },
    clearSeedSyncLog: function () { if (impl.clearSeedSyncLog) impl.clearSeedSyncLog(); },
    resync:      function () { return impl.resync ? impl.resync() : Promise.reject(new Error("Resync is only available on the local backend.")); },
    exportAll:   function () { return impl.exportAll(); },
    importAll:   function (p) { return impl.importAll(p); },

    /* Everything a screen needs, scoped to the signed-in user. */
    scopedData: function (user) {
      return Promise.all([
        this.getBranches(), this.getProducts(), this.getStocks(), this.getTxns()
      ]).then(function (r) {
        var branches = r[0], products = r[1], stocks = r[2], txns = r[3];
        var allowed = w.RBAC.visibleBranches(user, branches);
        var set = {};
        allowed.forEach(function (b) { set[b] = true; });
        return {
          branches: branches,
          allowedBranches: allowed,
          products: products,
          stocks: stocks.filter(function (s) { return set[s.branch]; }),
          txns: txns.filter(function (t) { return set[t.branch]; }),
          allStocks: stocks,
          allTxns: txns
        };
      });
    },

    /* Cross-tab live updates. In "local" mode a write in one tab
       fires this in every other tab on the same machine. In
       "powerautomate" mode the callback is driven by polling. */
    onChange: function (cb) {
      w.addEventListener("data:changed", cb);
      w.addEventListener("storage", function (e) {
        if (e.key && e.key.indexOf(K) === 0) cb(e);
      });
    }
  };

  w.API.init();
})(window);
