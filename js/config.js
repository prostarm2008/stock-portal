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
  build: "2026.10.03a",

  /* ----------------------------------------------------------
     BACKEND MODE
     "local"        → browser storage. Runs with zero setup on one
                      machine. Cross-tab live updates only.
     "powerautomate"→ calls Power Automate HTTP-triggered flows that
                      read/write SharePoint lists. Multi-user, true
                      shared data. See docs/POWER-AUTOMATE-SETUP.md.
     ---------------------------------------------------------- */
  backend: "powerautomate",

  /* Paste the HTTP POST URLs from each Power Automate flow here.
     Only used when backend === "powerautomate". */
  flows: {
    login:      	"https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/31/workflows/0160b3e1366546e9a69b79e46f4cf8aa/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=lWUdyXqHv1H8NfMPGJguB--GTqc8DBzBtN9-3812cCc",
	listUsers:      "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/29/workflows/75f7ef6d7396417593d2008d33655fee/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=O9eYsj4nJv9mMfpiwcl_K_1nB3fK-tFSRQtqAWRFabI",
    saveUser:       "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/10/workflows/3aab831bc2c14b4b87f97581ce018449/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=mK86MKdmBzcmYvezFrRo9kYlJkIt0kUrOjYGDsMNxgk",
    listProducts:   "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/02/workflows/6516548238294d4a8564db3009fa21d7/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=r0d5JXEfATi9nsl4Kosrtx_BSXmS13TzYm30KKBKsqM",
    saveProduct:    "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/06/workflows/7c0dd9cb57ee46b69cc93d99b7f171b0/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=NlJcfJgD3tvGZtcT6oznEAXPn7798ZI2hb6n1R9_zpU",
    listStock:      "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/01/workflows/0f0efb050e044628859dccc6dd753361/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=5imfUKszIBx9Zldugds5wH5SpuP2-nH4lPcILUTb0sw",
    listTxns:       "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/24/workflows/e44481884bfd457cb574af550e67db99/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pk6YpDmatgz2m9upDHCLKWkKmx7_a2YBGhBd-8eJx_8",
    createTxn:      "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/12/workflows/b1919ee84ea249aa946e550242afa6c6/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=BVTJev-E0UpFEkO-MC0uhj6hbJ1xtE0oL0yKji9ACnM",
    listAudit:      "https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/20/workflows/ad0e7a889d484b2c8df509812f80bd01/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=7ZJYTnUnQjjodxrrhrVoF5QrwgUT1iYxGra7_VPqj9U"
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
  bulkLinesPerCall: 20,

  /* Dashboard auto-refresh interval, in seconds. */
  refreshSeconds: 15,

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
