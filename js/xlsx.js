/* ============================================================
   xlsx.js — real .xlsx files, no libraries

   An .xlsx is a ZIP of XML parts. This writes both: a minimal
   ZIP container (stored, not deflated — valid and accepted by
   Excel) and the SpreadsheetML parts inside it.

   Stored entries mean the file is larger than one Excel would
   write. For an inventory export that is a rounding error, and
   it avoids shipping a compression library to run one report.

   Supports: several worksheets, bold header row frozen in place,
   autofilter on the header, per-column widths, number formats,
   and bold subtotal / grand-total rows.
   ============================================================ */
(function (w) {
  "use strict";

  /* ---------- CRC32, needed by the ZIP entry headers ---------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var enc = new TextEncoder();
  function bytes(str) { return enc.encode(str); }

  /* Deflate each part when the browser offers it. Stored entries were
     fine for a 20-row export; a 500-row template with a formula in
     every cell is 750 KB stored and about a tenth of that deflated,
     which is the difference between a file that emails and one that
     bounces. Falls back to stored if CompressionStream is absent. */
  function deflateAll(files) {
    if (typeof CompressionStream === "undefined") return Promise.resolve(files);
    return Promise.all(files.map(function (f) {
      var raw = bytes(f.content);
      var cs = new CompressionStream("deflate-raw");
      var wtr = cs.writable.getWriter();
      wtr.write(raw);
      wtr.close();
      return new Response(cs.readable).arrayBuffer().then(function (buf) {
        var packed = new Uint8Array(buf);
        /* Never let "compression" make a part bigger. */
        return packed.length < raw.length
          ? { name: f.name, raw: raw, packed: packed, method: 8 }
          : { name: f.name, raw: raw, packed: raw, method: 0 };
      }).catch(function () {
        return { name: f.name, raw: raw, packed: raw, method: 0 };
      });
    }));
  }

  /* ---------- ZIP ---------- */
  function zip(files) {
    var chunks = [], central = [], offset = 0;

    var now = new Date();
    var dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((now.getSeconds() / 2) & 31);
    var dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

    function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

    files.forEach(function (f) {
      var nameBytes = bytes(f.name);
      var raw = f.raw || bytes(f.content);
      var data = f.packed || raw;
      var method = f.method || 0;
      var crc = crc32(raw);

      var local = [].concat(
        u32(0x04034B50), u16(20), u16(0), u16(method),
        u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(raw.length),
        u16(nameBytes.length), u16(0)
      );
      chunks.push(new Uint8Array(local), nameBytes, data);

      central.push({
        header: [].concat(
          u32(0x02014B50), u16(20), u16(20), u16(0), u16(method),
          u16(dosTime), u16(dosDate),
          u32(crc), u32(data.length), u32(raw.length),
          u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
          u32(0), u32(offset)
        ),
        name: nameBytes
      });

      offset += local.length + nameBytes.length + data.length;
    });

    var centralStart = offset, centralSize = 0;
    central.forEach(function (c) {
      chunks.push(new Uint8Array(c.header), c.name);
      centralSize += c.header.length + c.name.length;
    });

    chunks.push(new Uint8Array([].concat(
      u32(0x06054B50), u16(0), u16(0),
      u16(files.length), u16(files.length),
      u32(centralSize), u32(centralStart), u16(0)
    )));

    var total = chunks.reduce(function (a, c) { return a + c.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  }

  /* ---------- XML helpers ---------- */
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      /* Control characters are illegal in XML and Excel refuses the file. */
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  }

  function colName(i) {
    var s = "";
    i = i + 1;
    while (i > 0) {
      var m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  /* Style ids, in the order they are written into styles.xml:
     0 normal | 1 header | 2 integer | 3 bold | 4 bold integer
     5 group heading | 6 grand total text | 7 grand total number */
  var S = { NORMAL: 0, HEADER: 1, NUM: 2, BOLD: 3, BOLDNUM: 4, GROUP: 5, TOTAL: 6, TOTALNUM: 7,
            INPUT: 8, LOCKED: 9, TITLE: 10, NOTE: 11, HEADLOCK: 12, INPUTNUM: 13, DATE: 14 };

  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/>' +
    '<numFmt numFmtId="165" formatCode="DD-MM-YYYY"/></numFmts>' +
    '<fonts count="4">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF0A2540"/><name val="Calibri"/></font>' +
      '<font><sz val="10"/><color rgb="FF4A5A6C"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><i/><sz val="9"/><color rgb="FFA8620A"/><name val="Calibri"/></font>' +
    "</fonts>" +
    '<fills count="4">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1668B0"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE3F1FB"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F7"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF0A2540"/><bgColor indexed="64"/></patternFill></fill>' +
    "</fills>" +
    '<borders count="3"><border/>' +
      '<border><top style="thin"><color rgb="FF1668B0"/></top></border>' +
      '<border><left style="thin"><color rgb="FFC3CEDC"/></left><right style="thin"><color rgb="FFC3CEDC"/></right>' +
      '<top style="thin"><color rgb="FFC3CEDC"/></top><bottom style="thin"><color rgb="FFC3CEDC"/></bottom></border>' +
    "</borders>" +
    '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
    '<cellXfs count="15">' +
      '<xf xfId="0"/>' +
      '<xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1" applyAlignment="1">' +
        '<alignment vertical="center" wrapText="1"/></xf>' +
      '<xf xfId="0" numFmtId="164" applyNumberFormat="1"/>' +
      '<xf xfId="0" fontId="2" applyFont="1"/>' +
      '<xf xfId="0" fontId="2" numFmtId="164" applyFont="1" applyNumberFormat="1"/>' +
      '<xf xfId="0" fontId="3" fillId="3" applyFont="1" applyFill="1"/>' +
      '<xf xfId="0" fontId="2" borderId="1" applyFont="1" applyBorder="1"/>' +
      '<xf xfId="0" fontId="2" numFmtId="164" borderId="1" applyFont="1" applyNumberFormat="1" applyBorder="1"/>' +
      /* 8 INPUT — unlocked, the only cells a protected sheet lets through */
      '<xf xfId="0" borderId="2" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>' +
      /* 9 LOCKED — derived column, greyed */
      '<xf xfId="0" fontId="4" fillId="4" borderId="2" applyFont="1" applyFill="1" applyBorder="1" applyProtection="1"><protection locked="1"/></xf>' +
      /* 10 TITLE */
      '<xf xfId="0" fontId="5" fillId="5" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
      /* 11 NOTE */
      '<xf xfId="0" fontId="6" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
      /* 12 HEADLOCK — dark heading over a derived column */
      '<xf xfId="0" fontId="1" fillId="5" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
      /* 13 INPUTNUM */
      '<xf xfId="0" numFmtId="164" borderId="2" applyNumberFormat="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>' +
      /* 14 DATE */
      '<xf xfId="0" numFmtId="165" borderId="2" applyNumberFormat="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>";

  /* A cell is either { v, s } or a bare value. Numbers are written as
     numbers so Excel can total them; everything else as inline text,
     which avoids maintaining a shared string table. */
  function cellXml(ref, cell) {
    var isObj = cell && typeof cell === "object";
    var v = isObj && "v" in cell ? cell.v : cell;
    var style = isObj && "s" in cell ? cell.s : null;

    /* A formula cell carries no cached value — Excel computes it on
       open. Anything reading the file before that sees an empty cell,
       which is why the upload matches on the typed name, not on a
       derived code. */
    if (isObj && cell.f) {
      return '<c r="' + ref + '"' + (style === null ? "" : ' s="' + style + '"') +
        "><f>" + esc(cell.f) + "</f></c>";
    }

    if (v === null || v === undefined || v === "") {
      return style ? '<c r="' + ref + '" s="' + style + '"/>' : "";
    }
    var isNum = typeof v === "number" && isFinite(v);
    if (style === null) style = isNum ? S.NUM : S.NORMAL;

    return isNum
      ? '<c r="' + ref + '" s="' + style + '"><v>' + v + "</v></c>"
      : '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' +
        esc(v) + "</t></is></c>";
  }

  /* Excel's legacy sheet-protection hash. Reversible in seconds by any
     of a dozen free tools — included because Excel expects it, not
     because it protects anything. */
  function hashPassword(pw) {
    var h = 0, s2 = String(pw);
    for (var i = s2.length - 1; i >= 0; i--) {
      h = ((h >> 14) & 0x01) | ((h << 1) & 0x7FFF);
      h ^= s2.charCodeAt(i);
    }
    h = ((h >> 14) & 0x01) | ((h << 1) & 0x7FFF);
    h ^= s2.length;
    h ^= 0xCE4B;
    return ("0000" + (h & 0xFFFF).toString(16).toUpperCase()).slice(-4);
  }

  function sheetXml(sheet) {
    var cols = sheet.columns || [];
    var rows = sheet.rows || [];

    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

    /* Header row stays visible while scrolling a long branch list. */
    if (sheet.freezeHeader !== false) {
      xml += '<sheetViews><sheetView workbookViewId="0">' +
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
        '</sheetView></sheetViews>';
    }

    if (cols.length) {
      xml += "<cols>";
      cols.forEach(function (c, i) {
        xml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || 16) + '" customWidth="1"/>';
      });
      xml += "</cols>";
    }

    xml += "<sheetData>";

    var r = 1;
    /* headerRow:false means the sheet supplies its own first rows —
       a title bar, or a heading row that needs per-cell styling. */
    if (cols.length && sheet.headerRow !== false) {
      xml += '<row r="1" ht="22" customHeight="1">';
      cols.forEach(function (c, i) {
        xml += cellXml(colName(i) + "1", { v: c.label, s: S.HEADER });
      });
      xml += "</row>";
      r = 2;
    }

    rows.forEach(function (row) {
      xml += '<row r="' + r + '">';
      (row || []).forEach(function (cell, i) {
        var c = cellXml(colName(i) + r, cell);
        if (c) xml += c;
      });
      xml += "</row>";
      r++;
    });

    if (sheet.merges && sheet.merges.length) {
      xml += '<mergeCells count="' + sheet.merges.length + '">' +
        sheet.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") +
        "</mergeCells>";
    }
    xml += "</sheetData>";

    /* Autofilter over the header and body, so every column gets a
       dropdown for filtering and sorting. */
    if (sheet.autoFilter !== false && sheet.headerRow !== false && cols.length && rows.length) {
      xml += '<autoFilter ref="A1:' + colName(cols.length - 1) + (rows.length + 1) + '"/>';
    }

    /* Protection guards the headings, formulas and lookup lists from an
       accidental edit. It is not a security control — Excel protection
       is trivially removed, and the checks that matter run in the
       portal on upload. */
    if (sheet.protect) {
      xml += '<sheetProtection sheet="1" objects="1" scenarios="1"' +
        (sheet.password ? ' password="' + hashPassword(sheet.password) + '"' : "") +
        ' selectLockedCells="0" selectUnlockedCells="0" formatCells="1" formatColumns="0"' +
        ' insertRows="0" deleteRows="0" sort="0" autoFilter="0"/>';
    }

    if (sheet.validations && sheet.validations.length) {
      xml += '<dataValidations count="' + sheet.validations.length + '">';
      sheet.validations.forEach(function (v) {
        xml += '<dataValidation type="' + v.type + '"' +
          (v.operator ? ' operator="' + v.operator + '"' : "") +
          ' allowBlank="1" showInputMessage="1" showErrorMessage="1"' +
          (v.type === "list" ? ' showDropDown="0"' : "") +
          (v.errorTitle ? ' errorTitle="' + esc(v.errorTitle) + '"' : "") +
          (v.error ? ' error="' + esc(v.error) + '"' : "") +
          (v.promptTitle ? ' promptTitle="' + esc(v.promptTitle) + '"' : "") +
          (v.prompt ? ' prompt="' + esc(v.prompt) + '"' : "") +
          ' sqref="' + v.range + '">' +
          "<formula1>" + esc(v.formula1) + "</formula1>" +
          (v.formula2 ? "<formula2>" + esc(v.formula2) + "</formula2>" : "") +
          "</dataValidation>";
      });
      xml += "</dataValidations>";
    }
    xml += "</worksheet>";
    return xml;
  }

  function parts_(sheets, options) {
    var files = [];
    var definedNames = (options && options.definedNames) || [];

    files.push({
      name: "[Content_Types].xml",
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (s, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join("") +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>"
    });

    files.push({
      name: "_rels/.rels",
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>"
    });

    files.push({
      name: "xl/workbook.xml",
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) {
          /* Excel rejects : \ / ? * [ ] in a sheet name, and caps it at 31. */
          var name = String(s.name || ("Sheet" + (i + 1))).replace(/[:\\\/\?\*\[\]]/g, " ").slice(0, 31);
          return '<sheet name="' + esc(name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join("") +
        "</sheets>" +
        (definedNames.length
          ? "<definedNames>" + definedNames.map(function (n) {
              return '<definedName name="' + esc(n.name) + '">' + esc(n.ref) + "</definedName>";
            }).join("") + "</definedNames>"
          : "") +
        "</workbook>"
    });

    files.push({
      name: "xl/_rels/workbook.xml.rels",
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) {
          return '<Relationship Id="rId' + (i + 1) +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
            (i + 1) + '.xml"/>';
        }).join("") +
        '<Relationship Id="rId' + (sheets.length + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>"
    });

    files.push({ name: "xl/styles.xml", content: STYLES });

    sheets.forEach(function (s, i) {
      files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", content: sheetXml(s) });
    });
    return files;
  }

  function build(sheets, options) {
    return zip(parts_(sheets, options));
  }

  w.XLSX = {
    styles: S,
    build: build,
    /* Synchronous, stored — kept for callers that cannot await. */
    blob: function (sheets, options) {
      return new Blob([build(sheets, options)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
    },
    /* Preferred: deflated, so large templates stay emailable. */
    blobAsync: function (sheets, options) {
      var parts = parts_(sheets, options);
      return deflateAll(parts).then(function (packed) {
        return new Blob([zip(packed)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
      });
    }
  };
})(window);
