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
    valueFormatPreset: {
      type: "string",
      label: "Value format",
      display: "select",
      section: "Display",
      order: 5.5,
      default: "__default__",
      values: [
        { "Default formatting": "__default__" },
        { "Decimals (0) \u2014 1,235": "dec_0" },
        { "Decimals (1) \u2014 1,234.6": "dec_1" },
        { "Decimals (2) \u2014 1,234.57": "dec_2" },
        { "Percent (0) \u2014 123,457%": "pct_0" },
        { "Percent (1) \u2014 123,456.7%": "pct_1" },
        { "Percent (2) \u2014 123,456.68%": "pct_2" },
        { "U.S. Dollars (0) \u2014 $1,235": "usd_0" },
        { "U.S. Dollars (2) \u2014 $1,234.57": "usd_2" },
        { "Custom...": "__custom__" }
      ]
    },
    customValueFormat: {
      type: "string",
      label: "Custom value format",
      default: "",
      display: "text",
      placeholder: "Examples: $#,##0.00, 0.0%, 0.000,, \"M\"",
      description: "Value format syntax docs: https://docs.cloud.google.com/looker/docs/custom-formatting?version=26.2&is_cloud_provider_native=false",
      hidden: true,
      section: "Display",
      order: 5.6
    },
    freezeNonMeasureColumns: {
      type: "boolean",
      label: "Freeze non-measure columns",
      default: true,
      section: "Display",
      order: 6
    },
    tableFontFamily: {
      type: "string",
      label: "Font family",
      display: "select",
      section: "Display",
      order: 7,
      default: "Cambria, serif",
      values: [
        { "Cambria": "Cambria, serif" },
        { "Arial": "Arial, sans-serif" },
        { "Calibri": "Calibri, sans-serif" },
        { "Georgia": "Georgia, serif" },
        { "Tahoma": "Tahoma, sans-serif" },
        { "Times New Roman": "\"Times New Roman\", serif" },
        { "Verdana": "Verdana, sans-serif" }
      ]
    },
    pivotColumnWidthMode: {
      type: "string",
      label: "Column width",
      display: "select",
      section: "Display",
      order: 8,
      default: "auto",
      values: [
        { "Auto width": "auto" },
        { "Custom width": "custom" }
      ]
    },
    pivotColumnWidthPx: {
      type: "number",
      label: "Custom pivot width (px)",
      section: "Display",
      order: 8.1,
      default: 120,
      hidden: true
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
  // Helpers
  // ---------------------------------------------------------------------------

  _num: function (obj) {
    if (!obj) return 0;
    var v = Number(obj.value);
    return isFinite(v) ? v : 0;
  },

  _renderedValue: function (cell) {
    if (!cell) return null;
    return (cell.rendered != null && cell.rendered !== "") ? cell.rendered : cell.value;
  },

  _fieldLabel: function (field, fallback) {
    if (!field) return fallback;
    return String(field.label_short || field.label || field.name || fallback || "").trim() || fallback;
  },

  _cellText: function (cell, fallback) {
    var v = this._renderedValue(cell);
    return (v == null || String(v).trim() === "") ? (fallback || "") : String(v);
  },

  _isNullPivot: function (val) {
    if (val == null) return true;
    var s = String(val).trim();
    return s === "" || s === "null" || s.indexOf("___null") >= 0;
  },

  // ---------------------------------------------------------------------------
  // Value formatting
  // ---------------------------------------------------------------------------

  _VALUE_FORMAT_MAP: {
    dec_0: "#,##0",     dec_1: "#,##0.0",     dec_2: "#,##0.00",
    pct_0: "0%",        pct_1: "0.0%",        pct_2: "0.00%",
    usd_0: "$#,##0",    usd_2: "$#,##0.00"
  },

  _resolveValueFormat: function (preset, custom) {
    var p = String(preset || "__default__").trim();
    if (p === "__custom__") return String(custom || "").trim();
    if (p === "__default__") return "";
    return this._VALUE_FORMAT_MAP[p] || "";
  },

  _applyValueFormat: function (val, pattern) {
    if (val == null || isNaN(val)) return "";
    var fmt = String(pattern || "").trim();
    if (!fmt) return String(val);

    var sections = fmt.split(";");
    var isNeg = Number(val) < 0;
    var active = (isNeg && sections[1]) ? sections[1] : sections[0];
    var parenNeg = active.indexOf("(") >= 0 && active.indexOf(")") >= 0;
    var absVal = Math.abs(Number(val));

    var hasPct = /(^|[^\\])%/.test(active);
    if (hasPct) absVal *= 100;

    var literals = [];
    active.replace(/"([^"]*)"/g, function (_m, txt) { literals.push(txt); return _m; });

    var core = active
      .replace(/\(.*?\)/g, "")
      .replace(/"[^"]*"/g, "")
      .replace(/\\%/g, "%")
      .replace(/%/g, "")
      .trim();

    var currency = (core.match(/^([$\u00a3\u20ac])/) || [])[1] || "";
    var firstDigit = core.search(/[0#]/);
    var lastDigit = Math.max(core.lastIndexOf("0"), core.lastIndexOf("#"));
    var numPart = (firstDigit >= 0 && lastDigit >= firstDigit) ? core.slice(firstDigit, lastDigit + 1) : "";

    var dot = numPart.indexOf(".");
    var fracPattern = dot >= 0 ? numPart.slice(dot + 1) : "";
    var minFrac = (fracPattern.match(/0/g) || []).length;
    var maxFrac = fracPattern.length;
    var useGrouping = numPart.indexOf(",") >= 0;

    var trailingCommas = 0;
    var trimmed = numPart;
    while (trimmed.endsWith(",")) { trailingCommas++; trimmed = trimmed.slice(0, -1); }
    if (trailingCommas > 0) absVal /= Math.pow(1000, trailingCommas);

    var numText = absVal.toLocaleString(undefined, {
      minimumFractionDigits: minFrac,
      maximumFractionDigits: maxFrac,
      useGrouping: useGrouping
    });

    var out = currency + numText + literals.join("");
    if (hasPct) out += "%";
    if (isNeg && !parenNeg) out = "-" + out;
    if (isNeg && parenNeg) out = "(" + out + ")";
    return out;
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
    var dims        = qr.fields.dimension_like || [];
    var measures    = qr.fields.measure_like  || [];
    var pivotMeta   = qr.pivots || [];
    var pivotFields = qr.fields.pivots || [];
    var hasPivots   = pivotMeta.length > 0;

    if (!dims.length)     { container.innerHTML = "<p>Add at least one dimension.</p>"; return; }
    if (!measures.length) { container.innerHTML = "<p>Add at least one measure.</p>";   return; }

    self._registerDynamicOptions(config, dims);
    var cfg = self._resolveConfig(config, dims);

    var pivot       = self._analyzePivots(pivotMeta, measures, pivotFields);
    var pivotKeys   = pivot.keys;
    var hierarchy   = self._analyzeHierarchy(pivotMeta, pivotFields, pivotKeys);
    var valueFormat = self._resolveValueFormat(cfg.valueFormatPreset, cfg.valueFormatCustom);

    var displayDims = cfg.groupDim
      ? dims.filter(function (d) { return d !== cfg.groupDim; })
      : dims.slice();
    if (!displayDims.length) displayDims = [dims[0]];

    var dimColCount   = displayDims.length;
    var valueColCount = hasPivots ? measures.length * pivotKeys.length : measures.length;
    var totalColCount = dimColCount + valueColCount;

    function forEachValueCol(cb) {
      if (hasPivots) {
        measures.forEach(function (m) { pivotKeys.forEach(function (pk) { cb(m, pk); }); });
      } else {
        measures.forEach(function (m) { cb(m, m.name); });
      }
    }

    function cellValue(row, mName, pk) {
      return self._num(hasPivots ? (row[mName] && row[mName][pk]) : row[mName]);
    }

    function sumRows(rows, mName, pk) {
      var s = 0;
      rows.forEach(function (r) { s += cellValue(r, mName, pk); });
      return s;
    }

    function formatValue(val) {
      if (val == null || isNaN(val)) return "";
      if (cfg.replaceZero && Number(val) === 0) return "\u2013";
      if (valueFormat) return self._applyValueFormat(val, valueFormat);
      return Number(val) === Math.floor(val) ? String(Math.floor(val)) : Number(val).toFixed(1);
    }

    var valueColStyle = cfg.valueColWidthMode === "custom"
      ? { width: cfg.valueColWidthPx + "px", minWidth: cfg.valueColWidthPx + "px", maxWidth: cfg.valueColWidthPx + "px" }
      : null;

    // --- Build table ---
    var sections = self._buildSections(data, cfg.groupDim);
    var table = self._createTable(cfg.freeze, cfg.fontFamily);
    var thead = document.createElement("thead");
    var tbody = document.createElement("tbody");

    var measureLabels = {};
    measures.forEach(function (m) { measureLabels[m.name] = self._fieldLabel(m, m.name); });

    self._renderHeader(thead, {
      displayDims: displayDims, measures: measures, pivotMeta: pivotMeta,
      pivotKeys: pivotKeys, pivotLabels: pivot.labels, pivotFields: pivotFields,
      hierarchy: hierarchy, measureLabels: measureLabels,
      cfg: cfg, forEachValueCol: forEachValueCol, valueColStyle: valueColStyle
    });
    table.appendChild(thead);

    // --- Body: sections ---
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
          var tdStyle = { padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #eee" };
          if (valueColStyle) Object.assign(tdStyle, valueColStyle);
          var td = self._td(tdStyle);
          td.textContent = formatValue(cellValue(row, m.name, pk));
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      if (cfg.showSubTotals && section.rows.length > 0) {
        tbody.appendChild(self._makeTotalRow("Total", section.rows, dimColCount, cfg.freeze, forEachValueCol, sumRows, formatValue, valueColStyle));
      }
    });

    // --- Table total ---
    if (cfg.showTableTotal) {
      var ttRow = self._makeTotalRow(cfg.tableTotalLabel, data, dimColCount, cfg.freeze, forEachValueCol, sumRows, formatValue, valueColStyle);
      ttRow.className = "grouped-tables-table-total-row";
      [].forEach.call(ttRow.children, function (cell) { cell.style.borderTop = "2px solid #ccc"; });
      var spacer = cfg.sectionSpacing > 0 ? self._makeSpacerRow(totalColCount, cfg.sectionSpacing) : null;
      if (cfg.tableTotalPosition === "top") {
        if (spacer) tbody.insertBefore(spacer, tbody.firstChild);
        tbody.insertBefore(ttRow, tbody.firstChild);
      } else {
        if (spacer) tbody.appendChild(spacer);
        tbody.appendChild(ttRow);
      }
    }

    table.appendChild(tbody);

    // --- Mount ---
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

  _registerDynamicOptions: function (config, dims) {
    var self = this;
    var values = [{ "No sections": "__none__" }];
    dims.forEach(function (d) { values.push({ [self._fieldLabel(d, d.name)]: d.name }); });
    var opts = Object.assign({}, this.options);
    opts.groupByDimension = Object.assign({}, opts.groupByDimension, {
      values: values,
      default: dims.length >= 2 ? dims[0].name : "__none__"
    });
    opts.customValueFormat = Object.assign({}, opts.customValueFormat, {
      hidden: (String(config.valueFormatPreset || "__default__").trim()) !== "__custom__"
    });
    opts.pivotColumnWidthPx = Object.assign({}, opts.pivotColumnWidthPx, {
      hidden: (String(config.pivotColumnWidthMode || "auto").trim()) !== "custom"
    });
    this.options = opts;
    this.trigger("registerOptions", opts);
  },

  _resolveConfig: function (config, dims) {
    var self = this;

    function str(key, fallback) {
      var v = config[key];
      return (v != null ? String(v).trim() : "") || fallback;
    }
    function bool(key, fallback) {
      return config[key] != null ? !!config[key] : fallback;
    }
    function num(key, fallback) {
      var v = Number(config[key]);
      return isFinite(v) ? v : fallback;
    }

    var groupByField = str("groupByDimension", dims.length >= 2 ? dims[0].name : "__none__");
    var groupDim = null;
    if (groupByField !== "__none__") {
      groupDim = dims.find(function (d) { return d.name === groupByField; })
              || dims.find(function (d) { return self._fieldLabel(d, d.name) === groupByField; })
              || null;
    }

    return {
      groupDim:           groupDim,
      showMeasureHeaders: bool("showMeasureHeaders", true),
      showSubTotals:      bool("showSubTotals", true),
      sectionSpacing:     Math.max(0, num("sectionSpacing", 24)),
      headerColor:        str("pivotedHeaderColor", "#215C98"),
      pivotAlign:         str("pivotHeaderAlignment", "left").toLowerCase() === "center" ? "center" : "left",
      replaceZero:        bool("replaceZeroWithDash", true),
      freeze:             bool("freezeNonMeasureColumns", true),
      fontFamily:         str("tableFontFamily", "Cambria, serif"),
      valueColWidthMode:  str("pivotColumnWidthMode", "auto"),
      valueColWidthPx:    Math.max(40, num("pivotColumnWidthPx", 120)),
      showTableTotal:     bool("showTableTotal", false),
      tableTotalPosition: (str("tableTotalPosition", "") || str("table_total_position", "bottom")).indexOf("top") >= 0 ? "top" : "bottom",
      tableTotalLabel:    str("tableTotalLabel", "Total"),
      valueFormatPreset:  str("valueFormatPreset", "__default__"),
      valueFormatCustom:  str("customValueFormat", "")
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

  _analyzePivots: function (pivotMeta, measures, pivotFields) {
    var self = this;
    var keys = [], labels = {};

    if (pivotMeta.length) {
      keys = pivotMeta.map(function (p) { return p.key; });
      pivotMeta.forEach(function (p) {
        if (p.is_total) { labels[p.key] = "Total"; return; }

        if (p.data && pivotFields && pivotFields.length > 0) {
          var parts = [];
          pivotFields.forEach(function (f) {
            var v = self._renderedValue(p.data[f.name]);
            if (v != null && !self._isNullPivot(v)) parts.push(String(v).trim());
          });
          if (parts.length > 0) { labels[p.key] = parts.join(" \u2013 "); return; }
        }

        var l = String(p.label_short || p.label || p.key || "");
        if (l.indexOf("|FIELD|") >= 0) l = l.split("|FIELD|")[0].trim();
        labels[p.key] = self._isNullPivot(l) ? "" : l;
      });
    } else {
      keys = measures.map(function (m) { return m.name; });
      measures.forEach(function (m) { labels[m.name] = self._fieldLabel(m, m.name); });
    }

    return { keys: keys, labels: labels };
  },

  _analyzeHierarchy: function (pivotMeta, pivotFields, pivotKeys) {
    var self = this;
    var numPivotFields = pivotFields.length;

    var pivotMap = {};
    pivotMeta.forEach(function (p) { pivotMap[p.key] = p; });

    var hasStructuredData = numPivotFields > 0 && pivotMeta.length > 0 &&
      pivotMeta[0].data != null && typeof pivotMeta[0].data === "object";

    var levelCount, isHierarchical;

    if (numPivotFields > 0) {
      levelCount = numPivotFields;
      isHierarchical = numPivotFields >= 2;
    } else if (pivotMeta.length > 0 && pivotKeys.length > 0) {
      var parsed = pivotKeys.map(function (pk) { return self._parsePivotKey(pk); });
      var maxParts = Math.max.apply(null, parsed.map(function (p) { return p.length; }));
      levelCount = maxParts;
      isHierarchical = maxParts >= 2;
    } else {
      levelCount = pivotMeta.length > 0 ? 1 : 0;
      isHierarchical = false;
    }

    var keyParts = {};
    pivotKeys.forEach(function (pk) {
      var entry = pivotMap[pk];
      var parsed = self._parsePivotKey(pk);
      if (numPivotFields > 0 && parsed.length > numPivotFields) parsed = parsed.slice(0, numPivotFields);

      var parts = [];
      for (var l = 0; l < levelCount; l++) {
        var cell = null;
        if (hasStructuredData && entry && entry.data && pivotFields[l]) {
          var raw = entry.data[pivotFields[l].name];
          if (raw != null) {
            cell = (typeof raw === "object") ? raw : { value: raw, rendered: String(raw) };
          }
        }
        if (!cell && parsed[l] != null) {
          cell = { value: parsed[l], rendered: parsed[l] };
        }
        parts.push(cell || { value: "", rendered: "" });
      }
      keyParts[pk] = parts;
    });

    function getPart(pk, level) {
      if (level >= levelCount) return "";
      var entry = pivotMap[pk];
      if (entry && entry.is_total) return level === 0 ? "Total" : "";
      var val = self._renderedValue(keyParts[pk] && keyParts[pk][level]);
      return (val == null || self._isNullPivot(val)) ? "" : String(val).trim();
    }

    function getTuple(pk, upToLevel) {
      var parts = keyParts[pk] || [];
      var out = [];
      for (var l = 0; l <= upToLevel && l < levelCount; l++) {
        var cell = parts[l];
        out.push(cell ? String(cell.value != null ? cell.value : "") : "");
      }
      return out.join("\0");
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

  _createTable: function (freeze, fontFamily) {
    var table = document.createElement("table");
    table.className = "grouped-tables-table" + (freeze ? " grouped-tables-frozen" : "");
    table.setAttribute("border", "0");
    table.setAttribute("cellpadding", "6");
    table.setAttribute("cellspacing", "0");
    Object.assign(table.style, {
      borderCollapse: "collapse",
      width: "100%",
      tableLayout: "auto",
      fontFamily: fontFamily || "Cambria, serif",
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

  _makeTotalRow: function (label, rows, dimColCount, freeze, forEachValueCol, sumRows, formatValue, valueColStyle) {
    var self = this;
    var style = { fontWeight: "bold", padding: "6px 8px", borderTop: "1px solid #ccc", borderBottom: "1px solid #eee" };
    var tr = document.createElement("tr");
    var td = self._td(style);
    if (freeze) td.className = "grouped-tables-col-frozen";
    td.colSpan = dimColCount;
    td.textContent = label;
    tr.appendChild(td);
    forEachValueCol(function (m, pk) {
      var vtdStyle = Object.assign({}, style, { textAlign: "right" });
      if (valueColStyle) Object.assign(vtdStyle, valueColStyle);
      var vtd = self._td(vtdStyle);
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
    var h   = ctx.hierarchy;
    var cfg = ctx.cfg;

    function makePivotTh(text) {
      var thStyle = { textAlign: cfg.pivotAlign };
      if (ctx.valueColStyle) Object.assign(thStyle, ctx.valueColStyle);
      var th = self._th(cfg.headerColor, thStyle);
      th.textContent = text;
      return th;
    }

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
        var thStyle = { textAlign: "center" };
        if (ctx.valueColStyle) Object.assign(thStyle, ctx.valueColStyle);
        var th = self._th(cfg.headerColor, thStyle);
        th.textContent = ctx.measureLabels[m.name] || m.name;
        mRow.appendChild(th);
      });
      thead.appendChild(mRow);
    }

    function pivotLabel(pk) {
      var raw = ctx.pivotLabels[pk] || pk;
      return self._isNullPivot(raw) ? "" : String(raw).trim();
    }

    var totalHeaderRows;

    if (h.isHierarchical && ctx.pivotMeta.length) {
      totalHeaderRows = h.levelCount + (cfg.showMeasureHeaders ? 1 : 0);
      for (var level = 0; level < h.levelCount; level++) {
        var row = document.createElement("tr");
        if (level === 0) appendDimCells(row, totalHeaderRows);
        var groups = h.groupConsecutive(ctx.pivotKeys, function (pk) { return h.getTuple(pk, level); });
        ctx.measures.forEach(function () {
          var ki = 0;
          groups.forEach(function (g) {
            var th = makePivotTh(h.getPart(ctx.pivotKeys[ki], level));
            th.colSpan = g.count;
            ki += g.count;
            row.appendChild(th);
          });
        });
        thead.appendChild(row);
      }
    } else {
      totalHeaderRows = 1 + (cfg.showMeasureHeaders ? 1 : 0);
      var pRow = document.createElement("tr");
      appendDimCells(pRow, totalHeaderRows);
      ctx.forEachValueCol(function (_m, pk) {
        pRow.appendChild(makePivotTh(pivotLabel(pk)));
      });
      thead.appendChild(pRow);
    }

    if (cfg.showMeasureHeaders) appendMeasureRow();
  },

  // ---------------------------------------------------------------------------
  // Freeze stylesheet
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
