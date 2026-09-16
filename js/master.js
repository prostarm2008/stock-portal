/* ============================================================
   master.js — master-category lookup

   Split out of inventory.js so the six pages that only need the
   lookup do not parse the whole Inventory report screen with it.
   ============================================================ */
(function (w) {
  "use strict";

  /* Master-category helpers, exposed so other screens can use them. */
  var Master = {
    /* Products added through Admin > Products carry their own master
       category on the record. That overrides the static map, so a new
       product is classified the moment it is created rather than
       falling into Other until someone edits a file. */
    _overrides: {},
    useProducts: function (products) {
      var o = {};
      (products || []).forEach(function (p) {
        if (p.master) o[p.productId] = { master: p.master, confirmed: p.masterConfirmed !== false };
      });
      this._overrides = o;
      return this;
    },
    _entry: function (productId) {
      if (this._overrides[productId]) return this._overrides[productId];
      var mc = w.MASTER_CATEGORIES;
      return (mc && mc.map ? mc.map[productId] : null) || null;
    },
    of: function (productId) {
      var hit = this._entry(productId);
      return hit ? hit.master : "OTHER";
    },
    isConfirmed: function (productId) {
      var hit = this._entry(productId);
      return hit ? hit.confirmed !== false : false;
    },
    noteFor: function (productId) {
      var hit = this._entry(productId);
      return hit ? (hit.note || "") : "";
    },
    label: function (key) {
      var mc = w.MASTER_CATEGORIES;
      return (mc && mc.labels && mc.labels[key]) || key;
    },
    /* Master category a subcategory rolls into: SMF and LITHIUM both
       sit under Battery. */
    parentOf: function (key) {
      var mc = w.MASTER_CATEGORIES;
      return (mc && mc.parents && mc.parents[key]) || "OTHER";
    },
    parentLabel: function (key) {
      var mc = w.MASTER_CATEGORIES;
      return (mc && mc.parentLabels && mc.parentLabels[key]) || key;
    },
    tree: function () {
      var mc = w.MASTER_CATEGORIES;
      return (mc && mc.tree) || [{ parent: "OTHER", children: ["OTHER"] }];
    },
    /* Every subcategory key, in display order. Screens build their
       filters and card segments from this rather than a hardcoded
       list, so adding a category is a data change, not a code one. */
    keys: function () {
      var out = [];
      this.tree().forEach(function (n) { out = out.concat(n.children); });
      return out;
    },
    colour: function (key) {
      var mc = w.MASTER_CATEGORIES;
      return (mc && mc.colours && mc.colours[key]) || "#7A8898";
    },
    /* <option> list for any category filter. */
    optionsHtml: function (allLabel) {
      var self = this;
      var html = '<option value="">' + (allLabel || "All categories") + "</option>";
      this.tree().forEach(function (n) {
        if (n.children.length === 1) {
          html += '<option value="' + n.children[0] + '">' +
            self.parentLabel(n.parent) + "</option>";
        } else {
          html += '<optgroup label="' + self.parentLabel(n.parent) + '">' +
            n.children.map(function (c) {
              return '<option value="' + c + '">' + self.label(c) + "</option>";
            }).join("") + "</optgroup>";
        }
      });
      return html;
    },
    /* A unit whose product name says faulty or broken is physically in
       the branch but is not sellable stock. Counted, and shown apart. */
    isFaulty: function (name) {
      return /faulty|broken/i.test(String(name || ""));
    }
  };
  w.Master = Master;
})(window);
