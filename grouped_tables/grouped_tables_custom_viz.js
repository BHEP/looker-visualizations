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

    // --- Grouping ---
    groupByDimension: {
      type: "string",
      label: "Group by (dimension for sections)",
      default: "",
      display: "select",
      section: "Grouping",
      order: 10,
      values: [{ "": "No sections" }]
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

    // Dynamic "Group by" dropdown: list of dimensions
    var groupByValues = [{ "": "No sections" }];
    dims.forEach(function (d) {
      var label = d.label_short || d.label || d.name;
      groupByValues.push({ [d.name]: label });
    });
    var newOptions = Object.assign({}, this.options);
    newOptions.groupByDimension = newOptions.groupByDimension || {};
    newOptions.groupByDimension.values = groupByValues;
    this.options = newOptions;
    this.trigger("registerOptions", newOptions);

    var groupByField = (self._getConfig(config, "groupByDimension", "") || "").trim();
    var showMeasureHeaders = !!self._getConfig(config, "showMeasureHeaders", true);
    var showSubTotals = !!self._getConfig(config, "showSubTotals", true);
    var sectionSpacing = Number(self._getConfig(config, "sectionSpacing", 24)) || 24;
    var headerColor = (self._getConfig(config, "pivotedHeaderColor", "#215C98") || "#215C98").trim();

    // Resolve group-by dimension
    var groupDim = null;
    if (groupByField) {
      groupDim = dims.find(function (d) { return d.name === groupByField; });
      if (!groupDim) groupDim = dims.find(function (d) { return d.label_short === groupByField || d.label === groupByField; });
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
    table.className = "grouped-tables-table";
    table.setAttribute("border", "0");
    table.setAttribute("cellpadding", "6");
    table.setAttribute("cellspacing", "0");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
    table.style.fontFamily = "inherit";
    table.style.fontSize = "14px";

    var thead = document.createElement("thead");
    var tbody = document.createElement("tbody");

    var headerBg = headerColor;
    var headerFg = "#ffffff";

    // Measure header row (optional): one cell per pivot column
    if (showMeasureHeaders && pivotKeys.length) {
      var measureRow = document.createElement("tr");
      var thFirst = document.createElement("th");
      thFirst.style.backgroundColor = headerBg;
      thFirst.style.color = headerFg;
      thFirst.style.textDecoration = "underline";
      thFirst.style.textAlign = "left";
      thFirst.style.fontWeight = "bold";
      thFirst.style.border = "1px solid " + headerBg;
      thFirst.style.padding = "8px";
      thFirst.textContent = rowLabelDim.label_short || rowLabelDim.label || rowLabelDim.name;
      measureRow.appendChild(thFirst);

      measures.forEach(function (measure) {
        var keysForMeasure = pivotMeta.length
          ? pivotKeys
          : [measure.name];
        keysForMeasure.forEach(function () {
          var th = document.createElement("th");
          th.style.backgroundColor = headerBg;
          th.style.color = headerFg;
          th.style.textDecoration = "underline";
          th.style.textAlign = "center";
          th.style.fontWeight = "bold";
          th.style.border = "1px solid " + headerBg;
          th.style.padding = "8px";
          th.textContent = measureLabels[measure.name] || measure.name;
          measureRow.appendChild(th);
        });
      });
      thead.appendChild(measureRow);
    }

    // Column header row: row label + pivot column names
    var headerRow = document.createElement("tr");
    var h0 = document.createElement("th");
    h0.style.backgroundColor = headerBg;
    h0.style.color = headerFg;
    h0.style.textDecoration = "underline";
    h0.style.textAlign = "left";
    h0.style.fontWeight = "bold";
    h0.style.border = "1px solid " + headerBg;
    h0.style.padding = "8px";
    h0.textContent = rowLabelDim.label_short || rowLabelDim.label || rowLabelDim.name;
    headerRow.appendChild(h0);

    if (pivotMeta.length) {
      measures.forEach(function () {
        pivotKeys.forEach(function (pk) {
          var th = document.createElement("th");
          th.style.backgroundColor = headerBg;
          th.style.color = headerFg;
          th.style.textDecoration = "underline";
          th.style.textAlign = "center";
          th.style.fontWeight = "bold";
          th.style.border = "1px solid " + headerBg;
          th.style.padding = "8px";
          th.textContent = pivotLabels[pk] || pk;
          headerRow.appendChild(th);
        });
      });
    } else {
      measures.forEach(function (m) {
        var th = document.createElement("th");
        th.style.backgroundColor = headerBg;
        th.style.color = headerFg;
        th.style.textDecoration = "underline";
        th.style.textAlign = "center";
        th.style.fontWeight = "bold";
        th.style.border = "1px solid " + headerBg;
        th.style.padding = "8px";
        th.textContent = pivotLabels[m.name] || m.name;
        headerRow.appendChild(th);
      });
    }
    thead.appendChild(headerRow);
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
      if (Number(val) === Math.floor(val)) return String(Math.floor(val));
      return Number(val).toFixed(1);
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

    table.appendChild(tbody);
    container.innerHTML = "";
    container.appendChild(table);
    done();
  }
});
