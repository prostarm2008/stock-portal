/* ============================================================
   admin.js — Users and Audit trail (HO Admin only)
   ============================================================ */
(function (w, d) {
  "use strict";

  /* ---------------- USERS ---------------- */
  w.Users = {
    mount: function () {
      var user = w.Auth.require("users");
      if (!user) return;

      var UI = w.UI;
      var content = UI.shell(user, "users", "User management");
      var state = { users: [], branches: [], grid: null };

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1>Users</h1>' +
        "<p>Roles decide what each person can see and do. Changes apply the next time they sign in.</p></div>" +
        '<div class="btn-row no-print">' +
          '<button class="btn btn-primary btn-sm" id="addBtn">Add user</button>' +
          '<button class="btn btn-ghost btn-sm" id="expBtn">Export users</button>' +
          '<button class="btn btn-ghost btn-sm" id="backupBtn">Back up all data</button>' +
          '<button class="btn btn-ghost btn-sm" id="syncBtn">Resync from data files</button>' +
          '<button class="btn btn-ghost btn-sm" id="resetBtn">Reset demo data</button>' +
        "</div></div>" +
        '<div class="alert warn no-print"><div><b>Before this goes to branches</b>' +
        "Every account in the source file shares one password. Ask each user to change it, or push a reset from HO. " +
        "Accounts marked <b>default applied</b> had no password in the file at all and were given " +
        "<span class=\"mono\">ProstarM@1234</span> so the person can sign in \u2014 set a real one before go-live. " +
        "Regional Manager logins were created from the ManagerCode column, since the source file had no rows of their own.</div></div>" +
        '<div id="syncNote"></div>' +
        '<div class="grid g-5" id="userKpis"></div>' +
        '<div class="card mt"><div class="card-head"><h3>All accounts</h3>' +
        '<span class="sub" id="uSub"></span></div><div id="uGrid"></div></div>';

      function load() {
        return Promise.all([w.API.getUsers(), w.API.getBranches()]).then(function (r) {
          state.users = r[0]; state.branches = r[1];
          paint();
        });
      }

      function paintSyncNote() {
        var host = d.getElementById("syncNote");
        if (!host) return;
        var log = w.API.seedSyncLog();
        if (!log.length) { if (host) host.innerHTML = ""; return; }
        var added = [], updated = [], tables = {};
        log.forEach(function (e) {
          tables[e.table] = true;
          added = added.concat(e.added);
          updated = updated.concat(e.updated);
        });
        if (host) host.innerHTML =
          '<div class="alert info no-print"><div style="flex:1"><b>Picked up from the data files</b>' +
          (added.length ? "Added " + added.length + ": " +
            '<span class="strong">' + added.slice(0, 10).map(UI.esc).join(", ") + "</span>" +
            (added.length > 10 ? " and " + (added.length - 10) + " more" : "") + ". " : "") +
          (updated.length ? "Refreshed " + updated.length + " record" +
            (updated.length === 1 ? "" : "s") + " in " + Object.keys(tables).join(", ") + ". " : "") +
          "This runs whenever a <span class=\"mono\">data/*.js</span> file is replaced. " +
          "Records you have edited in the portal are never overwritten.</div>" +
          '<button class="btn btn-ghost btn-sm" id="dismissSync">Dismiss</button></div>';
        var btn = d.getElementById("dismissSync");
        if (btn) btn.onclick = function () { w.API.clearSeedSyncLog(); if (host) host.innerHTML = ""; };
      }

      function paint() {
        var userKpis = d.getElementById("userKpis");
        if (!userKpis) return;
        paintSyncNote();
        var byRole = {};
        state.users.forEach(function (u) { byRole[u.role] = (byRole[u.role] || 0) + 1; });
        var userKpis = d.getElementById("userKpis"); if (userKpis) userKpis.innerHTML =
          kpi("Total accounts", state.users.length, "") +
          kpi("Branch logistic", byRole.BRANCH_USER || 0, "") +
          kpi("Regional managers", byRole.REGIONAL_MANAGER || 0, "") +
          kpi("Stock auditors", byRole.STOCK_AUDITOR || 0, "") +
          kpi("HO admins", byRole.HO_ADMIN || 0, "ok");

        d.getElementById("uSub").textContent = state.users.length + " accounts";

        state.grid = UI.grid(d.getElementById("uGrid"), {
          rows: state.users, sortKey: "fullName", sortDir: "asc",
          searchPlaceholder: "Search name, code, branch or zone\u2026",
          emptyTitle: "No users", emptyText: "",
          columns: [
            { key: "fullName", label: "Name", render: function (r) {
                return "<b>" + UI.esc(r.fullName) + "</b><br><span class=\"muted small mono\">" + UI.esc(r.username) + "</span>"; } },
            { key: "empCode", label: "Emp code", render: function (r) { return '<span class="mono">' + UI.esc(r.empCode) + "</span>"; } },
            { key: "role", label: "Role", render: function (r) {
                var cls = r.role === "HO_ADMIN" ? "info"
                  : r.role === "STOCK_AUDITOR" ? "out"
                  : r.role === "REGIONAL_MANAGER" ? "warn" : "neutral";
                return '<span class="badge ' + cls + '">' + UI.esc(w.RBAC.roles[r.role].label) + "</span>"; } },
            { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch || "\u2014"); } },
            { key: "zone", label: "Zone", render: function (r) { return UI.esc(r.zone); } },
            { key: "passwordSource", label: "Password", render: function (r) {
                return r.passwordSource === "default-applied"
                  ? '<span class="badge warn" title="The user file had no password for this account. ProstarM@1234 was applied so they can sign in.">default applied</span>'
                  : '<span class="badge neutral">from file</span>'; } },
            { key: "source", label: "Origin", render: function (r) {
                return r.source === "derived"
                  ? '<span class="badge warn" title="Created from the ManagerCode column">derived</span>'
                  : '<span class="badge neutral">from Excel</span>'; } },
            { key: "active", label: "Status", sortable: false, render: function (r) {
                return '<span class="badge ' + (r.active === false ? "out" : "in") + '">' +
                  (r.active === false ? "Off" : "Active") + "</span>"; } },
            { key: "id", label: "", sortable: false, render: function (r) {
                return '<button class="btn btn-ghost btn-sm no-print" data-edit="' + UI.esc(r.id) + '">Edit</button>'; } }
          ],
          afterRender: function (root) {
            root.querySelectorAll("[data-edit]").forEach(function (b) {
              b.onclick = function () { edit(state.users.find(function (u) { return u.id === b.getAttribute("data-edit"); })); };
            });
          }
        });
      }

      function kpi(l, v, k) {
        return '<div class="kpi ' + k + '"><div class="lbl">' + l + '</div><div class="val">' + UI.num(v) + "</div></div>";
      }

      /* Reads whichever scope control applies to the selected type. */
      function readScope(root) {
        var t = root.querySelector("#mScopeType").value;
        if (t === "ALL") return ["ALL"];
        return Array.prototype.slice.call(root.querySelector("#mScope").selectedOptions)
          .map(function (o) { return o.value; });
      }

      function edit(u) {
        var isNew = !u;
        u = u || { id: "", empCode: "", username: "", email: "", fullName: "", role: "BRANCH_USER", branch: "", zone: "", active: true, source: "manual" };
        var zones = {};
        state.branches.forEach(function (b) { zones[b.zone] = true; });

        var m = UI.modal({
          title: isNew ? "Add user" : "Edit " + u.fullName,
          okText: "Save user",
          body:
            '<div class="field"><label>Full name <span class="req">*</span></label><input class="input" id="mName" value="' + UI.esc(u.fullName) + '"></div>' +
            '<div class="grid g-2" style="gap:0 14px">' +
              '<div class="field"><label>Employee code <span class="req">*</span></label><input class="input" id="mCode" value="' + UI.esc(u.empCode) + '"></div>' +
              '<div class="field"><label>Username <span class="req">*</span></label><input class="input" id="mUser" value="' + UI.esc(u.username) + '"></div>' +
            "</div>" +
            '<div class="field"><label>Email</label><input class="input" type="email" id="mMail" value="' + UI.esc(u.email) + '"></div>' +
            '<div class="grid g-2" style="gap:0 14px">' +
              '<div class="field"><label>Role <span class="req">*</span></label><select class="input" id="mRole">' +
                Object.keys(w.RBAC.roles).map(function (k) {
                  return '<option value="' + k + '"' + (u.role === k ? " selected" : "") + ">" + w.RBAC.roles[k].label + "</option>";
                }).join("") + "</select></div>" +
              '<div class="field"><label>Branch</label><select class="input" id="mBranch"><option value="">\u2014 none \u2014</option>' +
                state.branches.map(function (b) {
                  return '<option value="' + UI.esc(b.branchCode) + '"' + (u.branch === b.branchCode ? " selected" : "") + ">" + UI.esc(b.branchCode) + "</option>";
                }).join("") + "</select></div>" +
            "</div>" +
            '<div class="field" id="scopeWrap"><label>Audit scope</label>' +
              '<select class="input" id="mScopeType">' +
                '<option value="ZONE">Zones</option><option value="BRANCH">Named branches</option>' +
                '<option value="ALL">All India</option></select>' +
              '<select class="input" id="mScope" multiple size="6" style="margin-top:8px">' +
                Object.keys(zones).sort().map(function (z) {
                  return '<option value="' + UI.esc(z) + '"' +
                    ((u.auditScope || []).indexOf(z) >= 0 ? " selected" : "") + ">" + UI.esc(z) + "</option>";
                }).join("") + "</select>" +
              '<div class="hint">Only used by a Stock Auditor. Their own branch is always excluded \u2014 ' +
              "an auditor cannot audit their own stock.</div></div>" +
            '<div class="field"><label>Zone</label><select class="input" id="mZone"><option value="">\u2014 none \u2014</option>' +
              Object.keys(zones).sort().map(function (z) {
                return '<option value="' + UI.esc(z) + '"' + (u.zone === z ? " selected" : "") + ">" + UI.esc(z) + "</option>";
              }).join("") + "</select>" +
              '<div class="hint">A Regional Manager sees every branch in this zone.</div></div>' +
            '<div class="field"><label>New password</label><input class="input" type="password" id="mPass" placeholder="' +
              (isNew ? "Required for a new account" : "Leave blank to keep the current one") + '">' +
              '<div class="hint">Stored as a SHA-256 hash, never as plain text.</div></div>' +
            '<div class="field"><label><input type="checkbox" id="mActive"' + (u.active === false ? "" : " checked") +
              '> Account is active</label></div>',
          onOk: function (root) {
            var name = root.querySelector("#mName").value.trim();
            var pickedRole = root.querySelector("#mRole").value;
            if (pickedRole === "STOCK_AUDITOR" && !readScope(root).length) {
              UI.toast("Audit scope required", "A Stock Auditor with no scope cannot see any branch.", "warn");
              return false;
            }
            var code = root.querySelector("#mCode").value.trim();
            var uname = root.querySelector("#mUser").value.trim().toLowerCase();
            var pass = root.querySelector("#mPass").value;
            if (!name || !code || !uname) { UI.toast("Missing details", "Name, employee code and username are all required.", "warn"); return false; }
            var clash = state.users.find(function (x) { return String(x.username || "").toLowerCase() === uname && x.id !== u.id; });
            if (clash) { UI.toast("Username taken", uname + " already belongs to " + clash.fullName + ".", "warn"); return false; }
            if (isNew && !pass) { UI.toast("Password needed", "Set a password for the new account.", "warn"); return false; }

            var zone = root.querySelector("#mZone").value;
            var rec = {
              id: u.id || w.API.uid("U"), empCode: code, username: uname,
              email: root.querySelector("#mMail").value.trim(), fullName: name,
              role: root.querySelector("#mRole").value,
              branch: root.querySelector("#mBranch").value,
              zone: zone, zones: zone ? [zone] : [],
              auditScope: readScope(root),
              auditScopeType: root.querySelector("#mScopeType").value,
              active: root.querySelector("#mActive").checked,
              source: u.source || "manual",
              passwordSource: pass ? "set-by-admin" : (u.passwordSource || "manual"),
              managerCode: u.managerCode || "", managerName: u.managerName || ""
            };
            if (pass) rec.passwordHash = w.Auth.hash(pass);
            else rec.passwordHash = u.passwordHash;

            w.API.saveUser(rec).then(function () {
              w.API.log(isNew ? "USER_CREATED" : "USER_UPDATED", { entity: "users/" + rec.id }, user);
              UI.toast(isNew ? "User added" : "User updated", rec.fullName + " \u00b7 " + w.RBAC.roles[rec.role].label, "ok");
              load();
            }).catch(function (e) { UI.toast("Not saved", e.message, "bad"); });
          }
        });

        var roleEl = m.root.querySelector("#mRole");
        var scopeWrap = m.root.querySelector("#scopeWrap");
        var scopeType = m.root.querySelector("#mScopeType");
        var scopeSel = m.root.querySelector("#mScope");

        function fillScope() {
          var t = scopeType.value;
          scopeSel.classList.toggle("hidden", t === "ALL");
          if (t === "ALL") return;
          var opts = t === "ZONE"
            ? Object.keys(zones).sort()
            : state.branches.map(function (b) { return b.branchCode; });
          var chosen = u.auditScope || [];
          if (scopeSel) scopeSel.innerHTML = opts.map(function (o) {
            return '<option value="' + UI.esc(o) + '"' + (chosen.indexOf(o) >= 0 ? " selected" : "") +
              ">" + UI.esc(o) + "</option>";
          }).join("");
        }
        function syncRole() {
          scopeWrap.classList.toggle("hidden", roleEl.value !== "STOCK_AUDITOR");
        }
        roleEl.addEventListener("change", syncRole);
        scopeType.addEventListener("change", fillScope);
        scopeType.value = u.auditScopeType || "ZONE";
        fillScope();
        syncRole();
      }

      d.getElementById("addBtn").onclick = function () { edit(null); };
      d.getElementById("expBtn").onclick = function () {
        UI.exportExcel("Users-" + w.API.today(), "Users",
          ["Emp code", "Username", "Full name", "Email", "Role", "Branch", "Zone", "Status", "Origin"],
          state.users.map(function (u) {
            return [u.empCode, u.username, u.fullName, u.email, w.RBAC.roles[u.role].label,
                    u.branch, u.zone, u.active === false ? "Off" : "Active", u.source];
          }));
      };
      d.getElementById("backupBtn").onclick = function () {
        w.API.exportAll().then(function (all) {
          UI.download("prostarm-stock-backup-" + w.API.today() + ".json",
            new Blob([JSON.stringify(all, null, 1)], { type: "application/json" }));
          UI.toast("Backup downloaded", "Keep this file safe. Admin can restore from it.", "ok");
        });
      };
      d.getElementById("syncBtn").onclick = function () {
        UI.modal({
          title: "Resync users, branches and products?",
          okText: "Resync now",
          body:
            "<p>Reloads every record from <span class=\"mono\">data/users.js</span>, " +
            "<span class=\"mono\">data/branches.js</span> and <span class=\"mono\">data/products.js</span>.</p>" +
            '<div class="alert warn"><div><b>This one does overwrite your edits</b>' +
            "Passwords, roles and audit scopes you have set in the portal are replaced by whatever " +
            "the files say. Stock, transactions and audit cases are not touched.</div></div>" +
            "<p class=\"muted small\">Normally you do not need this \u2014 new and changed records are " +
            "picked up automatically each time the portal loads.</p>",
          onOk: function () {
            w.API.resync().then(function () {
              UI.toast("Resynced", "Records reloaded from the data files.", "ok");
              setTimeout(function () { location.reload(); }, 700);
            }).catch(function (e) { UI.toast("Not resynced", e.message, "bad"); });
          }
        });
      };

      d.getElementById("resetBtn").onclick = function () {
        UI.modal({
          title: "Reset all data?", okText: "Reset everything", danger: true,
          body: "<p>This clears every transaction, balance and audit entry on this computer and restores the users and products " +
                "from the original Excel files.</p><p><b>Back up first if you want to keep the entries.</b></p>",
          onOk: function () {
            w.API.reset().then(function () {
              UI.toast("Data reset", "The portal is back to its starting state.", "ok");
              setTimeout(function () { location.reload(); }, 700);
            }).catch(function (e) { UI.toast("Not reset", e.message, "bad"); });
          }
        });
      };

      load();
    }
  };

  /* ---------------- AUDIT TRAIL ----------------
     Named AuditTrail, not Audit: window.Audit is the Stock Auditor
     data layer in auditapi.js, and both load on this page. */
  w.AuditTrail = {
    mount: function () {
      var user = w.Auth.require("audit");
      if (!user) return;

      var UI = w.UI;
      var content = UI.shell(user, "audit", "Audit trail");
      var state = { rows: [], grid: null };

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1>Audit trail</h1>' +
        "<p>Every balance change, with who made it and what the balance was before and after.</p></div>" +
        '<div class="btn-row no-print">' +
          '<button class="btn btn-ghost btn-sm" id="aXl">Excel</button>' +
          '<button class="btn btn-ghost btn-sm" id="aCsv">CSV</button>' +
        "</div></div>" +
        '<div class="card"><div class="card-head"><h3>Recorded actions</h3>' +
        '<span class="sub" id="aSub"></span></div><div id="aGrid"></div></div>';

      /* Column order matches the grid on screen. */
      var HEAD = ["Timestamp", "Action", "User", "Role", "Document", "Branch", "Product", "Qty", "Old stock", "New stock"];
      function flat(r) {
        return [UI.fmtDateTime(r.timestamp), r.action, r.userName || r.user, r.role, r.document || "",
                r.branch, r.productName, r.qty, r.oldStock, r.newStock];
      }

      function load() {
        return w.API.getAudit().then(function (rows) {
          state.rows = rows.slice().sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); });
          d.getElementById("aSub").textContent = state.rows.length + " entries";
          state.grid = UI.grid(d.getElementById("aGrid"), {
            rows: state.rows, pageSize: 30,
            searchPlaceholder: "Search user, branch, product or action\u2026",
            emptyTitle: "Nothing recorded yet",
            emptyText: "Sign-ins and stock movements are written here automatically.",
            columns: [
              { key: "timestamp", label: "When", render: function (r) { return UI.fmtDateTime(r.timestamp); } },
              { key: "action", label: "Action", render: function (r) {
                  var cls = r.action === "STOCK_INWARD" ? "in" : r.action === "STOCK_OUTWARD" ? "out" : "neutral";
                  return '<span class="badge ' + cls + '">' + UI.esc(r.action.replace(/_/g, " ").toLowerCase()) + "</span>"; } },
              { key: "userName", label: "User", render: function (r) {
                  return UI.esc(r.userName || r.user) + '<br><span class="muted small">' + UI.esc(r.role || "") + "</span>"; } },
              { key: "document", label: "Document", render: function (r) {
                  return r.document ? '<span class="mono">' + UI.esc(r.document) + "</span>" : "\u2014"; } },
              { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch || "\u2014"); } },
              { key: "productName", label: "Product", render: function (r) { return UI.esc(r.productName || "\u2014"); } },
              { key: "qty", label: "Qty", type: "num", render: function (r) { return r.qty ? UI.num(r.qty) : "\u2014"; } },
              { key: "oldStock", label: "Old", type: "num", render: function (r) { return r.oldStock === "" ? "\u2014" : UI.num(r.oldStock); } },
              { key: "newStock", label: "New", type: "num", render: function (r) {
                  return r.newStock === "" ? "\u2014" : "<b>" + UI.num(r.newStock) + "</b>"; } }
            ]
          });
        });
      }

      d.getElementById("aXl").onclick = function () {
        UI.exportExcel("Audit-Trail-" + w.API.today(), "Audit", HEAD, (state.grid ? state.grid.visibleRows() : state.rows).map(flat));
      };
      d.getElementById("aCsv").onclick = function () {
        UI.exportCSV("Audit-Trail-" + w.API.today(), HEAD, (state.grid ? state.grid.visibleRows() : state.rows).map(flat));
      };

      load();
      w.API.onChange(UI.debounce(load, 300));
    }
  };
})(window, document);
