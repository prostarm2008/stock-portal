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

      seed.forEach(function (s) {
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
       "auditCycles", "auditLines", "auditResponses", "lastSeedSync"]
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
     and list schemas: docs/POWER-AUTOMATE-SETUP.md
     ============================================================ */
  var Flow = {
    _normalizeKeys: function(data) {
      if (!data) return data;
      if (Array.isArray(data)) {
        return data.map(function(obj) {
          var res = {};
          for (var k in obj) {
            var newKey = k.charAt(0).toLowerCase() + k.slice(1);
            var lowerK = k.toLowerCase();
            if (lowerK === "productid") newKey = "productId";
            else if (lowerK === "productname") newKey = "productName";
            else if (lowerK === "empcode") newKey = "empCode";
            else if (lowerK === "fullname") newKey = "fullName";
            else if (lowerK === "reorderlevel") newKey = "reorderLevel";
            else if (lowerK === "managername") newKey = "managerName";
            else if (lowerK === "managercode") newKey = "managerCode";
            else if (lowerK === "passwordhash") newKey = "passwordHash";
            else if (lowerK === "challanno") newKey = "challanNo";
            else if (lowerK === "invoiceno") newKey = "invoiceNo";
            else if (lowerK === "txntype") newKey = "txnType";
            else if (lowerK === "movementcategory") newKey = "movementCategory";
            else if (lowerK === "partyname") newKey = "partyName";
            res[newKey] = obj[k];
          }
          
          if (res.title) {
            if (res.productName && !res.productId) res.productId = res.title;
            if (res.fullName && !res.empCode) res.empCode = res.title;
            if (res.action && !res.auditId) res.auditId = res.title;
            if (res.batchId && !res.transactionId) res.transactionId = res.title;
            if (res.branchName && !res.branchCode) res.branchCode = res.title;
          }
          
          if (res.batchId && String(res.batchId).indexOf("DOC-") === 0) {
            var s = String(res.batchId).substring(4);
            if (s.length >= 14) {
               var t = s.substring(0,4) + "-" + s.substring(4,6) + "-" + s.substring(6,8) + "T" +
                       s.substring(8,10) + ":" + s.substring(10,12) + ":" + s.substring(12,14) + "Z";
               if (!res.timestamp) res.timestamp = t;
            }
          }
          
          if (!res.timestamp) res.timestamp = "";

          if (res.txnDate && !isNaN(res.txnDate) && Number(res.txnDate) > 10000) {
            var dt = new Date(Math.round((Number(res.txnDate) - 25569) * 86400 * 1000));
            res.date = dt.toISOString().split("T")[0];
          } else if (res.txnDate) {
            res.date = String(res.txnDate).split("T")[0];
          }
          
          if (!res.date && res.timestamp) res.date = res.timestamp.split("T")[0];
          if (!res.date) res.date = "";

          return res;
        });
      }
      /* A single object needs the same treatment. The login flow returns
         one user, and SharePoint hands back PascalCase, so without this
         the session gets fullName/role/branch = undefined and every
         branch check fails. */
      if (data && typeof data === "object") return this._normalizeKeys([data])[0];
      return data;
    },
    _get: function (flowName) {
      var self = this;
      var url = CFG.flows[flowName];
      if (!url) return Promise.reject(new Error('No URL configured for "' + flowName + '"'));
      var attempt = 0;
      function doFetch() { var startTime = Date.now();
        attempt++;
        return fetch(url, { method: "GET" }).then(function (res) {
          return res.text().then(function(text) {
            var json;
            try { json = text ? JSON.parse(text) : {}; }
            catch(e) {
              if (text && (text.toLowerCase().indexOf("<!doctype") !== -1 || text.indexOf("<html") !== -1 || text.indexOf("__cookie_check") !== -1)) {
                var titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
                var title = titleMatch ? titleMatch[1] : "Unknown HTML";
                var elapsed = Date.now() - startTime; if (title.indexOf("Starting Server") !== -1 && attempt < 15 && elapsed < 10000) {
                   return new Promise(function(resolve) { setTimeout(resolve, 3000); }).then(doFetch);
                }
                throw new Error("Server returned an unexpected page: " + title + ". This usually means the server is rebooting or disconnected. Please wait 5 seconds and hit F5.");
              }
              if (!res.ok) return res.text().then(function (t) { var e = new Error(self._describeFailure(flowName, res.status, t)); e.status = res.status; e.flow = flowName; throw e; });
              throw new Error("Invalid JSON response from server");
            }
            if (!res.ok) {
              /* Route through _describeFailure so a gateway timeout is
                 named as one, and keep the status and key on the error
                 so the caller can decide whether it is safe to retry. */
              var e2 = new Error(self._describeFailure(flowName, res.status, text));
              e2.status = res.status;
              e2.flow = flowName;
              e2.batchId = (body && body.header && body.header.batchId) || opts.label || "";
              e2.uncertain = /upstream server|did not receive a response|timed out|timeout/i
                .test(text || "") || res.status === 504;
              throw e2;
            }
            return json;
          });
        }).then(function (json) {
          if (json && json.error) throw new Error(typeof json.error === "object" ? (json.error.message || JSON.stringify(json.error)) : json.error);
          if (json && json.value) json.value = self._normalizeKeys(json.value);
          else json = self._normalizeKeys(json);
          return json;
        });
      }
      return doFetch();
    },
    /* Power Automate puts the real reason in the response body. Losing
       it leaves "returned 502" and nothing to act on. 502/503/504/429
       from the gateway are usually transient, so those are retried. */
    _describeFailure: function (flowName, status, text) {
      var detail = "";
      try {
        var j = JSON.parse(text);
        detail = (j.error && (j.error.message || j.error.code))
          ? (j.error.code ? j.error.code + ": " : "") + (j.error.message || "")
          : (j.message || j.details || j.error || "");
        if (detail && typeof detail !== "string") detail = JSON.stringify(detail);
        if (!detail) detail = JSON.stringify(j).slice(0, 300);
      } catch (e) { detail = String(text || "").slice(0, 300); }
      var hint = "";
      var upstream = /upstream server|did not receive a response|timed out|timeout/i.test(detail || "");
      if (upstream || status === 504) {
        hint = " This is a gateway timeout: the flow took too long to answer. " +
               "It may still have written the rows \u2014 do not simply send the file again.";
      } else if (status === 502 || status === 500) {
        hint = " The flow ran and failed. Open createTxn in Power Automate \u2014 the failed " +
               "action in its run history names the real cause.";
      } else if (status === 429) {
        hint = " Power Automate is throttling. Increase bulkPostGapMs in js/config.js.";
      } else if (status === 401 || status === 403) {
        hint = " The flow URL or its signature is no longer valid.";
      } else if (status === 404) {
        hint = " No flow at that URL. Check js/config.js.";
      }
      return "Flow " + flowName + " returned " + status + "." + (detail ? " " + detail : "") + hint;
    },

    _post: function (flowName, body, opts) {
      opts = opts || {};
      var self = this;
      var url = CFG.flows[flowName];
      if (!url) {
        return Promise.reject(new Error('No URL configured for the "' + flowName + '" flow. Add it in js/config.js.'));
      }
      var attempt = 0;
      function doFetch() { var startTime = Date.now();
        attempt++;
        return fetch(url, { method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body || {})
        }).then(function (res) {
          return res.text().then(function(text) {
            var json;
            try { json = text ? JSON.parse(text) : {}; }
            catch(e) {
              if (text && (text.toLowerCase().indexOf("<!doctype") !== -1 || text.indexOf("<html") !== -1)) {
                var titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
                var title = titleMatch ? titleMatch[1] : "Unknown HTML";
                var elapsed = Date.now() - startTime; if (title.indexOf("Starting Server") !== -1 && attempt < 15 && elapsed < 10000) {
                   return new Promise(function(resolve) { setTimeout(resolve, 3000); }).then(doFetch);
                }
                var snippet = text.substring(0, 100).replace(/\n/g, "");
                if (title.indexOf("Starting Server") !== -1) {
    if (elapsed >= 10000) throw new Error("The connection timed out, but the upload is likely still processing in the background. Please wait 1 minute and check the Stock Summary.");
    throw new Error("Server is taking longer than expected to wake up. Please wait 10 seconds and try again.");
  }
                throw new Error("Server returned HTML: " + title + " / " + snippet);
              }
              if (!res.ok) return res.text().then(function (t) { var e = new Error(self._describeFailure(flowName, res.status, t)); e.status = res.status; e.flow = flowName; throw e; });
              throw new Error("Invalid JSON response from server");
            }
            if (!res.ok) {
              /* Route through _describeFailure so a gateway timeout is
                 named as one, and keep the status and key on the error
                 so the caller can decide whether it is safe to retry. */
              var e2 = new Error(self._describeFailure(flowName, res.status, text));
              e2.status = res.status;
              e2.flow = flowName;
              e2.batchId = (body && body.header && body.header.batchId) || opts.label || "";
              e2.uncertain = /upstream server|did not receive a response|timed out|timeout/i
                .test(text || "") || res.status === 504;
              throw e2;
            }
            return json;
          });
        }).then(function (json) {
          if (json && json.error) throw new Error(typeof json.error === "object" ? (json.error.message || JSON.stringify(json.error)) : json.error);
          if (json && json.value) json.value = self._normalizeKeys(json.value);
          else json = self._normalizeKeys(json);
          return json;
        });
      }
      return doFetch();
    },
    init:      function () {},
    login:     function (u, p, hash) { return this._post("login", { username: u, password: p, passwordHash: hash }); },
    resync:    function () { return Promise.resolve(); },
    users:     function () { return this._post("listUsers", {}).then(function (r) { return r.value || r; }); },
    branches:  function () { return Promise.resolve(w.SEED_BRANCHES || []); },
    products:  function () { return this._get("listProducts").then(function (r) { return r.value || r; }); },
    stocks:    function () { return this._get("listStock").then(function (r) { return r.value || r; }); },
    txns: function () { 
      return this._get("listTxns").then(function (r) { 
        var arr = r.value || r;
        var batches = {};
        arr.forEach(function(t) {
          if (!t.batchId) return;
          if (!batches[t.batchId]) batches[t.batchId] = [];
          batches[t.batchId].push(t);
        });
        
        var seenHashes = {};
        var validBatchIds = {};
        
        // Sort batch IDs so we process older ones first (DOC-YYYYMMDD...)
        var batchIds = Object.keys(batches).sort();
        batchIds.forEach(function(bId) {
          var lines = batches[bId];
          var first = lines[0];
          // Create a signature for the batch
          var productKeys = lines.map(function(l) { return l.productId + ':' + l.qty; }).sort().join(',');
          var hash = first.branch + '|' + (first.challanNo||'') + '|' + first.txnType + '|' + (first.date || first.txnDate || '') + '|' + productKeys;
          
          if (!seenHashes[hash]) {
            seenHashes[hash] = true;
            validBatchIds[bId] = true;
          }
        });
        
        /* Hiding "duplicate-looking" batches at read time was a workaround
           for double-posting caused by blind retries. It is off by default
           now, because two genuine documents can legitimately share a
           branch, date, challan and product list \u2014 two identical transfers
           on one day, for instance \u2014 and suppressing one makes the stock
           summary, the dashboard and every report under-report real stock.

           Duplicates are now prevented at the source instead: each document
           carries a BatchId, and the flow should refuse one it has already
           written. Set hideDuplicateBatches:true in js/config.js only as a
           temporary measure while historic duplicates are cleaned up. */
        if (!CFG.hideDuplicateBatches) return arr;
        return arr.filter(function(t) {
          return !t.batchId || validBatchIds[t.batchId];
        });
      }); 
    },
    audit:     function () { return this._get("listAudit").then(function (r) { return r.value || r; }); },
    saveUser:    function (u) { return this._post("saveUser", u); },
    saveProduct: function (p) { return this._post("saveProduct", p); },
    /* The flow re-validates every line server-side and writes them in one
       transaction. The client checks are for fast feedback only — never
       trust them as the gate. */
    /* After a timeout we cannot tell from the reply whether the rows were
       written. Re-read the transactions and look for the keys we sent.
       Resolves to { found: [...], missing: [...], usable: bool }.
       usable is false when the flow does not store BatchId, in which case
       the portal says so rather than guessing. */
    verifyBatches: function (ids) {
      return this.txns().then(function (rows) {
        var list = (rows && rows.value) ? rows.value : rows;
        if (!Array.isArray(list)) return { found: [], missing: ids.slice(), usable: false };
        var anyKey = list.some(function (t) { return t && t.batchId; });
        var seen = {};
        list.forEach(function (t) { if (t && t.batchId) seen[t.batchId] = true; });
        return {
          usable: anyKey || list.length === 0,
          found: ids.filter(function (i) { return seen[i]; }),
          missing: ids.filter(function (i) { return !seen[i]; })
        };
      }).catch(function () { return { found: [], missing: ids.slice(), usable: false }; });
    },

    createBatch: function (header, lines, actor) {
      /* An idempotency key, generated here so it survives a retry. If the
         gateway times out we cannot tell whether the flow wrote the rows;
         with this key the flow can refuse a duplicate, and the portal can
         look afterwards to see which documents actually landed. */
      var batchId = header.batchId || uid("DOC");
      return this._post("createTxn", {
        header: {
          batchId: batchId,
          date: header.date != null ? header.date : "",
          challanNo: header.challanNo != null ? header.challanNo : "",
          invoiceNo: header.invoiceNo != null ? header.invoiceNo : "",
          branch: header.branch != null ? header.branch : "",
          zone: header.zone != null ? header.zone : "",
          txnType: header.txnType != null ? header.txnType : "",
          movementCategory: header.movementCategory != null ? header.movementCategory : "",
          partyName: header.partyName != null ? header.partyName : "",
          remarks: header.remarks != null ? header.remarks : ""
        },
        lines: lines.map(function(l) {
          return {
            productId: l.productId != null ? l.productId : "",
            productName: l.productName != null ? l.productName : "",
            category: l.category != null ? l.category : "",
            qty: l.qty != null ? l.qty : 0,
            remarks: l.remarks != null ? l.remarks : ""
          };
        }),
        actor: { 
          username: actor.username != null ? actor.username : "", 
          role: actor.role != null ? actor.role : "" 
        }
      }, { noRetry: true, label: batchId }).then(function (res) {
        var r = res || {};
        var qty = lines.reduce(function (a, l) { return a + (Number(l.qty) || 0); }, 0);
        return {
          batchId: r.batchId || batchId,
          lineCount: r.lineCount != null ? r.lineCount : lines.length,
          totalQty: r.totalQty != null ? r.totalQty : qty,
          lines: r.lines || [],
          raw: res
        };
      }).catch(function (e) {
        /* Attach the key so the caller can check whether it landed. */
        e.batchId = batchId;
        throw e;
      });
    },
    createTxn: function (txn, actor) {
      return this.createBatch({
        date: txn.date, challanNo: txn.challanNo, invoiceNo: txn.invoiceNo,
        branch: txn.branch, zone: txn.zone, txnType: txn.txnType,
        movementCategory: txn.movementCategory,
        partyName: txn.partyName, remarks: txn.remarks
      }, [{ productId: txn.productId, productName: txn.productName,
            category: txn.category, qty: txn.qty }], actor);
    },
    log:       function () { return Promise.resolve(); },
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
    saveProduct: function (p) { return impl.saveProduct(p); },
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
