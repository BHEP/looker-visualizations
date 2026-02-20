// grouped_tables_custom_viz.js
// Looker custom visualization: Grouped Tables
// Table with pivoted columns (colored header), optional measure headers,
// section grouping by dimension, optional sub-totals, and spacing between sections.

looker.plugins.visualizations.add({

  id: "grouped_tables_grouped_tables",
  label: "Grouped Tables",

  options: {
    pivotedHeaderColor: {
      type: "string",
      label: "Pivoted column header color",
      default: "#215C98",
      display: "color",
      section: "Header",
      order: 1
    },
    showMeasureHeaders: {
      type: "boolean",
      label: "Show measure headers",
      default: true,
      section: "Header",
      order: 2
    },
    pivotHeaderAlignment: {
      type: "string",
      label: "Pivot header alignment",
      display: "select",
      values: [{ "Left": "left" }, { "Center": "center" }],
      default: "left",
      section: "Header",
      order: 3
    },
    replaceZeroWithDash: {
      type: "boolean",
      label: "Replace 0 with \u201c\u2013\u201d",
      default: true,
      section: "Display",
      order: 5
    },
    freezeNonMeasureColumns: {
      type: "boolean",
      label: "Freeze non-measure columns",
      default: true,
      section: "Display",
      order: 6
    },
    groupByDimension: {
      type: "string",
      label: "Group by (dimension for sections)",
      default: "__none__",
      display: "select",
      section: "Grouping",
      order: 10,
      values: [{ "No sections": "__none__" }]
    },
    showSubTotals: {
      type: "boolean",
      label: "Show sub-totals per section",
      default: true,
      section: "Grouping",
      order: 11
    },
    sectionSpacing: {
      type: "number",
      label: "Spacing between sections (px)",
      default: 24,
      section: "Grouping",
      order: 12
    },
    showTableTotal: {
      type: "boolean",
      label: "Show table total",
      default: false,
      section: "Table total",
      order: 20
    },
    tableTotalPosition: {
      type: "string",
      label: "Table total position",
      display: "select",
      values: [{ "Top": "top" }, { "Bottom": "bottom" }],
      default: "bottom",
      section: "Table total",
      order: 21
    },
    tableTotalLabel: {
      type: "string",
      label: "Table total label",
      default: "Total",
      display: "text",
      section: "Table total",
      order: 22,
      placeholder: "Total"
    }
  },

  create: function (element) {
    element.innerHTML = "";
    var container = document.createElement("div");
    container.className = "grouped-tables-container";
    Object.assign(container.style, { width: "100%", height: "100%", minWidth: "0", overflow: "auto" });
    element.appendChild(container);
  },

  // ---------------------------------------------------------------------------
  // Helpers (stateless)
  // ---------------------------------------------------------------------------

  _cfg: function (config, key, fallback) {
    return config[key] !== undefined ? config[key] : fallback;
  },

  _num: function (obj) {
    if (!obj) return 0;
    var v = Number(obj.value);
    return isFinite(v) ? v : 0;
  },

  _fieldLabel: function (field, fallback) {
    if (!field) return fallback;
    var l = String(field.label_short || field.label || field.name || fallback || "").trim();
    return l || fallback;
  },

  _cellText: function (cell, fallback) {
    if (!cell) return fallback || "";
    var v = (cell.rendered != null && cell.rendered !== "") ? cell.rendered : cell.value;
    return (v == null || String(v).trim() === "") ? (fallback || "") : String(v);
  },

  _isNullPivot: function (val) {
    if (val == null) return true;
    var s = String(val).trim();
    return s === "" || s === "null" || s.indexOf("___null") >= 0;
  },

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  updateAsync: function (data, element, config, queryResponse, _details, done) {
    var self = this;
    var container = element.querySelector(".grouped-tables-container");
    if (!container) { this.create(element); container = element.querySelector(".grouped-tables-container"); }

    try {
      self._render(data, config, queryResponse, container);
    } catch (err) {
      container.innerHTML = "<p style='padding:12px;color:#c00;'>Error: " + (err.message || err) + "</p>";
    }
    done();
  },

  _render: function (data, config, qr, container) {
    var self = this;
    var dims     = qr.fields.dimension_like || [];
    var measures  = qr.fields.measure_like  || [];
    var pivotMeta = qr.pivots || [];

    if (!dims.length)     { container.innerHTML = "<p>Add at least one dimension.</p>"; return; }
    if (!measures.length) { container.innerHTML = "<p>Add at least one measure.</p>";   return; }

    // --- Config -----------------------------------------------------------------
    self._registerGroupByOptions(dims);

    var cfg = self._resolveConfig(config, dims, measures, pivotMeta);

    // --- Pivot analysis ---------------------------------------------------------
    var pivot = self._analyzePivots(pivotMeta, measures);
    var pivotKeys   = pivot.keys;
    var pivotLabels = pivot.labels;

    // --- Pivot hierarchy --------------------------------------------------------
    var hierarchy = self._analyzeHierarchy(pivotKeys, measures);

    // --- Layout counts ----------------------------------------------------------
    var displayDims = cfg.groupDim
      ? dims.filter(function (d) { return d !== cfg.groupDim; })
      : dims.slice();
    if (!displayDims.length) displayDims = [dims[0]];

    var dimColCount   = displayDims.length;
    var valueColCount = pivotMeta.length ? measures.length * pivotKeys.length : measures.length;
    var totalColCount = dimColCount + valueColCount;

    // --- Iteration helper -------------------------------------------------------
    function forEachValueCol(cb) {
      if (pivotMeta.length) {
        measures.forEach(function (m) { pivotKeys.forEach(function (pk) { cb(m, pk); }); });
      } else {
        measures.forEach(function (m) { cb(m, m.name); });
      }
    }

    // --- Cell helpers -----------------------------------------------------------
    function cellValue(row, mName, pk) {
      var obj = pivotMeta.length ? (row[mName] && row[mName][pk]) : row[mName];
      return self._num(obj);
    }
    function sumRows(rows, mName, pk) {
      var s = 0; rows.forEach(function (r) { s += cellValue(r, mName, pk); }); return s;
    }
    function formatValue(val) {
      if (val == null || isNaN(val)) return "";
      if (cfg.replaceZero && Number(val) === 0) return "\u2013";
      return Number(val) === Math.floor(val) ? String(Math.floor(val)) : Number(val).toFixed(1);
    }

    // --- Sections ---------------------------------------------------------------
    var sections = self._buildSections(data, cfg.groupDim);

    // --- DOM: table + thead + tbody ---------------------------------------------
    var table = self._createTable(cfg.freeze);
    var thead = document.createElement("thead");
    var tbody = document.createElement("tbody");

    var measureLabels = {};
    measures.forEach(function (m) { measureLabels[m.name] = m.label_short || m.label || m.name; });

    // --- Header -----------------------------------------------------------------
    self._renderHeader(thead, {
      displayDims: displayDims, measures: measures, pivotMeta: pivotMeta,
      pivotKeys: pivotKeys, pivotLabels: pivotLabels,
      hierarchy: hierarchy, measureLabels: measureLabels,
      cfg: cfg, forEachValueCol: forEachValueCol
    });
    table.appendChild(thead);

    // --- Body: sections ---------------------------------------------------------
    sections.forEach(function (section, idx) {
      if (cfg.sectionSpacing > 0 && idx > 0) {
        tbody.appendChild(self._makeSpacerRow(totalColCount, cfg.sectionSpacing));
      }
      if (cfg.groupDim && section.label != null) {
        tbody.appendChild(self._makeSectionHeaderRow(section.label, dimColCount, valueColCount, cfg.freeze));
      }
      section.rows.forEach(function (row) {
        var tr = document.createElement("tr");
        displayDims.forEach(function (dim, i) {
          var td = self._td({ padding: "6px 8px", borderBottom: "1px solid #eee" });
          if (cfg.freeze && i === 0) td.className = "grouped-tables-col-frozen";
          td.textContent = self._cellText(row[dim.name], "");
          tr.appendChild(td);
        });
        forEachValueCol(function (m, pk) {
          var td = self._td({ padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #eee" });
          td.textContent = formatValue(cellValue(row, m.name, pk));
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      if (cfg.showSubTotals && section.rows.length > 0) {
        tbody.appendChild(self._makeTotalRow("Total", section.rows, dimColCount, cfg.freeze, forEachValueCol, sumRows, formatValue));
      }
    });

    // --- Table total ------------------------------------------------------------
    if (cfg.showTableTotal) {
      var ttRow = self._makeTotalRow(cfg.tableTotalLabel, data, dimColCount, cfg.freeze, forEachValueCol, sumRows, formatValue);
      ttRow.className = "grouped-tables-table-total-row";
      ttRow.firstChild.style.borderTop = "2px solid #ccc";
      if (cfg.tableTotalPosition === "top") {
        if (cfg.sectionSpacing > 0) tbody.insertBefore(self._makeSpacerRow(totalColCount, cfg.sectionSpacing), tbody.firstChild);
        tbody.insertBefore(ttRow, tbody.firstChild);
      } else {
        if (cfg.sectionSpacing > 0) tbody.appendChild(self._makeSpacerRow(totalColCount, cfg.sectionSpacing));
        tbody.appendChild(ttRow);
      }
    }

    table.appendChild(tbody);

    // --- Mount + freeze styling -------------------------------------------------
    container.innerHTML = "";
    if (cfg.freeze) {
      container.style.overflow = "hidden";
      var wrapper = document.createElement("div");
      wrapper.className = "grouped-tables-scroll-wrapper";
      Object.assign(wrapper.style, { overflow: "auto", width: "100%", height: "100%", minWidth: "0" });
      wrapper.appendChild(table);
      container.appendChild(wrapper);
      container.appendChild(self._freezeStyleSheet(cfg.headerColor));
    } else {
      container.style.overflow = "auto";
      container.appendChild(table);
    }
  },

  // ---------------------------------------------------------------------------
  // Config resolution
  // ---------------------------------------------------------------------------

  _registerGroupByOptions: function (dims) {
    var self = this;
    var values = [{ "No sections": "__none__" }];
    dims.forEach(function (d) { values.push({ [self._fieldLabel(d, d.name)]: d.name }); });
    var opts = Object.assign({}, this.options);
    opts.groupByDimension = Object.assign({}, opts.groupByDimension, {
      values: values,
      default: dims.length >= 2 ? dims[0].name : "__none__"
    });
    this.options = opts;
    this.trigger("registerOptions", opts);
  },

  _resolveConfig: function (config, dims, measures, pivotMeta) {
    var self = this;
    var c = function (k, d) { return self._cfg(config, k, d); };

    var groupByField = (c("groupByDimension", "__none__") || "").trim();
    if (groupByField === "") {
      groupByField = dims.length >= 2 ? dims[0].name : "__none__";
    }
    var groupDim = null;
    if (groupByField && groupByField !== "__none__") {
      groupDim = dims.find(function (d) { return d.name === groupByField; })
              || dims.find(function (d) { return self._fieldLabel(d, d.name) === groupByField; })
              || null;
    }

    var posRaw = c("tableTotalPosition", "bottom") || c("table_total_position", "bottom");
    var headerColor = String(c("pivotedHeaderColor", "#215C98") || "#215C98").trim() || "#215C98";
    var alignRaw = String(c("pivotHeaderAlignment", "left") || "left").toLowerCase().trim();
    var spacingRaw = Number(c("sectionSpacing", 24));

    return {
      groupDim: groupDim,
      showMeasureHeaders: !!c("showMeasureHeaders", true),
      showSubTotals:      !!c("showSubTotals", true),
      sectionSpacing:     isFinite(spacingRaw) ? Math.max(0, spacingRaw) : 24,
      headerColor:        headerColor,
      pivotAlign:         alignRaw === "center" ? "center" : "left",
      replaceZero:        !!c("replaceZeroWithDash", true),
      freeze:             !!c("freezeNonMeasureColumns", true),
      showTableTotal:     !!c("showTableTotal", false),
      tableTotalPosition: String(posRaw || "").toLowerCase().indexOf("top") >= 0 ? "top" : "bottom",
      tableTotalLabel:    String(c("tableTotalLabel", "Total") || "Total").trim() || "Total"
    };
  },

  // ---------------------------------------------------------------------------
  // Pivot analysis
  // ---------------------------------------------------------------------------

  _PIVOT_DELIMITERS: ["|FIELD|", "|", "\u2013", "\u2014", " - ", " \u2013 ", " \u2014 ", "::", ":"],

  _parsePivotKey: function (pk) {
    var s = String(pk || "");
    var delims = this._PIVOT_DELIMITERS;
    for (var i = 0; i < delims.length; i++) {
      if (s.indexOf(delims[i]) >= 0) {
        var parts = s.split(delims[i]).map(function (p) { return p.trim(); });
        if (parts.length >= 2) return parts;
      }
    }
    return [s];
  },

  _analyzePivots: function (pivotMeta, measures) {
    var self = this;
    var keys = [], labels = {};
    if (pivotMeta.length) {
      keys = pivotMeta.map(function (p) { return p.key; });
      pivotMeta.forEach(function (p) {
        var l = p.is_total ? "Total" : (p.label_short || p.label || p.key);
        labels[p.key] = self._isNullPivot(l) ? "" : l;
      });
    } else {
      keys = measures.map(function (m) { return m.name; });
      measures.forEach(function (m) { labels[m.name] = m.label_short || m.label || m.name; });
    }
    return { keys: keys, labels: labels };
  },

  _analyzeHierarchy: function (pivotKeys, measures) {
    var self = this;
    var parts = pivotKeys.map(function (pk) { return self._parsePivotKey(pk); });
    var numLevels = parts.length ? Math.max.apply(null, parts.map(function (p) { return p.length; })) : 0;
    var measureNames = measures.map(function (m) { return m.name; });

    var middleIsMeasure = numLevels >= 3 && measures.some(function (m) {
      return parts.some(function (p) { return p[1] === m.name; });
    });
    var levelCount = middleIsMeasure && numLevels >= 3 ? 2 : (numLevels >= 2 ? Math.min(numLevels, 10) : 1);
    var isHierarchical = pivotKeys.length > 0 && numLevels >= 2;

    function isMeasureOrBlank(val) {
      if (val == null || String(val).trim() === "") return true;
      return measureNames.indexOf(String(val).trim()) >= 0;
    }

    function getPart(pk, level) {
      if (pk == null) return "";
      var p = self._parsePivotKey(pk);
      var raw;
      if (p.length === 1) {
        return level === 0 ? "" : (isMeasureOrBlank(p[0]) || self._isNullPivot(p[0]) ? "" : p[0]);
      }
      if (middleIsMeasure && p.length >= 3) {
        raw = level === 0 ? p[0] : (level === 1 ? p[2] : p[level]);
      } else {
        raw = p[level] != null ? p[level] : (level === 0 ? "" : pk);
      }
      if (raw == null || raw === "") return "";
      if (isMeasureOrBlank(raw) || self._isNullPivot(raw)) return "";
      return String(raw).trim();
    }

    function getTuple(pk, upToLevel) {
      if (pk == null) return "";
      var p = self._parsePivotKey(pk);
      if (middleIsMeasure && p.length >= 3) {
        var out = [p[0]];
        if (upToLevel >= 1) out.push(p[2]);
        return out.join("\0");
      }
      return p.slice(0, upToLevel + 1).join("\0");
    }

    function groupConsecutive(arr, fn) {
      var groups = [], i = 0;
      while (i < arr.length) {
        var val = fn(arr[i]), count = 0;
        while (i < arr.length && fn(arr[i]) === val) { count++; i++; }
        groups.push({ value: val, count: count });
      }
      return groups;
    }

    return {
      isHierarchical: isHierarchical,
      levelCount: levelCount,
      middleIsMeasure: middleIsMeasure,
      getPart: getPart,
      getTuple: getTuple,
      groupConsecutive: groupConsecutive
    };
  },

  // ---------------------------------------------------------------------------
  // Section building
  // ---------------------------------------------------------------------------

  _buildSections: function (data, groupDim) {
    if (!groupDim) return [{ label: null, rows: data }];
    var self = this;
    var sections = [], map = {};
    data.forEach(function (row) {
      var key = self._cellText(row[groupDim.name], "");
      if (!map[key]) {
        map[key] = { label: key || "(No section)", rows: [] };
        sections.push(map[key]);
      }
      map[key].rows.push(row);
    });
    return sections;
  },

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  _td: function (styles) {
    var td = document.createElement("td");
    if (styles) Object.assign(td.style, styles);
    return td;
  },

  _th: function (headerColor, styles) {
    var th = document.createElement("th");
    Object.assign(th.style, {
      backgroundColor: headerColor,
      color: "#ffffff",
      textDecoration: "underline",
      fontWeight: "bold",
      border: "1px solid " + headerColor,
      padding: "8px"
    });
    if (styles) Object.assign(th.style, styles);
    return th;
  },

  _createTable: function (freeze) {
    var table = document.createElement("table");
    table.className = "grouped-tables-table" + (freeze ? " grouped-tables-frozen" : "");
    table.setAttribute("border", "0");
    table.setAttribute("cellpadding", "6");
    table.setAttribute("cellspacing", "0");
    Object.assign(table.style, {
      borderCollapse: "collapse",
      width: "100%",
      tableLayout: "auto",
      fontFamily: "inherit",
      fontSize: "14px"
    });
    if (freeze) table.style.minWidth = "max-content";
    return table;
  },

  _makeSpacerRow: function (colCount, height) {
    var tr = document.createElement("tr");
    var td = this._td({
      height: height + "px", border: "none", background: "transparent",
      padding: "0", lineHeight: "0", fontSize: "0"
    });
    td.colSpan = colCount;
    td.innerHTML = "<div style='display:block;height:" + height + "px'></div>";
    tr.appendChild(td);
    return tr;
  },

  _makeSectionHeaderRow: function (label, dimColCount, valueColCount, freeze) {
    var tr = document.createElement("tr");
    if (freeze) tr.className = "grouped-tables-section-header";
    var td = this._td({
      fontWeight: "bold", textDecoration: "underline",
      padding: "8px 6px 4px 6px", borderBottom: "1px solid #ccc"
    });
    td.className = "grouped-tables-section-label" + (freeze ? " grouped-tables-col-frozen" : "");
    td.colSpan = dimColCount;
    td.textContent = label;
    tr.appendChild(td);
    if (valueColCount > 0) {
      var filler = this._td({ borderBottom: "1px solid #ccc", padding: "0", background: "transparent" });
      filler.colSpan = valueColCount;
      tr.appendChild(filler);
    }
    return tr;
  },

  _makeTotalRow: function (label, rows, dimColCount, freeze, forEachValueCol, sumRows, formatValue) {
    var tr = document.createElement("tr");
    var td = this._td({
      fontWeight: "bold", padding: "6px 8px",
      borderTop: "1px solid #ccc", borderBottom: "1px solid #eee"
    });
    if (freeze) td.className = "grouped-tables-col-frozen";
    td.colSpan = dimColCount;
    td.textContent = label;
    tr.appendChild(td);
    forEachValueCol(function (m, pk) {
      var vtd = document.createElement("td");
      Object.assign(vtd.style, {
        fontWeight: "bold", padding: "6px 8px", textAlign: "right",
        borderTop: "1px solid #ccc", borderBottom: "1px solid #eee"
      });
      vtd.textContent = formatValue(sumRows(rows, m.name, pk));
      tr.appendChild(vtd);
    });
    return tr;
  },

  // ---------------------------------------------------------------------------
  // Header rendering
  // ---------------------------------------------------------------------------

  _renderHeader: function (thead, ctx) {
    var self = this;
    var h    = ctx.hierarchy;
    var cfg  = ctx.cfg;

    function appendDimCells(row, rowSpan) {
      ctx.displayDims.forEach(function (dim, i) {
        var th = self._th(cfg.headerColor, { textAlign: "left" });
        if (cfg.freeze && i === 0) th.className = "grouped-tables-col-frozen";
        th.rowSpan = rowSpan;
        th.textContent = self._fieldLabel(dim, "Row");
        row.appendChild(th);
      });
    }

    function appendMeasureRow() {
      var mRow = document.createElement("tr");
      ctx.forEachValueCol(function (m) {
        var th = self._th(cfg.headerColor, { textAlign: "center" });
        th.textContent = ctx.measureLabels[m.name] || m.name;
        mRow.appendChild(th);
      });
      thead.appendChild(mRow);
    }

    function displayLabel(pk) {
      var raw = ctx.pivotLabels[pk] || pk;
      return self._isNullPivot(raw) ? "" : String(raw).trim();
    }

    if (h.isHierarchical && ctx.pivotMeta.length) {
      var totalHeaderRows = 1 + h.levelCount + (cfg.showMeasureHeaders ? 1 : 0);
      for (var level = 0; level < h.levelCount; level++) {
        var row = document.createElement("tr");
        if (level === 0) appendDimCells(row, totalHeaderRows);
        var groups = h.groupConsecutive(ctx.pivotKeys, function (pk) { return h.getTuple(pk, level); });
        ctx.measures.forEach(function () {
          var ki = 0;
          groups.forEach(function (g) {
            var th = self._th(cfg.headerColor, { textAlign: cfg.pivotAlign });
            th.colSpan = g.count;
            th.textContent = h.getPart(ctx.pivotKeys[ki], level);
            ki += g.count;
            row.appendChild(th);
          });
        });
        thead.appendChild(row);
      }
      if (cfg.showMeasureHeaders) appendMeasureRow();
    } else {
      var totalHeaderRows = 1 + (cfg.showMeasureHeaders ? 1 : 0);
      var pRow = document.createElement("tr");
      appendDimCells(pRow, totalHeaderRows);
      if (ctx.pivotMeta.length) {
        ctx.forEachValueCol(function (_m, pk) {
          var th = self._th(cfg.headerColor, { textAlign: cfg.pivotAlign });
          th.textContent = displayLabel(pk);
          pRow.appendChild(th);
        });
      } else {
        ctx.measures.forEach(function (m) {
          var th = self._th(cfg.headerColor, { textAlign: cfg.pivotAlign });
          th.textContent = ctx.pivotLabels[m.name] || m.name;
          pRow.appendChild(th);
        });
      }
      thead.appendChild(pRow);
      if (cfg.showMeasureHeaders) appendMeasureRow();
    }
  },

  // ---------------------------------------------------------------------------
  // Freeze stylesheet (pure CSS, no inline-style loops)
  // ---------------------------------------------------------------------------

  _freezeStyleSheet: function (headerColor) {
    var style = document.createElement("style");
    style.textContent = [
      ".grouped-tables-scroll-wrapper { -webkit-overflow-scrolling: touch; }",
      ".grouped-tables-frozen { border-collapse: separate; border-spacing: 0; }",
      ".grouped-tables-frozen .grouped-tables-col-frozen {",
      "  position: sticky !important; left: 0 !important;",
      "  z-index: 1; background: #fff;",
      "  border-right: 1px solid #d9d9d9;",
      "  box-shadow: none;",
      "  background-clip: padding-box;",
      "  min-width: 10em;",
      "}",
      ".grouped-tables-frozen thead .grouped-tables-col-frozen {",
      "  z-index: 2;",
      "  background: " + headerColor + " !important;",
      "  color: #fff !important;",
      "}",
      ".grouped-tables-frozen tbody .grouped-tables-col-frozen {",
      "  background: #fff !important;",
      "}",
      ".grouped-tables-frozen .grouped-tables-section-label {",
      "  z-index: 3;",
      "}"
    ].join("\n");
    return style;
  }
});
