/* ============================================================
   config.js — the only file you edit when moving environments.
   ============================================================ */
window.APP_CONFIG = {
  appName: "Prostarm Stock Portal",
  orgName: "Prostarm Info Systems Ltd.",
  version: "1.0.0",
  /* Bumped whenever data/*.js or js/*.js is replaced. Appended to every
     script and stylesheet URL so a browser cannot serve a cached copy of
     an older user or product list. */
  build: "2026.11.07a",

  /* ----------------------------------------------------------
     BACKEND MODE
     "local"        → browser storage. Runs with zero setup on one
                      machine. Cross-tab live updates only.
     "powerautomate"→ calls Power Automate HTTP-triggered flows that
                      read/write SharePoint lists. Multi-user, true
                      shared data.
     ---------------------------------------------------------- */
  backend: "powerautomate",   /* "local" runs from browser storage for a trial on one PC */

  /* Paste the HTTP POST URL of each Power Automate flow here (7 flows, all
     POST). Import them from Prostarm-StockPortal-Solution.zip, turn each on,
     then copy its URL from the trigger.
     These URLs are not secrets on their own: every flow except login refuses
     a request that lacks a valid session token. They are still best kept out
     of public view. */
  flows: {
    login:         "",   /* PSP - Login */
    read:          "",   /* PSP - Read */
    saveProduct:   "",   /* PSP - Save Product */
    deleteProduct: "",   /* PSP - Delete Product */
    saveUser:      "",   /* PSP - Save User */
    createTxn:     "",   /* PSP - Create Transaction */
    saveRecords:   ""    /* PSP - Save Records */
  },

  /* Why the stock moved. Separate lists per direction, because a
     Sales Out cannot be an inward and a Sales Return cannot be an
     outward. Edit here to add or rename one — the entry forms, the
     bulk template, the filters and every report read this list.

     Note: none of these fits an opening-balance load. "Opening Stock In"
     is included for that, since the alternative is branches labelling a
     first count as a Stock Transfer, which it is not. Remove it if you
     would rather they used one of the six. */
  movementCategories: {
    IN:  ["Purchase In", "Demo In", "Sales Return In", "Stock Transfer In", "Opening Stock In"],
    OUT: ["Demo Out", "Sales Out", "Stock Transfer Out",
          "Stock Out for Warranty Support", "Stock Out for Consumption"]
  },

  /* Gap between documents when posting a bulk upload, in milliseconds.
     Power Automate throttles a burst of calls from one client; a small
     pause is far cheaper than a run that half-succeeds. */
  bulkPostGapMs: 400,

  /* Product lines sent in one createTxn call. Higher means fewer calls
     and fewer documents; lower means smaller payloads. 20 keeps a normal
     challan whole in a single document. */
  bulkLinesPerCall: 10,

  /* Dashboard auto-refresh interval, in seconds. */
  refreshSeconds: 60,   /* each refresh is a flow run; 60 keeps a 30-user site well inside Power Automate limits */

  /* How often an open audit page re-reads the shared audit data, in seconds. */
  auditRefreshSeconds: 60,

  /* A product at or below this balance is flagged low stock, unless
     the product master overrides it with its own reorderLevel. */
  defaultReorderLevel: 2,

  /* Block an outward entry that would take the balance below zero.
     Leave true. Setting false only records a warning. */
  blockNegativeStock: true,

  /* Rows per page in grids. */
  pageSize: 25,

  /* Storage namespace. Bump this to reset all local data. */
  storageKey: "prostarm.stock.v1"
};
