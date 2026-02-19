// grouped_tables_custom_viz.js
// Looker custom visualization: Grouped Tables
// Table with pivoted columns (colored header), optional measure headers,
// section grouping by dimension, optional sub-totals, and spacing between sections.

looker.plugins.visualizations.add({

  id: "grouped_tables_grouped_tables",
  label: "Grouped Tables",

  options: {
    // --- Header style ---
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

    // --- Display ---
    replaceZeroWithDash: {
      type: "boolean",
      label: "Replace 0 with \"-\"",
      default: true,
      section: "Display",
      order: 5
    },
    freezeNonMeasureColumns: {
      type: "boolean",
      label: "Freeze non-measure columns (scroll to see pivoted values)",
      default: true,
      section: "Display",
      order: 6
    },

    // --- Grouping ---
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
      min: 0,
      max: 80,
      step: 4,
      section: "Grouping",
      order: 12
    },

    // --- Table total ---
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
      values: [
        { "Top": "top" },
        { "Bottom": "bottom" }
      ],
      default: "bottom",
      section: "Table total",
      order: 21
    }
  },

  create: function (element, config) {
    this._element = element;
    element.innerHTML = "";
    var container = document.createElement("div");
    container.className = "grouped-tables-container";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.overflow = "auto";
    element.appendChild(container);
  },

  _getConfig: function (config, key, defaultValue) {
    return config[key] !== undefined ? config[key] : defaultValue;
  },

  _getNumericValue: function (measureObj) {
    if (!measureObj) return 0;
    var val = Number(measureObj.value);
    return isFinite(val) ? val : 0;
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    var self = this;
    var container = element.querySelector(".grouped-tables-container");
    if (!container) {
      this.create(element, config);
      container = element.querySelector(".grouped-tables-container");
    }

    var dims = queryResponse.fields.dimension_like || [];
    var measures = queryResponse.fields.measure_like || [];
    var pivots = queryResponse.fields.pivots || [];
    var pivotMeta = queryResponse.pivots || [];

    if (!dims.length) {
      container.innerHTML = "<p>Add at least one dimension.</p>";
      done();
      return;
    }
    if (!measures.length) {
      container.innerHTML = "<p>Add at least one measure.</p>";
      done();
      return;
    }

    // Dynamic "Group by" dropdown: show column labels (not backend names); no blank option
    var groupByValues = [{ "No sections": "__none__" }];
    dims.forEach(function (d) {
      var displayLabel = d.label || d.label_short || d.name;
      groupByValues.push({ [displayLabel]: d.name });
    });
    var newOptions = Object.assign({}, this.options);
    newOptions.groupByDimension = newOptions.groupByDimension || {};
    newOptions.groupByDimension.values = groupByValues;
    newOptions.groupByDimension.default = dims.length >= 2 ? dims[0].name : "__none__";
    this.options = newOptions;
    this.trigger("registerOptions", newOptions);

    var groupByField = (self._getConfig(config, "groupByDimension", "__none__") || "").trim();
    if (groupByField === "" || groupByField === "__none__") {
      groupByField = dims.length >= 2 ? dims[0].name : "__none__";
      config.groupByDimension = groupByField;
    }
    var showMeasureHeaders = !!self._getConfig(config, "showMeasureHeaders", true);
    var showSubTotals = !!self._getConfig(config, "showSubTotals", true);
    var sectionSpacing = Number(self._getConfig(config, "sectionSpacing", 24)) || 24;
    var headerColor = (self._getConfig(config, "pivotedHeaderColor", "#215C98") || "#215C98").trim();
    var replaceZeroWithDash = !!self._getConfig(config, "replaceZeroWithDash", true);
    var freezeNonMeasureColumns = !!self._getConfig(config, "freezeNonMeasureColumns", true);
    var showTableTotal = !!self._getConfig(config, "showTableTotal", false);
    var tableTotalPositionRaw = self._getConfig(config, "tableTotalPosition", "bottom") || self._getConfig(config, "table_total_position", "bottom");
    var tableTotalPosition = (String(tableTotalPositionRaw || "").toLowerCase().indexOf("top") >= 0) ? "top" : "bottom";

    // Resolve group-by dimension (config may store backend name or display label)
    var groupDim = null;
    if (groupByField && groupByField !== "__none__") {
      groupDim = dims.find(function (d) { return d.name === groupByField; });
      if (!groupDim) {
        groupDim = dims.find(function (d) {
          var L = d.label || d.label_short || d.name;
          return L === groupByField;
        });
      }
    }

    // Row label dimension: first dimension that isn't the group-by
    var rowLabelDim = dims.find(function (d) { return d !== groupDim; }) || dims[0];

    // Pivot keys and labels (pivoted columns)
    var pivotKeys = [];
    var pivotLabels = {};
    if (pivotMeta.length) {
      pivotKeys = pivotMeta.map(function (p) { return p.key; });
      pivotMeta.forEach(function (p) {
        pivotLabels[p.key] = p.is_total ? "Total" : (p.label_short || p.label || p.key);
      });
    } else {
      // No pivot: one "column" per measure
      pivotKeys = measures.map(function (m) { return m.name; });
      measures.forEach(function (m) {
        pivotLabels[m.name] = m.label_short || m.label || m.name;
      });
    }

    // Parse pivot key into levels (try multiple delimiters: | , en-dash, hyphen, colon)
    var PIVOT_DELIMITERS = [ "|", "\u2013", "\u2014", " - ", " – ", " — ", "::", ":" ];
    function parsePivotKey(pk) {
      var s = String(pk || "");
      for (var d = 0; d < PIVOT_DELIMITERS.length; d++) {
        var delim = PIVOT_DELIMITERS[d];
        if (s.indexOf(dim) >= 0) {
          var parts = s.split(delim).map(function (p) { return p.trim(); });
          if (parts.length >= 2) return parts;
        }
      }
      return [ s ];
    }
    var pivotKeyParts = pivotKeys.map(parsePivotKey);
    var numLevels = pivotKeyParts.length ? Math.max.apply(null, pivotKeyParts.map(function (p) { return p.length; })) : 0;
    var middleIsMeasure = numLevels >= 3 && measures.some(function (m) {
      return pivotKeyParts.some(function (parts) { return parts[1] === m.name; });
    });
    var pivotLevelCount = (middleIsMeasure && numLevels >= 3) ? 2 : (numLevels >= 2 ? Math.min(numLevels, 10) : 1);
    var hasHierarchicalPivots = pivotKeys.length > 0 && numLevels >= 2;
    function getPivotPart(pk, levelIndex) {
      var parts = parsePivotKey(pk);
      if (middleIsMeasure && parts.length >= 3) {
        if (levelIndex === 0) return parts[0];
        if (levelIndex === 1) return parts[2];
        return parts[levelIndex];
      }
      return parts[levelIndex] != null ? parts[levelIndex] : pk;
    }
    function groupConsecutiveBy(arr, fn) {
      var groups = [];
      var i = 0;
      while (i < arr.length) {
        var val = fn(arr[i]);
        var count = 0;
        while (i < arr.length && fn(arr[i]) === val) { count++; i++; }
        groups.push({ value: val, count: count });
      }
      return groups;
    }

    // Measure labels for measure header row
    var measureLabels = {};
    measures.forEach(function (m) {
      measureLabels[m.name] = m.label_short || m.label || m.name;
    });

    // Build sections: array of { sectionLabel, rows: [row, ...] }
    var sections = [];
    var sectionMap = {};

    function getGroupKey(row) {
      if (!groupDim) return null;
      var cell = row[groupDim.name];
      return cell && cell.value != null ? String(cell.value) : "";
    }

    function getRowLabel(row) {
      var cell = row[rowLabelDim.name];
      return cell && cell.value != null ? String(cell.value) : "";
    }

    data.forEach(function (row) {
      var gkey = getGroupKey(row);
      if (!sectionMap[gkey]) {
        sectionMap[gkey] = { sectionLabel: gkey || "(No section)", rows: [] };
        sections.push(sectionMap[gkey]);
      }
      sectionMap[gkey].rows.push(row);
    });

    // If no grouping, one section with all rows
    if (!groupDim) {
      sections = [{ sectionLabel: null, rows: data }];
    }

    // Build table DOM
    var table = document.createElement("table");
    table.className = "grouped-tables-table" + (freezeNonMeasureColumns ? " grouped-tables-frozen" : "");
    table.setAttribute("border", "0");
    table.setAttribute("cellpadding", "6");
    table.setAttribute("cellspacing", "0");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
    table.style.fontFamily = "inherit";
    table.style.fontSize = "14px";
    if (freezeNonMeasureColumns) {
      table.style.minWidth = "max-content";
    }

    var thead = document.createElement("thead");
    var tbody = document.createElement("tbody");

    var headerBg = headerColor;
    var headerFg = "#ffffff";

    function styleTh(el) {
      el.style.backgroundColor = headerBg;
      el.style.color = headerFg;
      el.style.textDecoration = "underline";
      el.style.fontWeight = "bold";
      el.style.border = "1px solid " + headerBg;
      el.style.padding = "8px";
    }

    var rowLabelText = rowLabelDim.label_short || rowLabelDim.label || rowLabelDim.name;
    var numHeaderRows = 1 + (hasHierarchicalPivots ? pivotLevelCount : 0) + (showMeasureHeaders ? 1 : 0);

    if (hasHierarchicalPivots && pivotMeta.length) {
      // --- Traditional Looker-style: one header row per pivot level, then measure row
      function getPartTuple(pk, upToLevel) {
        var parts = parsePivotKey(pk);
        if (middleIsMeasure && parts.length >= 3) {
          var out = [ parts[0] ];
          if (upToLevel >= 1) out.push(parts[2]);
          return out.join("\0");
        }
        return parts.slice(0, upToLevel + 1).join("\0");
      }
      for (var level = 0; level < pivotLevelCount; level++) {
        var row = document.createElement("tr");
        if (level === 0) {
          var thFirst = document.createElement("th");
          styleTh(thFirst);
          thFirst.style.textAlign = "left";
          thFirst.rowSpan = numHeaderRows;
          thFirst.textContent = rowLabelText;
          row.appendChild(thFirst);
        }
        var groups = groupConsecutiveBy(pivotKeys, function (pk) { return getPartTuple(pk, level); });
        measures.forEach(function () {
          var keyIndex = 0;
          groups.forEach(function (g) {
            var th = document.createElement("th");
            styleTh(th);
            th.style.textAlign = "center";
            th.colSpan = g.count;
            th.textContent = getPivotPart(pivotKeys[keyIndex], level);
            keyIndex += g.count;
            row.appendChild(th);
          });
        });
        thead.appendChild(row);
      }
      if (showMeasureHeaders) {
        var measureRow = document.createElement("tr");
        measures.forEach(function (measure) {
          pivotKeys.forEach(function () {
            var th = document.createElement("th");
            styleTh(th);
            th.style.textAlign = "center";
            th.textContent = measureLabels[measure.name] || measure.name;
            measureRow.appendChild(th);
          });
        });
        thead.appendChild(measureRow);
      }
    } else {
      // --- Single-level pivot headers (no "|" in keys)
      var pivotHeaderRow = document.createElement("tr");
      var pivotHeaderFirst = document.createElement("th");
      styleTh(pivotHeaderFirst);
      pivotHeaderFirst.style.textAlign = "left";
      pivotHeaderFirst.rowSpan = numHeaderRows;
      pivotHeaderFirst.textContent = rowLabelText;
      pivotHeaderRow.appendChild(pivotHeaderFirst);

      if (pivotMeta.length) {
        measures.forEach(function () {
          pivotKeys.forEach(function (pk) {
            var th = document.createElement("th");
            styleTh(th);
            th.style.textAlign = "center";
            th.textContent = pivotLabels[pk] || pk;
            pivotHeaderRow.appendChild(th);
          });
        });
      } else {
        measures.forEach(function (m) {
          var th = document.createElement("th");
          styleTh(th);
          th.style.textAlign = "center";
          th.textContent = pivotLabels[m.name] || m.name;
          pivotHeaderRow.appendChild(th);
        });
      }
      thead.appendChild(pivotHeaderRow);

      if (showMeasureHeaders) {
        var measureRow = document.createElement("tr");
        measures.forEach(function (measure) {
          (pivotMeta.length ? pivotKeys : [measure.name]).forEach(function () {
            var th = document.createElement("th");
            styleTh(th);
            th.style.textAlign = "center";
            th.textContent = measureLabels[measure.name] || measure.name;
            measureRow.appendChild(th);
          });
        });
        thead.appendChild(measureRow);
      }
    }
    table.appendChild(thead);

    function cellValue(row, measureName, pivotKey) {
      if (pivotMeta.length) {
        var measureObj = row[measureName] && row[measureName][pivotKey];
        return self._getNumericValue(measureObj);
      }
      var measureObj = row[measureName];
      return self._getNumericValue(measureObj);
    }

    function formatValue(val) {
      if (val == null || isNaN(val)) return "";
      if (replaceZeroWithDash && Number(val) === 0) return "\u2013"; // en dash
      if (Number(val) === Math.floor(val)) return String(Math.floor(val));
      return Number(val).toFixed(1);
    }

    var tableTotalSpacing = 24;
    function makeSpacerRow() {
      var tr = document.createElement("tr");
      var spacerCell = document.createElement("td");
      spacerCell.colSpan = 1 + (pivotMeta.length ? measures.length * pivotKeys.length : measures.length);
      spacerCell.style.height = tableTotalSpacing + "px";
      spacerCell.style.border = "none";
      spacerCell.style.background = "transparent";
      spacerCell.style.padding = "0";
      spacerCell.style.lineHeight = "0";
      tr.appendChild(spacerCell);
      return tr;
    }
    function makeTableTotalRow() {
      var tr = document.createElement("tr");
      tr.className = "grouped-tables-table-total-row";
      var totalLabel = document.createElement("td");
      totalLabel.style.fontWeight = "bold";
      totalLabel.style.padding = (tableTotalSpacing + 6) + "px 8px " + (tableTotalSpacing + 6) + "px";
      totalLabel.style.borderTop = "2px solid #ccc";
      totalLabel.style.borderBottom = "1px solid #eee";
      totalLabel.textContent = "Total";
      tr.appendChild(totalLabel);
      if (pivotMeta.length) {
        measures.forEach(function (measure) {
          pivotKeys.forEach(function (pk) {
            var sum = 0;
            data.forEach(function (row) {
              sum += cellValue(row, measure.name, pk);
            });
            var td = document.createElement("td");
            td.style.fontWeight = "bold";
            td.style.padding = (tableTotalSpacing + 6) + "px 8px";
            td.style.textAlign = "right";
            td.style.borderTop = "1px solid #ccc";
            td.style.borderBottom = "1px solid #eee";
            td.textContent = formatValue(sum);
            tr.appendChild(td);
          });
        });
      } else {
        measures.forEach(function (m) {
          var sum = 0;
          data.forEach(function (row) {
            sum += cellValue(row, m.name, m.name);
          });
          var td = document.createElement("td");
          td.style.fontWeight = "bold";
          td.style.padding = (tableTotalSpacing + 6) + "px 8px";
          td.style.textAlign = "right";
          td.style.borderTop = "1px solid #ccc";
          td.style.borderBottom = "1px solid #eee";
          td.textContent = formatValue(sum);
          tr.appendChild(td);
        });
      }
      return tr;
    }

    sections.forEach(function (section, sectionIndex) {
      if (sectionSpacing > 0 && sectionIndex > 0) {
        var spacerRow = document.createElement("tr");
        var spacerCell = document.createElement("td");
        spacerCell.colSpan = 1 + (pivotMeta.length ? measures.length * pivotKeys.length : measures.length);
        spacerCell.style.height = sectionSpacing + "px";
        spacerCell.style.border = "none";
        spacerCell.style.background = "transparent";
        spacerRow.appendChild(spacerCell);
        tbody.appendChild(spacerRow);
      }

      if (groupDim && section.sectionLabel != null) {
        var sectionRow = document.createElement("tr");
        if (freezeNonMeasureColumns) sectionRow.className = "grouped-tables-section-header";
        var sectionCell = document.createElement("td");
        sectionCell.colSpan = 1 + (pivotMeta.length ? measures.length * pivotKeys.length : measures.length);
        sectionCell.style.fontWeight = "bold";
        sectionCell.style.textDecoration = "underline";
        sectionCell.style.padding = "8px 6px 4px 6px";
        sectionCell.style.borderBottom = "1px solid #ccc";
        sectionCell.textContent = section.sectionLabel;
        sectionRow.appendChild(sectionCell);
        tbody.appendChild(sectionRow);
      }

      section.rows.forEach(function (row) {
        var tr = document.createElement("tr");
        var tdLabel = document.createElement("td");
        tdLabel.style.padding = "6px 8px";
        tdLabel.style.borderBottom = "1px solid #eee";
        tdLabel.textContent = getRowLabel(row);
        tr.appendChild(tdLabel);

        if (pivotMeta.length) {
          measures.forEach(function (measure) {
            pivotKeys.forEach(function (pk) {
              var td = document.createElement("td");
              td.style.padding = "6px 8px";
              td.style.textAlign = "right";
              td.style.borderBottom = "1px solid #eee";
              td.textContent = formatValue(cellValue(row, measure.name, pk));
              tr.appendChild(td);
            });
          });
        } else {
          measures.forEach(function (m) {
            var td = document.createElement("td");
            td.style.padding = "6px 8px";
            td.style.textAlign = "right";
            td.style.borderBottom = "1px solid #eee";
            td.textContent = formatValue(cellValue(row, m.name, m.name));
            tr.appendChild(td);
          });
        }
        tbody.appendChild(tr);
      });

      if (showSubTotals && section.rows.length > 0) {
        var totalRow = document.createElement("tr");
        var totalLabel = document.createElement("td");
        totalLabel.style.fontWeight = "bold";
        totalLabel.style.padding = "6px 8px";
        totalLabel.style.borderTop = "1px solid #ccc";
        totalLabel.style.borderBottom = "1px solid #eee";
        totalLabel.textContent = "Total";
        totalRow.appendChild(totalLabel);

        if (pivotMeta.length) {
          measures.forEach(function (measure) {
            pivotKeys.forEach(function (pk) {
              var sum = 0;
              section.rows.forEach(function (row) {
                sum += cellValue(row, measure.name, pk);
              });
              var td = document.createElement("td");
              td.style.fontWeight = "bold";
              td.style.padding = "6px 8px";
              td.style.textAlign = "right";
              td.style.borderTop = "1px solid #ccc";
              td.style.borderBottom = "1px solid #eee";
              td.textContent = formatValue(sum);
              totalRow.appendChild(td);
            });
          });
        } else {
          measures.forEach(function (m) {
            var sum = 0;
            section.rows.forEach(function (row) {
              sum += cellValue(row, m.name, m.name);
            });
            var td = document.createElement("td");
            td.style.fontWeight = "bold";
            td.style.padding = "6px 8px";
            td.style.textAlign = "right";
            td.style.borderTop = "1px solid #ccc";
            td.style.borderBottom = "1px solid #eee";
            td.textContent = formatValue(sum);
            totalRow.appendChild(td);
          });
        }
        tbody.appendChild(totalRow);
      }
    });

    if (showTableTotal) {
      var tableTotalRow = makeTableTotalRow();
      var spacerBefore = makeSpacerRow();
      var spacerAfter = makeSpacerRow();
      if (tableTotalPosition === "top") {
        tbody.insertBefore(spacerAfter, tbody.firstChild);
        tbody.insertBefore(tableTotalRow, tbody.firstChild);
        tbody.insertBefore(spacerBefore, tbody.firstChild);
      } else {
        tbody.appendChild(spacerBefore);
        tbody.appendChild(tableTotalRow);
        tbody.appendChild(spacerAfter);
      }
    }

    table.appendChild(tbody);
    container.innerHTML = "";
    container.appendChild(table);
    if (freezeNonMeasureColumns) {
      var style = document.createElement("style");
      style.textContent =
        ".grouped-tables-frozen thead th:first-child," +
        ".grouped-tables-frozen tbody td:first-child:not([colspan]) {" +
        "position: sticky; left: 0; z-index: 1; background: #fff; box-shadow: 2px 0 4px rgba(0,0,0,0.08);" +
        "}" +
        ".grouped-tables-frozen thead th:first-child { z-index: 2; }" +
        ".grouped-tables-frozen .grouped-tables-section-header td {" +
        "position: sticky; top: 0; z-index: 1; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.08);" +
        "}";
      container.appendChild(style);
      [].forEach.call(container.querySelectorAll(".grouped-tables-frozen thead th:first-child"), function (th) {
        th.style.backgroundColor = headerColor;
        th.style.minWidth = "10em";
      });
      [].forEach.call(container.querySelectorAll(".grouped-tables-frozen tbody td:first-child:not([colspan])"), function (td) {
        td.style.minWidth = "10em";
        td.style.backgroundColor = "#fff";
      });
      [].forEach.call(container.querySelectorAll(".grouped-tables-frozen .grouped-tables-section-header td"), function (td) {
        td.style.backgroundColor = "#fff";
      });
    }
    done();
  }
});
