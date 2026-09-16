/* ============================================================
   xlsx-read.js — read .xlsx and .csv uploads, no libraries

   An .xlsx is a ZIP of XML. Reading one needs inflate, which the
   browser now provides natively as DecompressionStream
   ("deflate-raw") — verified working over file://, so the portal
   keeps its no-install promise.

   Returns a plain array of row arrays. Anything the sheet cannot
   express cleanly is reported rather than guessed at.
   ============================================================ */
(function (w) {
  "use strict";

  var dec = new TextDecoder();

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      return Promise.reject(new Error(
        "This browser cannot read .xlsx files. Save the sheet as CSV and upload that instead."));
    }
    var ds = new DecompressionStream("deflate-raw");
    var writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Response(ds.readable).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }

  /* Walks the central directory rather than scanning local headers, so
     a file with extra fields or a data descriptor still reads correctly. */
  function unzip(bytes) {
    var end = -1;
    for (var i = bytes.length - 22; i >= 0 && i > bytes.length - 65558; i--) {
      if (u32(bytes, i) === 0x06054B50) { end = i; break; }
    }
    if (end < 0) return Promise.reject(new Error("That is not a valid .xlsx file."));

    var count = u16(bytes, end + 10);
    var offset = u32(bytes, end + 16);
    var entries = [];

    for (var n = 0; n < count; n++) {
      if (u32(bytes, offset) !== 0x02014B50) break;
      var method = u16(bytes, offset + 10);
      var compSize = u32(bytes, offset + 20);
      var nameLen = u16(bytes, offset + 28);
      var extraLen = u16(bytes, offset + 30);
      var commentLen = u16(bytes, offset + 32);
      var localOff = u32(bytes, offset + 42);
      var name = dec.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));

      var lNameLen = u16(bytes, localOff + 26);
      var lExtraLen = u16(bytes, localOff + 28);
      var dataStart = localOff + 30 + lNameLen + lExtraLen;

      entries.push({
        name: name, method: method,
        data: bytes.subarray(dataStart, dataStart + compSize)
      });
      offset += 46 + nameLen + extraLen + commentLen;
    }

    var files = {};
    return entries.reduce(function (chain, e) {
      return chain.then(function () {
        if (e.method === 0) { files[e.name] = e.data; return; }
        if (e.method !== 8) throw new Error("Unsupported compression in " + e.name + ".");
        return inflateRaw(e.data).then(function (out) { files[e.name] = out; });
      });
    }, Promise.resolve()).then(function () { return files; });
  }

  function textOf(node) {
    /* <t> can be split across <r> runs when Excel applies formatting
       mid-cell; concatenating every <t> is the only safe read. */
    var out = "", m, re = /<t[^>]*>([\s\S]*?)<\/t>/g;
    while ((m = re.exec(node))) out += m[1];
    return out
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || "");
    if (!m) return 0;
    var s = m[1], n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  function parseSheet(xml, shared) {
    var rows = [];
    var rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g, rm;
    while ((rm = rowRe.exec(xml))) {
      var cells = [], cm;
      /* The attribute group must be LAZY. Greedy, it swallows the
         closing slash of a self-closing cell — <c r="H3" s="6"/> — then
         runs on to the next </c>, merging every empty cell into its
         neighbour and shifting all later columns left. Excel writes
         empty-but-styled cells constantly, so a real workbook silently
         loses Challan, Invoice, Party and Remarks. */
      var cellRe = /<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      while ((cm = cellRe.exec(rm[1]))) {
        var attrs = cm[1] || "", body = cm[2] || "";
        var refM = /r="([A-Z]+\d+)"/.exec(attrs);
        var idx = colIndex(refM ? refM[1] : "");
        var type = (/t="([^"]+)"/.exec(attrs) || [])[1];
        var value = "";
        if (type === "inlineStr") {
          value = textOf(body);
        } else if (type === "s") {
          var si = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
          value = shared[Number(si)] || "";
        } else {
          var v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
          value = v == null ? "" : v;
        }
        cells[idx] = String(value).trim();
      }
      for (var i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
      rows.push(cells);
    }
    return rows;
  }

  /* CSV with quoted fields, embedded commas, newlines and "" escapes. */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], field = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { row.push(field.trim()); field = ""; }
      else if (c === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
    if (field !== "" || row.length) { row.push(field.trim()); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x !== ""; }); });
  }

  w.XLSXRead = {
    /* Resolves to { rows, sheet, format }. Rejects with a message
       written for the person holding the file, not the developer. */
    read: function (file) {
      var name = String(file.name || "").toLowerCase();

      if (/\.csv$/.test(name) || /\.txt$/.test(name)) {
        return file.text().then(function (t) {
          return { rows: parseCSV(t), sheet: "CSV", format: "csv" };
        });
      }

      if (/\.xls$/.test(name)) {
        return Promise.reject(new Error(
          "That is the older .xls format. Open it in Excel and save as .xlsx or .csv."));
      }
      if (!/\.xlsx$/.test(name)) {
        return Promise.reject(new Error("Upload an .xlsx or .csv file."));
      }

      return file.arrayBuffer().then(function (buf) {
        return unzip(new Uint8Array(buf));
      }).then(function (files) {
        var shared = [];
        if (files["xl/sharedStrings.xml"]) {
          var sx = dec.decode(files["xl/sharedStrings.xml"]);
          var sm, sre = /<si>([\s\S]*?)<\/si>/g;
          while ((sm = sre.exec(sx))) shared.push(textOf(sm[1]));
        }
        /* First sheet by workbook order, not by filename — sheet1.xml is
           not always the first tab. */
        var target = "xl/worksheets/sheet1.xml";
        if (files["xl/workbook.xml"] && files["xl/_rels/workbook.xml.rels"]) {
          var wb = dec.decode(files["xl/workbook.xml"]);
          var rid = (/<sheet[^>]*r:id="([^"]+)"/.exec(wb) || [])[1];
          if (rid) {
            var rels = dec.decode(files["xl/_rels/workbook.xml.rels"]);
            var re = new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"');
            var t = (re.exec(rels) || [])[1];
            if (t) {
              t = t.replace(/^\/?xl\//, "").replace(/^\//, "");
              if (files["xl/" + t]) target = "xl/" + t;
            }
          }
        }
        if (!files[target]) {
          var any = Object.keys(files).filter(function (k) { return /^xl\/worksheets\/.*\.xml$/.test(k); });
          if (!any.length) return Promise.reject(new Error("No worksheet found in that file."));
          target = any[0];
        }
        return {
          rows: parseSheet(dec.decode(files[target]), shared),
          sheet: target.split("/").pop(),
          format: "xlsx"
        };
      });
    },
    parseCSV: parseCSV
  };
})(window);
