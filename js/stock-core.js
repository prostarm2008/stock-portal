/* ============================================================
   stocks.js — stock maths and the entry forms

   Stock.* holds the calculations every screen shares.
   StockForm.mount() drives inward.html and outward.html, which
   differ only in direction and the availability check.
   ============================================================ */
(function (w, d) {
  "use strict";

  var CFG = w.APP_CONFIG;

  var Stock = {
    reorderLevel: function (product) {
      return product && product.reorderLevel != null ? Number(product.reorderLevel) : CFG.defaultReorderLevel;
    },

    balanceOf: function (stocks, branch, productId) {
      var r = stocks.find(function (s) { return s.branch === branch && s.productId === productId; });
      return r ? Number(r.currentBalance) || 0 : 0;
    },

    /* Opening / Inward / Outward / Closing for a branch+product set.
       Opening is the closing balance rolled back across every
       transaction inside the window, so it stays correct whatever
       dates the user picks. */
    summary: function (opts) {
      var stocks = opts.stocks, txns = opts.txns, products = opts.products;
      var from = opts.from || "", to = opts.to || "";
      var branchFilter = opts.branch || "", productFilter = opts.product || "";

      var byProduct = {};
      products.forEach(function (p) { byProduct[p.productId] = p; });

      var keyed = {};
      function slot(branch, productId, productName, category) {
        var k = branch + "\u0000" + productId;
        if (!keyed[k]) {
          keyed[k] = {
            branch: branch, productId: productId, productName: productName,
            category: category || (byProduct[productId] ? byProduct[productId].category : ""),
            opening: 0, inward: 0, outward: 0, closing: 0
          };
        }
        return keyed[k];
      }

      stocks.forEach(function (s) {
        if (branchFilter && s.branch !== branchFilter) return;
        if (productFilter && s.productId !== productFilter) return;
        slot(s.branch, s.productId, s.productName, s.category).closing = Number(s.currentBalance) || 0;
      });

      txns.forEach(function (t) {
        if (branchFilter && t.branch !== branchFilter) return;
        if (productFilter && t.productId !== productFilter) return;
        var row = slot(t.branch, t.productId, t.productName, t.category);
        var inWindow = (!from || t.date >= from) && (!to || t.date <= to);
        if (inWindow) {
          if (t.txnType === "IN") row.inward += Number(t.qty) || 0;
          else row.outward += Number(t.qty) || 0;
        }
        /* Anything dated after the window is unwound from closing so
           the grid reflects the period the user asked for. */
        if (to && t.date > to) {
          row.closing -= (t.txnType === "IN" ? 1 : -1) * (Number(t.qty) || 0);
        }
      });

      return Object.keys(keyed).map(function (k) {
        var r = keyed[k];
        r.opening = r.closing - r.inward + r.outward;
        r.reorderLevel = Stock.reorderLevel(byProduct[r.productId]);
        r.isLow = r.closing <= r.reorderLevel;
        return r;
      }).sort(function (a, b) {
        return String(a.branch || "").localeCompare(b.branch) || String(a.productName || "").localeCompare(b.productName);
      });
    },

    lowStock: function (stocks, products) {
      var byId = {};
      products.forEach(function (p) { byId[p.productId] = p; });
      return stocks.filter(function (s) {
        return (Number(s.currentBalance) || 0) <= Stock.reorderLevel(byId[s.productId]);
      }).sort(function (a, b) { return (a.currentBalance || 0) - (b.currentBalance || 0); });
    },

    onDate: function (txns, type, isoDate) {
      return txns.filter(function (t) { return t.txnType === type && t.date === isoDate; })
                 .reduce(function (a, t) { return a + (Number(t.qty) || 0); }, 0);
    },

    /* Last n months as {key:"2026-08", label:"Aug 26"} */
    monthSeries: function (n) {
      var out = [], now = new Date();
      for (var i = n - 1; i >= 0; i--) {
        var dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
        out.push({
          key: dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0"),
          label: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()] +
                 " " + String(dt.getFullYear()).slice(2)
        });
      }
      return out;
    },

    monthlyTotals: function (txns, type, months) {
      var bucket = {};
      months.forEach(function (m) { bucket[m.key] = 0; });
      txns.forEach(function (t) {
        if (t.txnType !== type) return;
        var k = String(t.date).slice(0, 7);
        if (k in bucket) bucket[k] += Number(t.qty) || 0;
      });
      return months.map(function (m) { return bucket[m.key]; });
    },

    groupSum: function (rows, keyFn, valFn) {
      var m = {};
      rows.forEach(function (r) {
        var k = keyFn(r) || "Unassigned";
        m[k] = (m[k] || 0) + (valFn ? valFn(r) : 1);
      });
      return Object.keys(m).map(function (k) { return { label: k, value: m[k] }; })
        .sort(function (a, b) { return b.value - a.value; });
    }
  };

  w.Stock = Stock;
})(window, document);
