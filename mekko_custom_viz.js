// mekko_custom_viz.js
// Custom Looker visualization: stacked Mekko (Marimekko) chart using Highcharts variwide

looker.plugins.visualizations.add({

  id: "mekko_mekko",
  label: "Mekko (Stacked Variwide)",

  options: {
    // --- Data options ---
    valueMeasureField: {
      type: "string",
      label: "Value Measure (field name)",
      default: "notion_project_form.total_percent_of_time",
      display: "text",
      section: "Data",
      order: 1
    },
    sortOrder: {
      type: "string",
      label: "Sort Segments",
      display: "select",
      values: [
        { "None": "none" },
        { "By Value (Ascending)": "value_asc" },
        { "By Value (Descending)": "value_desc" },
        { "By Name (A-Z)": "name_asc" },
        { "By Name (Z-A)": "name_desc" }
      ],
      default: "value_desc",
      section: "Data",
      order: 2
    },

    // --- Display toggles ---
    showDataLabels: {
      type: "boolean",
      label: "Show Data Labels",
      default: true,
      section: "Display",
      order: 10
    },
    showLegend: {
      type: "boolean",
      label: "Show Legend",
      default: false,
      section: "Display",
      order: 11
    },
    showYAxisLabels: {
      type: "boolean",
      label: "Show Y-Axis Labels",
      default: false,
      section: "Display",
      order: 12
    },
    columnSpacing: {
      type: "number",
      label: "Gap Size (columns & segments)",
      default: 0.01,
      min: 0,
      max: 0.3,
      step: 0.0001,
      section: "Display",
      order: 13
    },
    showWidthUnderCategory: {
      type: "boolean",
      label: "Show Column Width % Under Category",
      default: true,
      section: "Display",
      order: 14
    },

    // --- Text: Series labels ---
    seriesLabelFontFamily: {
      type: "string",
      label: "Series Labels – Font Family",
      default: "Cambria",
      display: "text",
      section: "Text",
      order: 20
    },
    seriesLabelFontSize: {
      type: "string",
      label: "Series Labels – Font Size",
      default: "14px",
      display: "text",
      section: "Text",
      order: 21
    },
    seriesLabelFontColor: {
      type: "string",
      label: "Series Labels – Font Colour",
      default: "#ffffff",
      display: "text",
      section: "Text",
      order: 22
    },
    seriesLabelBold: {
      type: "boolean",
      label: "Series Labels – Bold",
      default: true,
      section: "Text",
      order: 23
    },
    seriesLabelItalic: {
      type: "boolean",
      label: "Series Labels – Italic",
      default: false,
      section: "Text",
      order: 24
    },

    // --- Text: X-axis labels (dimension) ---
    xAxisLabelFontFamily: {
      type: "string",
      label: "X-Axis Labels – Font Family",
      default: "Cambria",
      display: "text",
      section: "Text",
      order: 30
    },
    xAxisLabelFontSize: {
      type: "string",
      label: "X-Axis Labels – Font Size",
      default: "14px",
      display: "text",
      section: "Text",
      order: 31
    },
    xAxisLabelBold: {
      type: "boolean",
      label: "X-Axis Labels – Bold",
      default: true,
      section: "Text",
      order: 32
    },
    xAxisLabelItalic: {
      type: "boolean",
      label: "X-Axis Labels – Italic",
      default: false,
      section: "Text",
      order: 33
    },

    // --- Text: Column width labels (under category) ---
    widthLabelFontFamily: {
      type: "string",
      label: "Width Labels – Font Family",
      default: "Cambria",
      display: "text",
      section: "Text",
      order: 40
    },
    widthLabelFontSize: {
      type: "string",
      label: "Width Labels – Font Size",
      default: "14px",
      display: "text",
      section: "Text",
      order: 41
    },
    widthLabelBold: {
      type: "boolean",
      label: "Width Labels – Bold",
      default: true,
      section: "Text",
      order: 42
    },
    widthLabelItalic: {
      type: "boolean",
      label: "Width Labels – Italic",
      default: true,
      section: "Text",
      order: 43
    },

    // --- Text: Y-axis labels (simple) ---
    yAxisLabelFontSize: {
      type: "string",
      label: "Y-Axis Labels – Font Size",
      default: "14px",
      display: "text",
      section: "Text",
      order: 50
    }
  },

  _highchartsPromise: null,
  _element: null,

  // Helper: Extract numeric value from measure object
  _getNumericValue: function(measureObj) {
    if (!measureObj) return 0;
    var val = Number(measureObj.value);
    return isFinite(val) ? val : 0;
  },

  // Helper: Get config value with default
  _getConfig: function(config, key, defaultValue) {
    return config[key] !== undefined ? config[key] : defaultValue;
  },

  // Helper: Build CSS font style string
  _buildFontStyle: function(fontSize, fontFamily, bold, italic) {
    return "font-size:" + fontSize +
           ";font-family:" + fontFamily +
           ";font-weight:" + (bold ? "bold" : "normal") +
           ";font-style:" + (italic ? "italic" : "normal") + ";";
  },

  create: function(element, config) {
    this._element = element;
    element.innerHTML = "";
    var container = document.createElement("div");
    container.id = "mekko_chart_container";
    container.style.width = "100%";
    container.style.height = "100%";
    element.appendChild(container);

    if (!this._highchartsPromise) {
      this._highchartsPromise = new Promise(function(resolve, reject) {
        function loadScript(src) {
          return new Promise(function(res, rej) {
            var s = document.createElement("script");
            s.src = src;
            s.async = true;
            s.onload = res;
            s.onerror = rej;
            document.head.appendChild(s);
          });
        }

        var base = "https://code.highcharts.com/";
        loadScript(base + "highcharts.js")
          .then(function() {
            return loadScript(base + "modules/variwide.js");
          })
          .then(function() {
            resolve(window.Highcharts);
          })
          .catch(reject);
      });
    }
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    var self = this;
    var container = element.querySelector("#mekko_chart_container");
    if (!container) {
      this.create(element, config);
      container = element.querySelector("#mekko_chart_container");
    }

    // Validation
    if (queryResponse.fields.dimension_like.length !== 1) {
      element.innerHTML = "This visualization requires exactly 1 dimension (x-axis).";
      done();
      return;
    }
    if (!queryResponse.fields.pivots || queryResponse.fields.pivots.length !== 1) {
      element.innerHTML = "This visualization requires exactly 1 pivoted dimension (for stacks).";
      done();
      return;
    }

    var xDim = queryResponse.fields.dimension_like[0];
    var valueFieldName = this._getConfig(config, "valueMeasureField", "notion_project_form.total_percent_of_time");

    var valueField = queryResponse.fields.measure_like.find(function(f) {
      return f.name === valueFieldName;
    });
    if (!valueField) {
      element.innerHTML = "Value measure field not found: " + valueFieldName;
      done();
      return;
    }

    // Extract categories (x-axis)
    var categories = Array.from(new Set(data.map(function(row) {
      return row[xDim.name].value;
    })));

    // Get visible pivot keys (not hidden in data table)
    var allPivotKeys = queryResponse.pivots.map(function(p) { return p.key; });
    var visiblePivotKeys = allPivotKeys.filter(function(pk) {
      return data.some(function(row) {
        var cell = row[valueFieldName] && row[valueFieldName][pk];
        return cell && !cell.hidden;
      });
    });

    // Build pivot labels
    var pivotLabels = {};
    visiblePivotKeys.forEach(function(pk) {
      var p = queryResponse.pivots.find(function(pp) { return pp.key === pk; });
      pivotLabels[pk] = p ? (p.is_total ? "Total" : (p.label_short || p.key)) : pk;
    });

    // Sort segments if needed
    var sortOrder = this._getConfig(config, "sortOrder", "none");
    if (sortOrder !== "none") {
      // Calculate total value for each series across all categories
      var seriesTotals = {};
      visiblePivotKeys.forEach(function(pk) {
        var total = 0;
        data.forEach(function(row) {
          var measureObj = row[valueFieldName] && row[valueFieldName][pk];
          total += self._getNumericValue(measureObj);
        });
        seriesTotals[pk] = total;
      });

      // Sort visiblePivotKeys
      visiblePivotKeys.sort(function(a, b) {
        var aTotal = seriesTotals[a] || 0;
        var bTotal = seriesTotals[b] || 0;
        var aLabel = pivotLabels[a] || a;
        var bLabel = pivotLabels[b] || b;
        
        switch (sortOrder) {
          case "value_asc":
            return aTotal - bTotal;
          case "value_desc":
            return bTotal - aTotal;
          case "name_asc":
            return aLabel.localeCompare(bLabel);
          case "name_desc":
            return bLabel.localeCompare(aLabel);
          default:
            return 0;
        }
      });
    }

    // Build per-series options (after sorting)
    var newOptions = Object.assign({}, this.options);
    var baseSeriesColors = ["#62bad4", "#55996F", "#6F8DB9", "#364D6E", "#4C6C9C"];

    // FIRST: Set all config values BEFORE registering options (critical for UI to show them as selected)
    visiblePivotKeys.forEach(function(pk, idx) {
      var colorOptKey = "series_color_" + idx;
      var defaultColor = baseSeriesColors[idx % baseSeriesColors.length];
      
      // Force set config value if missing - this makes Looker UI show it as selected
      if (config[colorOptKey] === undefined || config[colorOptKey] === null || config[colorOptKey] === "") {
        config[colorOptKey] = defaultColor;
      }
    });

    // SECOND: Build option definitions
    visiblePivotKeys.forEach(function(pk, idx) {
      var baseLabel = pivotLabels[pk];
      
      // Label override option
      var labelOptKey = "series_label_override_" + idx;
      if (!newOptions[labelOptKey]) {
        newOptions[labelOptKey] = {
          type: "string",
          label: baseLabel,
          display: "text",
          section: "Series",
          order: 40 + idx
        };
      }

      var overrideLabel = config[labelOptKey];
      var finalLabel = (overrideLabel && overrideLabel.trim() !== "") ? overrideLabel.trim() : baseLabel;
      pivotLabels[pk] = finalLabel;

      // Color option - ensure default matches what we set in config
      var colorOptKey = "series_color_" + idx;
      var defaultColor = baseSeriesColors[idx % baseSeriesColors.length];
      var currentColor = config[colorOptKey] || defaultColor;
      
      if (!newOptions[colorOptKey]) {
        newOptions[colorOptKey] = {
          type: "string",
          label: finalLabel,
          display: "color",
          section: "Colours",
          order: 80 + idx,
          default: defaultColor
        };
      } else {
        newOptions[colorOptKey].label = finalLabel;
        newOptions[colorOptKey].default = defaultColor;
      }
      
      // Ensure config has the value (redundant but ensures it's set)
      config[colorOptKey] = currentColor;
    });

    // Register options - config values are already set, so UI will show them as selected
    this.options = newOptions;
    this.trigger("registerOptions", newOptions);

    // Compute row totals per category and grand total
    var rowTotalsByCategory = {};
    data.forEach(function(row) {
      var xLabel = row[xDim.name].value;
      var rowTotal = 0;
      visiblePivotKeys.forEach(function(pk) {
        var measureObj = row[valueFieldName] && row[valueFieldName][pk];
        rowTotal += self._getNumericValue(measureObj);
      });
      rowTotalsByCategory[xLabel] = (rowTotalsByCategory[xLabel] || 0) + rowTotal;
    });

    var grandTotal = Object.values(rowTotalsByCategory).reduce(function(sum, v) {
      return sum + v;
    }, 0);

    if (grandTotal === 0) {
      element.innerHTML = "No data or all values are zero.";
      done();
      return;
    }

    // Normalized widths for column sizing
    var normalizedWidths = {};
    categories.forEach(function(cat) {
      normalizedWidths[cat] = (rowTotalsByCategory[cat] || 0) / grandTotal;
    });

    // Build category index map
    var categoryIndexByLabel = {};
    categories.forEach(function(cat, idx) {
      categoryIndexByLabel[cat] = idx;
    });

    // Calculate gap settings
    var gap = this._getConfig(config, "columnSpacing", 0.01);
    var pointPadding = gap * 0.01;
    var groupPadding = gap * 0.01;
    var segmentBorderWidth = gap <= 0 ? 0 : 1;

    // Build series configuration
    var series = visiblePivotKeys.map(function(pivotKey, idx) {
      return {
        name: pivotLabels[pivotKey],
        type: "variwide",
        data: [],
        stacking: "percent",
        borderWidth: segmentBorderWidth,
        borderColor: "rgba(255,255,255,1)",
        animation: false,
        dataLabels: {
          enabled: !!self._getConfig(config, "showDataLabels", true),
          style: {
            fontSize: self._getConfig(config, "seriesLabelFontSize", "14px"),
            color: self._getConfig(config, "seriesLabelFontColor", "#ffffff"),
            textOutline: "none",
            fontWeight: self._getConfig(config, "seriesLabelBold", true) ? "bold" : "normal",
            fontStyle: self._getConfig(config, "seriesLabelItalic", false) ? "italic" : "normal",
            fontFamily: self._getConfig(config, "seriesLabelFontFamily", "Cambria")
          },
          formatter: function() {
            return (this.y && this.y > 0) ? this.series.name : null;
          }
        }
      };
    });

    // Map pivot keys to series indices
    var seriesIndexByPivot = {};
    visiblePivotKeys.forEach(function(pk, idx) {
      seriesIndexByPivot[pk] = idx;
    });

    // Populate series data
    data.forEach(function(row) {
      var xLabel = row[xDim.name].value;
      var xIndex = categoryIndexByLabel[xLabel];

      visiblePivotKeys.forEach(function(pk) {
        var measureObj = row[valueFieldName] && row[valueFieldName][pk];
        var val = self._getNumericValue(measureObj);
        var sIdx = seriesIndexByPivot[pk];
        var s = series[sIdx];

        if (!s.data[xIndex]) {
          s.data[xIndex] = {
            x: xIndex,
            y: 0,
            z: normalizedWidths[xLabel],
            name: xLabel
          };
        }
        s.data[xIndex].y += val;
      });
    });

    // Fill missing points with zero-height
    series.forEach(function(s) {
      s.data = categories.map(function(cat, idx) {
        return s.data[idx] || {
          x: idx,
          y: 0,
          z: normalizedWidths[cat],
          name: cat
        };
      });
    });

    // Apply colors
    series.forEach(function(s, idx) {
      var colorKey = "series_color_" + idx;
      var chosenColor = config[colorKey] || newOptions[colorKey].default;
      if (chosenColor) {
        s.color = chosenColor;
      }
    });

    // Extract font style settings
    var labelWeight = this._getConfig(config, "seriesLabelBold", true) ? "bold" : "normal";
    var labelStyle = this._getConfig(config, "seriesLabelItalic", false) ? "italic" : "normal";
    var labelFamily = this._getConfig(config, "seriesLabelFontFamily", "Cambria");
    var showWidthUnderCategory = !!this._getConfig(config, "showWidthUnderCategory", false);
    var xLabelFontSize = this._getConfig(config, "xAxisLabelFontSize", "14px");
    var xLabelFontFamily = this._getConfig(config, "xAxisLabelFontFamily", "Cambria");
    var xLabelBold = !!this._getConfig(config, "xAxisLabelBold", false);
    var xLabelItalic = !!this._getConfig(config, "xAxisLabelItalic", false);
    var widthLabelFontSize = this._getConfig(config, "widthLabelFontSize", "14px");
    var widthLabelFontFamily = this._getConfig(config, "widthLabelFontFamily", "Cambria");
    var widthLabelBold = !!this._getConfig(config, "widthLabelBold", false);
    var widthLabelItalic = this._getConfig(config, "widthLabelItalic", true);

    // Draw chart
    this._highchartsPromise
      .then(function(Highcharts) {
        Highcharts.chart(container, {
          chart: {
            type: "variwide",
            zoomType: "x",
            backgroundColor: "rgba(0,0,0,0)",
            spacingLeft: 20,
            spacingRight: 20,
            animation: false
          },
          title: { text: null },
          xAxis: {
            type: "category",
            categories: categories,
            title: { text: null },
            labels: {
              useHTML: showWidthUnderCategory,
              formatter: function() {
                var cat = this.value;
                var catStyle = self._buildFontStyle(xLabelFontSize, xLabelFontFamily, xLabelBold, xLabelItalic);

                if (!showWidthUnderCategory) {
                  return '<span style="' + catStyle + '">' + cat + "</span>";
                }

                var frac = normalizedWidths[cat] || 0;
                var pct = (frac * 100).toFixed(1) + "%";
                var widthStyle = self._buildFontStyle(widthLabelFontSize, widthLabelFontFamily, widthLabelBold, widthLabelItalic);

                return '<span style="' + catStyle + '">' + cat +
                       '<br/><span style="' + widthStyle + '">' + pct + "</span></span>";
              },
              style: showWidthUnderCategory ? {} : {
                fontSize: xLabelFontSize,
                fontFamily: xLabelFontFamily,
                fontWeight: xLabelBold ? "bold" : "normal",
                fontStyle: xLabelItalic ? "italic" : "normal"
              }
            }
          },
          yAxis: {
            title: { text: null },
            labels: {
              enabled: !!self._getConfig(config, "showYAxisLabels", false),
              formatter: function() {
                return this.value + "%";
              },
              style: {
                fontSize: self._getConfig(config, "yAxisLabelFontSize", "14px")
              }
            },
            min: 0
          },
          legend: {
            enabled: !!self._getConfig(config, "showLegend", false),
            itemStyle: {
              fontWeight: labelWeight,
              fontStyle: labelStyle,
              fontFamily: labelFamily
            }
          },
          tooltip: {
            useHTML: true,
            formatter: function() {
              var cat = this.point.name;
              var widthFrac = normalizedWidths[cat] || 0;
              var widthPct = (widthFrac * 100).toFixed(1) + "%";
              var nameStyled = '<span style="font-weight:' + labelWeight +
                               ";font-style:" + labelStyle +
                               ";font-family:" + labelFamily + ';">' +
                               this.series.name + "</span>";
              return "<b>" + cat + "</b><br/>" + nameStyled + ": <b>" +
                     this.y.toFixed(1) + "</b><br/>" +
                     "Column width (of total): <b>" + widthPct + "</b>";
            }
          },
          plotOptions: {
            series: {
              stacking: "percent",
              animation: false
            },
            variwide: {
              pointPadding: pointPadding,
              groupPadding: groupPadding
            }
          },
          series: series,
          credits: { enabled: false }
        });
      })
      .catch(function(err) {
        element.innerHTML = "Error loading Highcharts: " + err;
      })
      .finally(function() {
        done();
      });
  }
});
