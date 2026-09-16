/* Master category map — which products roll up into which category
   on the Inventory report, the dashboard and the audit screens.

   SET BY HO, August 2026. Every one of the 111 products was classified
   by name against the list supplied by DGM Operations, so nothing here
   is a guess and nothing is flagged for review.

   Structure:
     UPS                       → UPS                        23 products
     Battery                   → SMF Batteries              17
                               → Lithium Batteries          19
     Isolation Transformer     → Isolation Transformer       8
     Servo Stabilizer          → Servo Stabilizer            6
     Other equipment & spares  → Other equipment & spares   38

   To add a category: add it to labels, parents, parentLabels, colours
   and tree below. Every screen reads this file — the dashboard cards,
   the inventory filters and the audit cycle scope all build their lists
   from `tree`, so no code changes are needed.

   To reclassify a product: change its "master" value to one of
   UPS | SMF | LITHIUM | ISOTX | SERVO | OTHER. */

window.MASTER_CATEGORIES = {
  labels: {"UPS": "UPS", "SMF": "SMF Batteries", "LITHIUM": "Lithium Batteries", "ISOTX": "Isolation Transformer", "SERVO": "Servo Stabilizer", "OTHER": "Other equipment & spares"},
  parents: {"UPS": "UPS", "SMF": "BATTERY", "LITHIUM": "BATTERY", "ISOTX": "ISOTX", "SERVO": "SERVO", "OTHER": "OTHER"},
  parentLabels: {"UPS": "UPS", "BATTERY": "Battery", "ISOTX": "Isolation Transformer", "SERVO": "Servo Stabilizer", "OTHER": "Other equipment & spares"},
  /* Used by the dashboard cards and the category charts. */
  colours: {"UPS": "#1E5FA8", "SMF": "#00B3A4", "LITHIUM": "#2F80D2", "ISOTX": "#B26A00", "SERVO": "#6B4FA8", "OTHER": "#5D7C93"},
  /* Display order for master categories and their subcategories. */
  tree: [{"parent": "UPS", "children": ["UPS"]}, {"parent": "BATTERY", "children": ["SMF", "LITHIUM"]}, {"parent": "ISOTX", "children": ["ISOTX"]}, {"parent": "SERVO", "children": ["SERVO"]}, {"parent": "OTHER", "children": ["OTHER"]}],
  map: {
    "P001": { master: "SMF", confirmed: true }  /* Battery 100AH -Exide */,
    "P002": { master: "SMF", confirmed: true }  /* Battery 100AH -Quanta */,
    "P003": { master: "SMF", confirmed: true }  /* Battery 120AH Exide */,
    "P004": { master: "SMF", confirmed: true }  /* Battery 120AH Exide W */,
    "P005": { master: "SMF", confirmed: true }  /* Battery 150AH Exide */,
    "P006": { master: "SMF", confirmed: true }  /* Battery 12V 120AH Coslight */,
    "P007": { master: "SMF", confirmed: true }  /* Battery 12V 65AH Coslight */,
    "P008": { master: "SMF", confirmed: true }  /* Battery 150AH Quanta-Faulty */,
    "P009": { master: "SMF", confirmed: true }  /* Battery 26AH Quanta */,
    "P010": { master: "SMF", confirmed: true }  /* Battery 42AH Exide */,
    "P011": { master: "SMF", confirmed: true }  /* Battery 42AH-Quanta */,
    "P012": { master: "SMF", confirmed: true }  /* Battery 65 AH Quanta */,
    "P013": { master: "SMF", confirmed: true }  /* Battery 150 AH Quanta */,
    "P014": { master: "SMF", confirmed: true }  /* Battery 75AH Exide */,
    "P015": { master: "LITHIUM", confirmed: true }  /* 36V 54AH- Lithium Battery */,
    "P016": { master: "LITHIUM", confirmed: true }  /* 36V 54Ah LIB-PISL */,
    "P017": { master: "LITHIUM", confirmed: true }  /* 48V 20Ah LIB-T */,
    "P018": { master: "LITHIUM", confirmed: true }  /* Lithium Ion Battery with cage for 2KVA UPS */,
    "P019": { master: "UPS", confirmed: true }  /* SFG UPS NX Tower-1-1.5KVA/36VDC */,
    "P020": { master: "LITHIUM", confirmed: true }  /* 36V42Ah Lithium battery-PISL */,
    "P021": { master: "LITHIUM", confirmed: true }  /* 36V 50Ah LIB-PISL */,
    "P022": { master: "LITHIUM", confirmed: true }  /* 4Hrs Lithium Set - PISL */,
    "P023": { master: "LITHIUM", confirmed: true }  /* 72V 100Ah LIB - PISL */,
    "P024": { master: "LITHIUM", confirmed: true }  /* 72V 50Ah LIB - PISL */,
    "P025": { master: "UPS", confirmed: true }  /* PM 10KVA 192V Ext LF 3:1 Long Backup */,
    "P026": { master: "UPS", confirmed: true }  /* PM 15 KVA 240V HF 3:1 Long Backup With - Faulty */,
    "P027": { master: "UPS", confirmed: true }  /* PM 1KVA/48V 1:1 HF Long Backup */,
    "P028": { master: "UPS", confirmed: true }  /* PM 3KVA 96V Ext HF 1:1 Long Backup-Faulty */,
    "P029": { master: "UPS", confirmed: true }  /* Eaton 9E-IN 2000XL */,
    "P030": { master: "UPS", confirmed: true }  /* PK 1 KVA 36 VDC UPS N */,
    "P031": { master: "UPS", confirmed: true }  /* PK 3 KVA 72 VDC Double Charger UPS with SNMP Nx */,
    "P032": { master: "UPS", confirmed: true }  /* PK 3 KVA 72 VDC UPS */,
    "P033": { master: "UPS", confirmed: true }  /* PK 3 KVA 96 VDC BIB UPS without Battery */,
    "P034": { master: "UPS", confirmed: true }  /* PK 3KVA UPS EXT MODEL 96DC H/F BPCL MODEL WITH MCB */,
    "P035": { master: "UPS", confirmed: true }  /* PM 3kVA/72V Ext HF 1:1 Long Backup - Double Charger */,
    "P036": { master: "UPS", confirmed: true }  /* PM 3kVA/72V Ext HF 1:1 Long Backup - Faulty */,
    "P037": { master: "ISOTX", confirmed: true }  /* 1 KVA Isolation Transformer */,
    "P038": { master: "ISOTX", confirmed: true }  /* 1.1 KVA Isolation Transformer */,
    "P039": { master: "ISOTX", confirmed: true }  /* 2 KVA Isolation Transformer */,
    "P040": { master: "ISOTX", confirmed: true }  /* 3 KVA Isolation Transformer */,
    "P041": { master: "ISOTX", confirmed: true }  /* 3 KVA Isolation Transformer - Faulty */,
    "P042": { master: "ISOTX", confirmed: true }  /* 3 KVA Isolation Transformer - OPC */,
    "P043": { master: "ISOTX", confirmed: true }  /* 4.5 KVA Isolation Transformer */,
    "P044": { master: "ISOTX", confirmed: true }  /* 7.5 KVA Isolation transformer */,
    "P045": { master: "SERVO", confirmed: true }  /* 3 KVA Servo Stabilizer with IT - Faulty */,
    "P046": { master: "SERVO", confirmed: true }  /* 4 KVA Servo Stabilizer */,
    "P047": { master: "SERVO", confirmed: true }  /* 3 KVA Servo Stabilizer */,
    "P048": { master: "SERVO", confirmed: true }  /* EXPOERT DEMO SERVO STAB - 25KVA-PISL */,
    "P049": { master: "SERVO", confirmed: true }  /* SERVO STABILIZER - 3KVA - 1PHASE - DIGITAL-PISL */,
    "P050": { master: "UPS", confirmed: true }  /* ON-LINE UPS - 5KVA - 192VDC-PISLN */,
    "P051": { master: "UPS", confirmed: true }  /* ON-LINE UPS - 5KVA - 192VDC-PISLN-Faulty */,
    "P052": { master: "OTHER", confirmed: true }  /* 9 L DRIVER CARD-PESPL */,
    "P053": { master: "OTHER", confirmed: true }  /* 1KW/48V MPPT SOLAR PCU-PESPL */,
    "P054": { master: "OTHER", confirmed: true }  /* INVERTER 3KVA/96VDC 1PH-1PH */,
    "P055": { master: "OTHER", confirmed: true }  /* INVERTER 4KVA/48VDC 1 PH-1PH-PESPL */,
    "P056": { master: "OTHER", confirmed: true }  /* PCU 7.5KVA/96VDC,1PH-1PH-PESPL */,
    "P057": { master: "OTHER", confirmed: true }  /* Garud 1100 (LCD) - PISL */,
    "P058": { master: "OTHER", confirmed: true }  /* Garud 1100 (LCD) - PISL (Faulty Broken) */,
    "P059": { master: "OTHER", confirmed: true }  /* GARUD INVERTER - PISL */,
    "P060": { master: "OTHER", confirmed: true }  /* Smart BMS 23S LFP 50A with accessories - Faulty */,
    "P061": { master: "OTHER", confirmed: true }  /* PK Power board of 1kva UPS */,
    "P062": { master: "OTHER", confirmed: true }  /* PK Control board of 1kva UPS */,
    "P063": { master: "OTHER", confirmed: true }  /* 11S LFP 30A with Cable - Faulty */,
    "P064": { master: "OTHER", confirmed: true }  /* 4-6 Sq MM Cop Ring Luges */,
    "P065": { master: "OTHER", confirmed: true }  /* Cage For Batteries */,
    "P066": { master: "OTHER", confirmed: true }  /* Connector -HAL */,
    "P067": { master: "OTHER", confirmed: true }  /* External charger Card */,
    "P068": { master: "OTHER", confirmed: true }  /* IGBT - SKM195GB066D - 200A/600V-Others */,
    "P069": { master: "LITHIUM", confirmed: true }  /* LFP-SU1000-36V(S) - UM */,
    "P070": { master: "OTHER", confirmed: true }  /* Rack & Accessories */,
    "P071": { master: "OTHER", confirmed: true }  /* SNMP Card */,
    "P072": { master: "OTHER", confirmed: true }  /* Uninyvin® 10 Cable - Interlink */,
    "P073": { master: "UPS", confirmed: true }  /* Service ups - PM 10KVA 192 VDC 3:1 HF UPS */,
    "P074": { master: "UPS", confirmed: true }  /* 1KVA UPS 36V - KSTAR */,
    "P075": { master: "LITHIUM", confirmed: true }  /* Services Lithium-Ion Battery */,
    "P076": { master: "OTHER", confirmed: true }  /* Spare & Components - Psc */,
    "P077": { master: "UPS", confirmed: true }  /* LI 1KVA 12VDC UPS */,
    "P078": { master: "LITHIUM", confirmed: true }  /* 72V36 AH LIB */,
    "P079": { master: "LITHIUM", confirmed: true }  /* LFP-SU2000-36V(S) - Umx */,
    "P080": { master: "LITHIUM", confirmed: true }  /* LFP-SU1000-12V(S) - UM */,
    "P081": { master: "UPS", confirmed: true }  /* PM 3kVA/96V Ext HF 1:1 Long Backup - Double Charger */,
    "P082": { master: "UPS", confirmed: true }  /* PM 6KVA 192V BIB HF 1:1 */,
    "P083": { master: "OTHER", confirmed: true }  /* EA900G4 1KVA 36VDC power PCBA */,
    "P084": { master: "OTHER", confirmed: true }  /* PM EA900G4 1-3KVA control PCBA */,
    "P085": { master: "LITHIUM", confirmed: true }  /* service - 48V 20Ah LIB-T */,
    "P086": { master: "OTHER", confirmed: true }  /* VARIAC SL - 35 AMP –270V OIL COOLED */,
    "P087": { master: "OTHER", confirmed: true }  /* LUG 16 SQ.MM, M6, COPPER RING, CAT NO. 7029/3D-1511 */,
    "P088": { master: "OTHER", confirmed: true }  /* CABLE UNINYVIN 6AWG (in Mtr.) */,
    "P089": { master: "OTHER", confirmed: true }  /* DMC INSULATOR, TYPE: BUS BAR, 100 AMP 4 WAY */,
    "P090": { master: "SERVO", confirmed: true }  /* ASSEMBLED PCB DIGITAL SERVO CONTROL CARD (INPUT PROTECTION) - 3PH - ADOLF */,
    "P091": { master: "UPS", confirmed: true }  /* PM 1 KVA 36V EXT HF 1:1 Long Backup with Double Charger */,
    "P092": { master: "OTHER", confirmed: true }  /* 3 Core - Black Wire (100 Mtr per Piece) */,
    "P093": { master: "OTHER", confirmed: true }  /* White Casing 32 Piece ( 100 Casing per Piece ) */,
    "P094": { master: "OTHER", confirmed: true }  /* Socket Box (10 Piece Per Box) */,
    "P095": { master: "OTHER", confirmed: true }  /* Clip for Wiring (100 per Packet) */,
    "P096": { master: "UPS", confirmed: true }  /* PROSTARM SFG UPS NX Tower Type 1.5KVA/36VDCx */,
    "P097": { master: "SMF", confirmed: true }  /* Service Battery-100AH */,
    "P098": { master: "SMF", confirmed: true }  /* Service 120ah Battery */,
    "P099": { master: "LITHIUM", confirmed: true }  /* EFL 96V 24AH-D06CB-R */,
    "P100": { master: "LITHIUM", confirmed: true }  /* LFP-SU2000-24V(S) - UM */,
    "P101": { master: "LITHIUM", confirmed: true }  /* EFL 72V 50AH-D50PB-R */,
    "P102": { master: "OTHER", confirmed: true }  /* Rack For Battery */,
    "P103": { master: "SMF", confirmed: true }  /* OPTIMUZ SMF BATTERY OPTI 12V-100AH */,
    "P104": { master: "LITHIUM", confirmed: true }  /* 72V 100AH Lithium Batteryx */,
    "P105": { master: "UPS", confirmed: true }  /* SFG UPS NX Tower-1.5KVA/36VDC */,
    "P106": { master: "OTHER", confirmed: true }  /* UPS Cage with Painting Charge (Lithium UPS) */,
    "P107": { master: "OTHER", confirmed: true }  /* PCM_LH23S5050ALF (BMS Card) */,
    "P108": { master: "OTHER", confirmed: true }  /* BMS_LH23S30AUB */,
    "P109": { master: "OTHER", confirmed: true }  /* PAC 1.5kVA 36V/ 12Amp Main board + LCD board 1/1-c */,
    "P110": { master: "OTHER", confirmed: true }  /* PM EA900G4 10K 1:1 power PCBA */,
    "P111": { master: "OTHER", confirmed: true }  /* PM EA900G4 6-10K 1:1 control PCBA 12-166800-03 14-005489-15 */
  }
};
