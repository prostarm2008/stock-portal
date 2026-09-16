/* ============================================================
   auth.js — sign-in, session, and the role rules

   READ THIS BEFORE GOING LIVE
   In "local" mode every check below runs in the browser, so it
   controls what a user sees, not what a determined user can
   reach. Anyone who opens DevTools can edit their own session.
   That is fine for a single-machine rollout or a pilot. Before
   real branch data goes in, switch APP_CONFIG.backend to
   "powerautomate" and mirror every rule in this file inside the
   flows — the server copy is the one that counts.
   ============================================================ */
(function (w) {
  "use strict";

  var SESSION_KEY = w.APP_CONFIG.storageKey + ".session";
  var IDLE_MINUTES = 120;

  /* ------------------------------------------------------------
     SHA-256, written out in full rather than using crypto.subtle,
     which browsers disable on file:// pages. Hashing here stops
     passwords sitting in storage as plain text; it is not a
     substitute for server-side authentication.
     ------------------------------------------------------------ */
  var K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];

  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var utf8 = unescape(encodeURIComponent(ascii));
    var words = [], len = utf8.length, i;
    for (i = 0; i < len; i++) words[i >> 2] |= utf8.charCodeAt(i) << ((3 - i % 4) * 8);
    words[len >> 2] |= 0x80 << ((3 - len % 4) * 8);
    words[((len + 8 >> 6) + 1) * 16 - 1] = len * 8;

    var wArr = new Array(64), a, b, c, d, e, f, g, h, t1, t2, j;
    for (j = 0; j < words.length; j += 16) {
      a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
      for (i = 0; i < 64; i++) {
        if (i < 16) { wArr[i] = words[j + i] | 0; }
        else {
          var s0 = rr(wArr[i - 15], 7) ^ rr(wArr[i - 15], 18) ^ (wArr[i - 15] >>> 3);
          var s1 = rr(wArr[i - 2], 17) ^ rr(wArr[i - 2], 19) ^ (wArr[i - 2] >>> 10);
          wArr[i] = (wArr[i - 16] + s0 + wArr[i - 7] + s1) | 0;
        }
        t1 = (h + (rr(e,6)^rr(e,11)^rr(e,25)) + ((e & f) ^ (~e & g)) + K[i] + wArr[i]) | 0;
        t2 = ((rr(a,2)^rr(a,13)^rr(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    return H.map(function (n) { return ("00000000" + (n >>> 0).toString(16)).slice(-8); }).join("");
  }

  /* ------------------------------------------------------------
     ROLE RULES
     ------------------------------------------------------------ */
  var ROLES = {
    BRANCH_USER: {
      label: "Branch Logistic",
      pages: ["dashboard", "inward", "outward", "stock-summary", "inventory-summary", "reports", "audit-case"],
      /* Inward may be dated back — stock physically arrived when it
         arrived, and paperwork lags. Outward may not: a back-dated issue
         rewrites a balance that reports and audits have already been run
         against. HO Admin and Stock Auditor can, for corrections. */
      canWrite: true, canBackdateOutward: false, canManageUsers: false, canSeeAllBranches: false, canSeeAudit: false
    },
    REGIONAL_MANAGER: {
      label: "Regional Manager",
      pages: ["dashboard", "stock-summary", "inventory-summary", "reports", "audit-case", "audit-dashboard"],
      canWrite: false, canManageUsers: false, canSeeAllBranches: false, canSeeAudit: false
    },
    STOCK_AUDITOR: {
      label: "Stock Auditor",
      pages: ["audit-workspace", "audit-cycle", "audit-case", "audit-dashboard",
              "stock-summary", "inventory-summary", "reports"],
      /* canWrite stays false and must stay false: the auditor writes to
         the audit collections through Audit.*, never through the stock
         path. FR-03 is enforced by structure, not by discipline. */
      canWrite: false, canAudit: true, canBackdateOutward: true, canManageUsers: false,
      canSeeAllBranches: false, canSeeAudit: true
    },
    HO_ADMIN: {
      label: "HO Admin",
      pages: ["dashboard", "inward", "outward", "stock-summary", "inventory-summary", "reports",
              "audit-workspace", "audit-cycle", "audit-case", "adjustments", "audit-dashboard",
              "products", "users", "audit"],
      canWrite: true, canAudit: true, canBackdateOutward: true, canManageUsers: true,
      canManageProducts: true, canSeeAllBranches: true, canSeeAudit: true
    }
  };

  w.RBAC = {
    roles: ROLES,
    def: function (user) { return ROLES[user && user.role] || ROLES.BRANCH_USER; },
    can: function (user, capability) { return !!this.def(user)[capability]; },
    canOpen: function (user, page) { return this.def(user).pages.indexOf(page) >= 0; },

    /* Branch User: own branch. Regional Manager: every branch in the
       zones they carry. HO Admin: everything. */
    visibleBranches: function (user, branches) {
      if (!user) return [];
      if (user.role === "HO_ADMIN") {
        return branches.map(function (b) { return b.branchCode; });
      }
      if (user.role === "STOCK_AUDITOR") {
        var scope = user.auditScope || [];
        var list;
        if (scope.indexOf("ALL") >= 0) {
          list = branches.map(function (b) { return b.branchCode; });
        } else if (user.auditScopeType === "ZONE") {
          list = branches.filter(function (b) { return scope.indexOf(b.zone) >= 0; })
                         .map(function (b) { return b.branchCode; });
        } else {
          list = branches.filter(function (b) { return scope.indexOf(b.branchCode) >= 0; })
                         .map(function (b) { return b.branchCode; });
        }
        /* Segregation of duties: never their own branch. */
        return list.filter(function (b) { return b !== user.branch; });
      }
      if (user.role === "REGIONAL_MANAGER") {
        var zones = user.zones && user.zones.length ? user.zones : [user.zone];
        return branches.filter(function (b) { return zones.indexOf(b.zone) >= 0; })
                       .map(function (b) { return b.branchCode; });
      }
      return user.branch ? [user.branch] : [];
    },

    /* The gate on every write. A Branch User writes to their own
       branch and nowhere else. */
    canWriteBranch: function (user, branchCode) {
      if (!user || !this.can(user, "canWrite")) return false;
      if (user.role === "HO_ADMIN") return true;
      return user.branch === branchCode;
    },

    /* Where a role lands after sign-in, and where require() sends
       someone who reaches a page their role cannot open. Hardcoding
       dashboard.html loops forever for a role that has no dashboard. */
    homePage: function (user) {
      var pages = this.def(user).pages;
      if (pages.indexOf("dashboard") >= 0) return "dashboard.html";
      if (pages.indexOf("audit-workspace") >= 0) return "audit-workspace.html";
      return (pages[0] || "login") + ".html";
    },

    scopeLabel: function (user) {
      if (!user) return "";
      if (user.role === "HO_ADMIN") return "All India";
      if (user.role === "STOCK_AUDITOR") {
        var sc = user.auditScope || [];
        if (sc.indexOf("ALL") >= 0) return "Audit scope: all India";
        return "Audit scope: " + sc.join(", ");
      }
      if (user.role === "REGIONAL_MANAGER") {
        return (user.zones && user.zones.length ? user.zones : [user.zone]).join(", ") + " zone";
      }
      return user.branch;
    }
  };

  /* ------------------------------------------------------------
     SESSION
     ------------------------------------------------------------ */
  w.Auth = {
    hash: sha256,

    signIn: function (username, password) {
      var u = String(username || "").trim().toLowerCase();
      var p = String(password || "");
      if (!u || !p) return Promise.reject(new Error("Enter both your username and password."));
      var hash = sha256(p);

      if (w.API.mode === "powerautomate" && w.APP_CONFIG.flows.login) {
        return w.API.login(u, p, hash).then(function (res) {
          var session = {
            id: res.empCode || res.username || u,
            username: u,
            empCode: res.empCode,
            fullName: res.fullName,
            email: res.email || "",
            role: res.role,
            branch: res.branch,
            zone: res.zone || "",
            zones: res.zones || (res.zone ? [res.zone] : []),
            auditScope: res.auditScope || [],
            auditScopeType: res.auditScopeType || "BRANCH",
            managerCode: res.managerCode || "",
            managerName: res.managerName || "",
            signedInAt: Date.now(), lastSeen: Date.now()
          };
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
          w.API.log("SIGN_IN", { entity: "users/" + session.id }, session);
          return session;
        });
      }

      return w.API.getUsers().then(function (users) {
        var found = users.find(function (x) {
          return String(x.username || "").toLowerCase() === u || String(x.empCode || "").toLowerCase() === u;
        });
        if (!found) {
          /* Naming the count turns "it does not work" into something the
             person can act on: if the number is short, they are on an
             older copy of the data file. */
          throw new Error(
            "No account matches that username or employee code. " +
            users.length + " accounts are loaded on this computer. " +
            "If the account was added recently, this browser may be holding an older copy of " +
            "the data file \u2014 press Ctrl+Shift+R to force a refresh.");
        }
        if (found.active === false) throw new Error("That account is switched off. Ask HO to reactivate it.");
        if (found.passwordHash !== hash) throw new Error("That password does not match. Check caps lock and try again.");

        var session = {
          id: found.id, username: found.username, empCode: found.empCode,
          fullName: found.fullName, email: found.email, role: found.role,
          branch: found.branch, zone: found.zone, zones: found.zones || [found.zone],
          auditScope: found.auditScope || [], auditScopeType: found.auditScopeType || "BRANCH",
          managerCode: found.managerCode, managerName: found.managerName,
          signedInAt: Date.now(), lastSeen: Date.now()
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        w.API.log("SIGN_IN", { entity: "users/" + found.id }, session);
        return session;
      });
    },

    current: function () {
      try {
        var s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
        if (!s) return null;
        if (Date.now() - s.lastSeen > IDLE_MINUTES * 60000) { this.signOut(true); return null; }
        s.lastSeen = Date.now();
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
        return s;
      } catch (e) { return null; }
    },

    signOut: function (silent) {
      var s = null;
      try { s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch (e) {}
      if (s && !silent) w.API.log("SIGN_OUT", { entity: "users/" + s.id }, s);
      sessionStorage.removeItem(SESSION_KEY);
      if (!silent) location.href = "login.html";
    },

    /* Call at the top of every protected page. */
    require: function (page) {
      var here = location.pathname.split("/").pop() || "index.html";
      var u = this.current();
      if (!u) { location.replace("login.html?next=" + encodeURIComponent(here)); return null; }
      if (page && !w.RBAC.canOpen(u, page)) {
        var home = w.RBAC.homePage(u);
        /* Never bounce a user to a page they also cannot open. */
        if (here === home) return u;
        location.replace(home + "?denied=" + encodeURIComponent(page));
        return null;
      }
      return u;
    }
  };
})(window);
