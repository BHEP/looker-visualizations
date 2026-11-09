/*
 * bar_table_custom_viz.js
 * Bar + Table: chart on top, transposed data table underneath, sharing one x-axis (one column per x value).
 * Each measure / table calculation can be placed in the chart, the table, both, or hidden.
 *
 * Native column-chart and table settings keys are read as fallbacks, so switching an existing
 * Looker column chart or table to this visualization keeps: series_colors, series_labels,
 * series_types, y_axes (side, label, min/max), hidden_fields, stacking, show_value_labels,
 * point_style, hide_legend, legend_position, y_axis_gridlines, show_y_axis_labels,
 * show_x_axis_label, x_axis_label, table_theme, header_font_size, rows_font_size,
 * header_text_alignment, cell_text_alignment, header_font_bold.
 */
(function () {
  "use strict";

  const PALETTE = [
    "#3EB0D5", "#B1399E", "#C2DD67", "#592EC2", "#4276BE", "#72D16D",
    "#FFD95F", "#B32F37", "#9174F0", "#E57947", "#75E2E2", "#FBB555",
  ];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const FONT = 'Roboto, "Noto Sans", "Noto Sans JP", Helvetica, Arial, sans-serif';
  const NS = "http://www.w3.org/2000/svg";
  const TEXT_COLOR = "#262D33";
  const MUTED = "#707781";

  const THEMES = {
    white: { headerBg: "#F5F6F7", rowBg: "#FFFFFF", altBg: "#FFFFFF", border: "#E4E5E6" },
    gray: { headerBg: "#E9EBED", rowBg: "#FFFFFF", altBg: "#F5F6F7", border: "#E4E5E6" },
    transparent: { headerBg: "transparent", rowBg: "transparent", altBg: "transparent", border: "#E4E5E6" },
    unstyled: { headerBg: "transparent", rowBg: "transparent", altBg: "transparent", border: "transparent" },
  };

  const CSS = `
    .bt-root { font-family: ${FONT}; color: ${TEXT_COLOR}; height: 100%; display: flex;
      flex-direction: column; position: relative; overflow: hidden; }
    .bt-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 4px 8px 6px; font-size: 12px;
      flex: 0 0 auto; }
    .bt-legend-item { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; color: ${MUTED}; }
    .bt-scroll { flex: 1 1 auto; overflow: auto; position: relative; }
    .bt-inner { position: relative; }
    .bt-chart { display: flex; }
    .bt-axis { position: sticky; background: #FFFFFF; z-index: 2; flex: 0 0 auto; }
    .bt-axis.left { left: 0; }
    .bt-axis.right { right: 0; }
    .bt-table { border-collapse: separate; border-spacing: 0; table-layout: fixed; }
    .bt-table th, .bt-table td { padding: 0 4px; overflow: hidden; white-space: nowrap;
      text-overflow: ellipsis; box-sizing: border-box; }
    .bt-table .bt-sticky-l { position: sticky; left: 0; z-index: 1; text-align: left; padding-left: 8px; }
    .bt-table .bt-sticky-r { position: sticky; right: 0; z-index: 1; }
    .bt-table td.bt-drill { cursor: pointer; }
    .bt-table .bt-hl { background-color: rgba(66, 118, 190, 0.12) !important; }
    .bt-vert { writing-mode: vertical-rl; transform: rotate(180deg); display: inline-block; }
    .bt-tip { position: absolute; pointer-events: none; background: #262D33; color: #FFFFFF; font-size: 12px;
      padding: 6px 8px; border-radius: 4px; z-index: 10; display: none; white-space: nowrap; line-height: 1.5; }
    .bt-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px;
      vertical-align: middle; flex: 0 0 auto; }
    .bt-empty { padding: 16px; color: ${MUTED}; font-size: 13px; }
  `;

  const BASE_OPTIONS = {
    // Plot
    stacking: {
      section: "Plot", order: 1, type: "string", display: "select", label: "Stacking", default: "",
      values: [{ None: "" }, { Stacked: "normal" }, { "Stacked percentage": "percent" }],
    },
    show_value_labels: { section: "Plot", order: 2, type: "boolean", label: "Value labels", default: false },
    point_style: {
      section: "Plot", order: 3, type: "string", display: "select", label: "Line point style", default: "circle",
      values: [{ None: "none" }, { Filled: "circle" }, { Outline: "circle_outline" }],
    },
    hide_legend: { section: "Plot", order: 4, type: "boolean", label: "Hide legend", default: false },
    legend_position: {
      section: "Plot", order: 5, type: "string", display: "select", label: "Legend align", default: "center",
      values: [{ Left: "left" }, { Center: "center" }, { Right: "right" }],
    },
    bt_chart_min_height: {
      section: "Plot", order: 6, type: "number", label: "Minimum chart height (px)", default: 140,
    },

    // Y
    y_axis_gridlines: { section: "Y", order: 1, type: "boolean", label: "Gridlines", default: true },
    show_y_axis_labels: { section: "Y", order: 2, type: "boolean", label: "Show axis titles", default: true },
    bt_left_label: { section: "Y", order: 3, type: "string", label: "Left axis title", placeholder: "Auto" },
    bt_left_min: { section: "Y", order: 4, type: "string", label: "Left min", placeholder: "Auto", display_size: "half" },
    bt_left_max: { section: "Y", order: 5, type: "string", label: "Left max", placeholder: "Auto", display_size: "half" },
    bt_right_label: { section: "Y", order: 6, type: "string", label: "Right axis title", placeholder: "Auto" },
    bt_right_min: { section: "Y", order: 7, type: "string", label: "Right min", placeholder: "Auto", display_size: "half" },
    bt_right_max: { section: "Y", order: 8, type: "string", label: "Right max", placeholder: "Auto", display_size: "half" },

    // X
    show_x_axis_label: { section: "X", order: 1, type: "boolean", label: "Show axis title", default: true },
    x_axis_label: { section: "X", order: 2, type: "string", label: "Axis title", placeholder: "Dimension label" },
    bt_header_format: {
      section: "X", order: 3, type: "string", display: "select", label: "Date label format", default: "auto",
      values: [
        { "Auto (short date)": "auto" }, { "As rendered": "rendered" },
        { "Short (Jan 4)": "short" }, { "Short with year (Jan 4 '26)": "short_year" },
      ],
    },

    // Table
    table_theme: {
      section: "Table", order: 1, type: "string", display: "select", label: "Table theme", default: "white",
      values: [{ White: "white" }, { Gray: "gray" }, { Transparent: "transparent" }, { Unstyled: "unstyled" }],
    },
    header_font_size: { section: "Table", order: 2, type: "string", label: "Header text size", default: "12", display_size: "half" },
    rows_font_size: { section: "Table", order: 3, type: "string", label: "Cell text size", default: "12", display_size: "half" },
    header_font_bold: { section: "Table", order: 4, type: "boolean", label: "Bold header", default: false },
    header_text_alignment: {
      section: "Table", order: 5, type: "string", display: "select", label: "Header alignment", default: "center",
      values: [{ Left: "left" }, { Center: "center" }, { Right: "right" }],
    },
    cell_text_alignment: {
      section: "Table", order: 6, type: "string", display: "select", label: "Cell alignment", default: "center",
      values: [{ Left: "left" }, { Center: "center" }, { Right: "right" }],
    },
    bt_min_col_width: {
      section: "Table", order: 7, type: "number", label: "Minimum column width (px)", placeholder: "Fit to values",
    },
  };

  // ---------- helpers ----------

  const measureCtx = document.createElement("canvas").getContext("2d");
  function textWidth(t, size, bold) {
    measureCtx.font = `${bold ? "600 " : ""}${size}px ${FONT}`;
    return measureCtx.measureText(String(t)).width;
  }

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function el(tag, cls, parent, style) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (style) Object.assign(e.style, style);
    if (parent) parent.appendChild(e);
    return e;
  }

  function optKey(name) {
    return name.replace(/[^A-Za-z0-9_]/g, "_");
  }

  function cellText(cell) {
    if (!cell) return "";
    try {
      if (window.LookerCharts) return LookerCharts.Utils.textForCell(cell);
    } catch (e) { /* fall through */ }
    if (cell.rendered != null) return String(cell.rendered);
    return cell.value == null ? "∅" : String(cell.value);
  }

  function cellHtml(cell) {
    if (!cell) return "";
    try {
      if (window.LookerCharts) return LookerCharts.Utils.htmlForCell(cell);
    } catch (e) { /* fall through */ }
    const span = document.createElement("span");
    span.textContent = cellText(cell);
    return span.innerHTML;
  }

  function cellNumber(cell) {
    if (!cell || cell.value == null || cell.value === "") return null;
    const v = typeof cell.value === "number" ? cell.value : parseFloat(cell.value);
    return isFinite(v) ? v : null;
  }

  function valueKind(field) {
    const vf = `${field.value_format || ""} ${field.value_format_name || ""}`;
    if (/%|percent/i.test(vf)) return "percent";
    if (/\$|usd/i.test(vf)) return "usd";
    return "number";
  }

  function parseNum(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  }

  function niceNum(range, round) {
    if (range <= 0) return 1;
    const exp = Math.floor(Math.log10(range));
    const f = range / Math.pow(10, exp);
    let nf;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, exp);
  }

  function buildScale(dataMin, dataMax, userMin, userMax) {
    let min = userMin != null ? userMin : dataMin;
    let max = userMax != null ? userMax : dataMax;
    if (min === max) {
      if (max === 0) max = 1;
      else if (max > 0) min = 0;
      else max = 0;
    }
    const step = niceNum(niceNum(max - min, false) / 4, true);
    if (userMin == null) min = Math.floor(min / step) * step;
    if (userMax == null) max = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-6; v += step) {
      ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }
    return { min, max, step, ticks };
  }

  function formatTick(v, kind, step) {
    if (kind === "percent") {
      const d = step < 0.01 ? 1 : 0;
      return `${(v * 100).toFixed(d)}%`;
    }
    const pre = kind === "usd" ? "$" : "";
    const sign = v < 0 ? "-" : "";
    const a = Math.abs(v);
    const trim = (x) => parseFloat(x.toFixed(1)).toString();
    if (a >= 1e9) return `${sign}${pre}${trim(a / 1e9)}B`;
    if (a >= 1e6) return `${sign}${pre}${trim(a / 1e6)}M`;
    if (a >= 1e4) return `${sign}${pre}${trim(a / 1e3)}K`;
    const d = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
    return sign + pre + a.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function isLight(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return true;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 160;
  }

  function nativeAxisSide(yAxes, name) {
    if (!Array.isArray(yAxes)) return null;
    for (const ax of yAxes) {
      if ((ax.series || []).some((s) => s.id === name || s.axisId === name)) {
        return ax.orientation === "right" ? "right" : "left";
      }
    }
    return null;
  }

  function nativeAxis(yAxes, side) {
    if (!Array.isArray(yAxes)) return {};
    return yAxes.find((ax) => (ax.orientation || "left") === side) || {};
  }

  function headerLabel(row, dims, mode, multiYear) {
    const first = row[dims[0].name];
    const rendered = dims.map((d) => cellText(row[d.name])).join(" · ");
    if (mode === "rendered" || dims.length > 1 || !first) return rendered;
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(first.value == null ? "" : first.value));
    if (!m) return rendered;
    const mon = MONTHS[parseInt(m[2], 10) - 1];
    const yr = `'${m[1].slice(2)}`;
    const withYear = mode === "short_year" || (mode === "auto" && multiYear);
    if (!m[3]) return `${mon} ${yr}`;
    const day = parseInt(m[3], 10);
    return withYear ? `${mon} ${day} ${yr}` : `${mon} ${day}`;
  }

  // ---------- visualization ----------

  looker.plugins.visualizations.add({
    id: "bar_table_combo",
    label: "Bar + Table",
    options: BASE_OPTIONS,

    create: function (element) {
      const style = document.createElement("style");
      style.textContent = CSS;
      element.appendChild(style);
      this._root = el("div", "bt-root", element);
      this._optionSig = null;
    },

    updateAsync: function (data, element, config, queryResponse, details, done) {
      this.clearErrors();
      const fields = queryResponse.fields || {};
      if ((fields.pivots || []).length) {
        this.addError({ title: "Pivots aren't supported", message: "Bar + Table needs one x-axis dimension and no pivots." });
        return done();
      }
      const dims = fields.dimension_like || fields.dimensions || [];
      if (!dims.length) {
        this.addError({ title: "No dimension", message: "Add a dimension to use as the shared x-axis." });
        return done();
      }
      const hidden = new Set(config.hidden_fields || []);
      const allMeasures = (fields.measure_like || (fields.measures || []).concat(fields.table_calculations || []))
        .filter((m) => !hidden.has(m.name));
      if (!allMeasures.length) {
        this.addError({ title: "No measures", message: "Add at least one measure or table calculation." });
        return done();
      }

      this._registerSeriesOptions(allMeasures, config);
      this._render(data, config, dims, allMeasures);
      done();
    },

    _registerSeriesOptions: function (measures, config) {
      // Looker only shows a select's value as chosen if config holds it before registerOptions fires.
      measures.forEach((m, i) => {
        const placeKey = `bt_place_${optKey(m.name)}`;
        if (!config[placeKey]) config[placeKey] = i === 0 ? "top" : "bottom";
      });
      const sig = measures.map((m) => m.name).join("|");
      if (sig === this._optionSig) return;
      this._optionSig = sig;
      const opts = Object.assign({}, BASE_OPTIONS);
      measures.forEach((m, i) => {
        const k = optKey(m.name);
        const name = m.label_short || m.label || m.name;
        const order = 10 + i * 10;
        opts[`bt_place_${k}`] = {
          section: "Series", order, type: "string", display: "select", label: `${name}: placement`,
          default: i === 0 ? "top" : "bottom",
          values: [{ "Chart (top)": "top" }, { "Table (bottom)": "bottom" }, { Both: "both" }, { Hidden: "hidden" }],
        };
        opts[`bt_type_${k}`] = {
          section: "Series", order: order + 1, type: "string", display: "select", label: "Chart type",
          display_size: "half", default: "",
          values: [{ "Inherit / Column": "" }, { Column: "column" }, { Line: "line" }, { Scatter: "scatter" }, { Area: "area" }],
        };
        opts[`bt_axis_${k}`] = {
          section: "Series", order: order + 2, type: "string", display: "select", label: "Axis",
          display_size: "half", default: "",
          values: [{ "Inherit / Left": "" }, { Left: "left" }, { Right: "right" }],
        };
        opts[`bt_color_${k}`] = {
          section: "Series", order: order + 3, type: "string", display: "color", label: "Color", display_size: "half",
        };
        opts[`bt_label_${k}`] = {
          section: "Series", order: order + 4, type: "string", label: "Label", placeholder: name, display_size: "half",
        };
      });
      this.trigger("registerOptions", opts);
    },

    _render: function (data, config, dims, measures) {
      const root = this._root;
      root.innerHTML = "";
      if (!data.length) {
        el("div", "bt-empty", root).textContent = "No results";
        return;
      }

      const stacking = config.stacking || "";
      const nativeColors = config.series_colors || {};
      const nativeLabels = config.series_labels || {};
      const nativeTypes = config.series_types || {};

      const series = measures.map((m, i) => {
        const k = optKey(m.name);
        let type = config[`bt_type_${k}`] || nativeTypes[m.name] || "column";
        if (type === "bar") type = "column";
        return {
          idx: i,
          name: m.name,
          field: m,
          label: config[`bt_label_${k}`] || nativeLabels[m.name] || m.label_short || m.label || m.name,
          color: config[`bt_color_${k}`] || nativeColors[m.name] || PALETTE[i % PALETTE.length],
          type,
          axis: config[`bt_axis_${k}`] || nativeAxisSide(config.y_axes, m.name) || "left",
          place: config[`bt_place_${k}`] || (i === 0 ? "top" : "bottom"),
          kind: valueKind(m),
          values: data.map((row) => cellNumber(row[m.name])),
        };
      });
      const chartSeries = series.filter((s) => s.place === "top" || s.place === "both");
      const tableSeries = series.filter((s) => s.place === "bottom" || s.place === "both");

      // ----- scales -----
      const scales = {};
      const usedAxes = ["left", "right"].filter((a) => chartSeries.some((s) => s.axis === a));
      for (const side of usedAxes) {
        const onAxis = chartSeries.filter((s) => s.axis === side);
        const cols = onAxis.filter((s) => s.type === "column");
        const others = onAxis.filter((s) => s.type !== "column");
        const vals = [0];
        if (stacking && cols.length) {
          for (let i = 0; i < data.length; i++) {
            let pos = 0, neg = 0;
            cols.forEach((s) => {
              const v = s.values[i];
              if (v == null) return;
              if (v >= 0) pos += v; else neg += v;
            });
            if (stacking === "percent") {
              const total = pos - neg;
              pos = total ? pos / total : 0;
              neg = total ? neg / total : 0;
            }
            vals.push(pos, neg);
          }
        } else {
          cols.forEach((s) => s.values.forEach((v) => v != null && vals.push(v)));
        }
        others.forEach((s) => s.values.forEach((v) => v != null && vals.push(v)));
        const nat = nativeAxis(config.y_axes, side);
        const userMin = parseNum(config[`bt_${side}_min`]) ?? parseNum(nat.minValue);
        const userMax = parseNum(config[`bt_${side}_max`]) ?? parseNum(nat.maxValue);
        const scale = buildScale(Math.min(...vals), Math.max(...vals), userMin, userMax);
        const kinds = new Set(onAxis.map((s) => s.kind));
        scale.kind = stacking === "percent" && cols.length ? "percent"
          : kinds.size === 1 ? [...kinds][0] : kinds.has("percent") ? "number" : (kinds.has("usd") ? "usd" : "number");
        let title = config[`bt_${side}_label`] || nat.label || "";
        if (!title && onAxis.length === 1) title = onAxis[0].label;
        scale.title = config.show_y_axis_labels === false ? "" : title;
        scale.tickLabels = scale.ticks.map((t) => formatTick(t, scale.kind, scale.step));
        scales[side] = scale;
      }

      // ----- sizing -----
      const W = root.clientWidth || 800;
      const H = root.clientHeight || 500;
      const headerFont = parseInt(config.header_font_size, 10) || 12;
      const rowFont = parseInt(config.rows_font_size, 10) || 12;
      const headerBold = !!config.header_font_bold;
      const rowH = Math.round(rowFont + 14);
      const n = data.length;

      const axisWidth = (side) => {
        const s = scales[side];
        if (!s) return 0;
        const tickW = Math.max(...s.tickLabels.map((t) => textWidth(t, 11)));
        return Math.ceil(tickW + 12 + (s.title ? 18 : 0));
      };
      const tableLabelW = tableSeries.length
        ? Math.max(...tableSeries.map((s) => textWidth(s.label, rowFont) + (s.place === "both" ? 16 : 0))) + 20
        : 0;
      const xTitle = config.show_x_axis_label === false ? "" :
        (config.x_axis_label || dims[0].label_short || dims[0].label || "");
      const cornerW = xTitle ? textWidth(xTitle, headerFont, true) + 20 : 0;
      const gutterL = Math.ceil(Math.min(W * 0.4, Math.max(48, axisWidth("left"), tableLabelW, cornerW)));
      const gutterR = scales.right ? Math.max(40, axisWidth("right")) : 0;

      const years = new Set(data.map((r) => String((r[dims[0].name] || {}).value || "").slice(0, 4)));
      const headers = data.map((row) => headerLabel(row, dims, config.bt_header_format || "auto", years.size > 1));
      const maxHeaderW = Math.max(...headers.map((h) => textWidth(h, headerFont, headerBold)));
      let maxCellW = 0;
      tableSeries.forEach((s) => data.forEach((row) => {
        maxCellW = Math.max(maxCellW, textWidth(cellText(row[s.name]), rowFont));
      }));
      const userMinCol = parseNum(config.bt_min_col_width);
      const contentMin = Math.max(userMinCol != null ? userMinCol : Math.ceil(maxCellW + 12), 14);
      const colW = Math.max(contentMin, (W - gutterL - gutterR) / n);
      const vertical = maxHeaderW > colW - 8;
      const headerH = vertical ? Math.ceil(maxHeaderW + 14) : rowH;
      const innerW = gutterL + n * colW + gutterR;
      const scrollbar = innerW > W + 0.5 ? 14 : 0;

      const showLegend = !config.hide_legend && chartSeries.length > 0;
      const legendH = showLegend ? 26 : 0;
      const tableH = tableSeries.length ? headerH + tableSeries.length * rowH : headerH;
      const minChart = parseNum(config.bt_chart_min_height) || 140;
      const chartH = chartSeries.length ? Math.max(minChart, Math.floor(H - legendH - tableH - scrollbar - 2)) : 0;

      // ----- legend -----
      if (showLegend) {
        const legend = el("div", "bt-legend", root, {
          justifyContent: { left: "flex-start", right: "flex-end" }[config.legend_position] || "center",
          paddingLeft: `${gutterL}px`,
        });
        chartSeries.forEach((s) => {
          const item = el("span", "bt-legend-item", legend);
          const sw = el("span", "bt-swatch", item, { background: s.color });
          if (s.type === "line") Object.assign(sw.style, { height: "3px", borderRadius: "1px" });
          if (s.type === "scatter") sw.style.borderRadius = "50%";
          item.appendChild(document.createTextNode(s.label));
        });
      }

      const scroll = el("div", "bt-scroll", root);
      const inner = el("div", "bt-inner", scroll, { width: `${innerW}px` });
      const tip = el("div", "bt-tip", root);

      // ----- chart -----
      const plotTop = config.show_value_labels ? 20 : 10;
      const plotBottom = chartH - 2;
      const yOf = (side, v) => {
        const s = scales[side];
        const c = Math.max(s.min, Math.min(s.max, v));
        return plotBottom - ((c - s.min) / (s.max - s.min)) * (plotBottom - plotTop);
      };
      let plot = null;
      let band = null;

      if (chartSeries.length) {
        const chartRow = el("div", "bt-chart", inner, { height: `${chartH}px` });

        const drawAxis = (side, width) => {
          const wrap = el("div", `bt-axis ${side}`, chartRow, { width: `${width}px`, height: `${chartH}px` });
          const svg = svgEl("svg", { width, height: chartH }, wrap);
          const s = scales[side];
          if (!s) return;
          s.ticks.forEach((t, j) => {
            const y = yOf(side, t);
            svgEl("text", {
              x: side === "left" ? width - 6 : 6, y: y + 4, "font-size": 11, fill: MUTED, "font-family": FONT,
              "text-anchor": side === "left" ? "end" : "start",
            }, svg).textContent = s.tickLabels[j];
          });
          if (s.title) {
            const x = side === "left" ? 11 : width - 7;
            const y = (plotTop + plotBottom) / 2;
            const t = svgEl("text", {
              x, y, "font-size": 11, fill: MUTED, "font-family": FONT, "text-anchor": "middle",
              transform: `rotate(-90 ${x} ${y})`,
            }, svg);
            t.textContent = s.title;
          }
        };

        drawAxis("left", gutterL);
        const plotW = n * colW;
        plot = svgEl("svg", { width: plotW, height: chartH, style: "flex: 0 0 auto; display: block; overflow: visible" }, chartRow);
        if (gutterR) drawAxis("right", gutterR);

        const gridSide = scales.left ? "left" : "right";
        if (config.y_axis_gridlines !== false) {
          scales[gridSide].ticks.forEach((t) => {
            const y = Math.round(yOf(gridSide, t)) + 0.5;
            svgEl("line", { x1: 0, x2: plotW, y1: y, y2: y, stroke: "#E4E5E6", "stroke-width": 1 }, plot);
          });
        }
        band = svgEl("rect", { x: 0, y: 0, width: colW, height: chartH, fill: "#4276BE", "fill-opacity": 0.08, visibility: "hidden" }, plot);
        for (let i = 0; i < n; i++) {
          svgEl("rect", { x: i * colW, y: 0, width: colW, height: chartH, fill: "#000", "fill-opacity": 0, "data-col": i }, plot);
        }

        const labels = [];
        const colSeries = chartSeries.filter((s) => s.type === "column");
        const groups = stacking ? usedAxes.filter((a) => colSeries.some((s) => s.axis === a)) : colSeries;
        const pad = Math.min(colW * 0.12, 10);
        const slotW = (colW - 2 * pad) / Math.max(1, groups.length);
        const barW = Math.max(1, Math.min(slotW * (groups.length > 1 ? 0.92 : 1), 80));

        if (stacking) {
          for (const side of usedAxes) {
            const cols = colSeries.filter((s) => s.axis === side);
            if (!cols.length) continue;
            const slot = groups.indexOf(side);
            for (let i = 0; i < n; i++) {
              let pos = 0, neg = 0, total = 0;
              if (stacking === "percent") cols.forEach((s) => { total += Math.abs(s.values[i] || 0); });
              const x = i * colW + pad + slot * slotW + (slotW - barW) / 2;
              cols.forEach((s) => {
                let v = s.values[i];
                if (v == null) return;
                if (stacking === "percent") v = total ? v / total : 0;
                const base = v >= 0 ? pos : neg;
                const end = base + v;
                if (v >= 0) pos = end; else neg = end;
                const y1 = yOf(side, end), y0 = yOf(side, base);
                svgEl("rect", {
                  x, y: Math.min(y0, y1), width: barW, height: Math.max(0, Math.abs(y0 - y1)), fill: s.color,
                  "data-col": i, "data-series": s.idx, style: "cursor: pointer",
                }, plot);
                if (config.show_value_labels && Math.abs(y0 - y1) >= 14) {
                  labels.push({ x: x + barW / 2, y: (y0 + y1) / 2 + 4, text: cellText(data[i][s.name]), fill: isLight(s.color) ? TEXT_COLOR : "#FFFFFF" });
                }
              });
            }
          }
        } else {
          colSeries.forEach((s, slot) => {
            const sc = scales[s.axis];
            const base = Math.max(sc.min, Math.min(sc.max, 0));
            s.values.forEach((v, i) => {
              if (v == null) return;
              const x = i * colW + pad + slot * slotW + (slotW - barW) / 2;
              const y1 = yOf(s.axis, v), y0 = yOf(s.axis, base);
              svgEl("rect", {
                x, y: Math.min(y0, y1), width: barW, height: Math.max(0, Math.abs(y0 - y1)), fill: s.color,
                "data-col": i, "data-series": s.idx, style: "cursor: pointer",
              }, plot);
              if (config.show_value_labels) {
                labels.push({ x: x + barW / 2, y: v >= 0 ? y1 - 4 : y1 + 12, text: cellText(data[i][s.name]), fill: TEXT_COLOR });
              }
            });
          });
        }

        chartSeries.filter((s) => s.type !== "column").forEach((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [i * colW + colW / 2, yOf(s.axis, v)]));
          if (s.type === "line" || s.type === "area") {
            let d = "", segStart = null, last = null;
            const segments = [];
            pts.forEach((p) => {
              if (!p) { if (segStart) segments.push([segStart, last]); segStart = null; return; }
              d += `${segStart ? "L" : "M"}${p[0]},${p[1]}`;
              if (!segStart) segStart = p;
              last = p;
            });
            if (segStart) segments.push([segStart, last]);
            if (s.type === "area" && segments.length) {
              const baseY = yOf(s.axis, Math.max(scales[s.axis].min, Math.min(scales[s.axis].max, 0)));
              let area = "";
              let current = [];
              const flush = () => {
                if (!current.length) return;
                area += `M${current[0][0]},${baseY}` + current.map((p) => `L${p[0]},${p[1]}`).join("") +
                  `L${current[current.length - 1][0]},${baseY}Z`;
                current = [];
              };
              pts.forEach((p) => { if (p) current.push(p); else flush(); });
              flush();
              svgEl("path", { d: area, fill: s.color, "fill-opacity": 0.25, stroke: "none" }, plot);
            }
            svgEl("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round" }, plot);
          }
          const style = config.point_style || "circle";
          const drawPoints = s.type === "scatter" || style !== "none";
          pts.forEach((p, i) => {
            if (!p) return;
            if (drawPoints) {
              const outline = style === "circle_outline" && s.type !== "scatter";
              svgEl("circle", {
                cx: p[0], cy: p[1], r: s.type === "scatter" ? 4 : 3,
                fill: outline ? "#FFFFFF" : s.color, stroke: s.color, "stroke-width": outline ? 2 : 0,
                "data-col": i, "data-series": s.idx, style: "cursor: pointer",
              }, plot);
            }
            if (config.show_value_labels) {
              labels.push({ x: p[0], y: p[1] - 8, text: cellText(data[i][s.name]), fill: TEXT_COLOR });
            }
          });
        });

        labels.forEach((l) => {
          svgEl("text", {
            x: l.x, y: l.y, "font-size": 11, fill: l.fill, "font-family": FONT, "text-anchor": "middle",
            "pointer-events": "none",
          }, plot).textContent = l.text;
        });
      }

      // ----- table -----
      const theme = THEMES[config.table_theme] || THEMES.white;
      const solid = (c) => (c === "transparent" ? "#FFFFFF" : c);
      const headerAlign = config.header_text_alignment || "center";
      const cellAlign = config.cell_text_alignment || "center";
      const table = el("table", "bt-table", inner, { width: `${innerW}px`, fontSize: `${rowFont}px` });
      const colgroup = el("colgroup", null, table);
      el("col", null, colgroup, { width: `${gutterL}px` });
      for (let i = 0; i < n; i++) el("col", null, colgroup, { width: `${colW}px` });
      if (gutterR) el("col", null, colgroup, { width: `${gutterR}px` });

      const borderTop = chartSeries.length ? `1px solid ${theme.border === "transparent" ? "#E4E5E6" : theme.border}` : "none";
      const thead = el("thead", null, table);
      const htr = el("tr", null, thead, { height: `${headerH}px` });
      const headerStyle = (extra) => Object.assign({
        background: theme.headerBg, fontSize: `${headerFont}px`, fontWeight: headerBold ? "600" : "500",
        borderTop, borderBottom: `1px solid ${theme.border}`, verticalAlign: vertical ? "bottom" : "middle",
        paddingBottom: vertical ? "6px" : "0",
      }, extra);
      const corner = el("th", "bt-sticky-l", htr, headerStyle({ background: solid(theme.headerBg), color: MUTED }));
      corner.textContent = xTitle;
      headers.forEach((h, i) => {
        const th = el("th", null, htr, headerStyle({ textAlign: headerAlign }));
        th.setAttribute("data-col", i);
        th.title = h;
        if (vertical) el("span", "bt-vert", th).textContent = h;
        else th.textContent = h;
      });
      if (gutterR) el("th", "bt-sticky-r", htr, headerStyle({ background: solid(theme.headerBg) }));

      const tbody = el("tbody", null, table);
      tableSeries.forEach((s, r) => {
        const bg = r % 2 ? theme.altBg : theme.rowBg;
        const tr = el("tr", null, tbody, { height: `${rowH}px` });
        const cellStyle = { background: bg, borderBottom: `1px solid ${theme.border}` };
        const th = el("th", "bt-sticky-l", tr, Object.assign({}, cellStyle, { background: solid(bg), fontWeight: "500" }));
        if (s.place === "both") el("span", "bt-swatch", th, { background: s.color });
        th.appendChild(document.createTextNode(s.label));
        th.title = s.label;
        data.forEach((row, i) => {
          const cell = row[s.name];
          const td = el("td", null, tr, Object.assign({}, cellStyle, { textAlign: cellAlign }));
          td.setAttribute("data-col", i);
          td.setAttribute("data-series", s.idx);
          td.innerHTML = cellHtml(cell);
          if (cell && cell.links && cell.links.length) td.classList.add("bt-drill");
        });
        if (gutterR) el("td", "bt-sticky-r", tr, Object.assign({}, cellStyle, { background: solid(bg) }));
      });

      // ----- interaction: shared column hover, tooltip, drill -----
      let hlCol = null;
      const highlight = (col) => {
        if (col === hlCol) return;
        table.querySelectorAll(".bt-hl").forEach((c) => c.classList.remove("bt-hl"));
        hlCol = col;
        if (col == null) {
          if (band) band.setAttribute("visibility", "hidden");
          return;
        }
        table.querySelectorAll(`[data-col="${col}"]`).forEach((c) => c.classList.add("bt-hl"));
        if (band) {
          band.setAttribute("x", col * colW);
          band.setAttribute("visibility", "visible");
        }
      };

      const showTip = (col, evt) => {
        if (!chartSeries.length) return;
        tip.innerHTML = "";
        el("div", null, tip, { fontWeight: "600", marginBottom: "2px" }).textContent = headers[col];
        chartSeries.forEach((s) => {
          const line = el("div", null, tip, { display: "flex", alignItems: "center" });
          el("span", "bt-swatch", line, { background: s.color });
          line.appendChild(document.createTextNode(`${s.label}: `));
          el("b", null, line, { marginLeft: "4px" }).textContent = cellText(data[col][s.name]);
        });
        tip.style.display = "block";
        const rr = root.getBoundingClientRect();
        let x = evt.clientX - rr.left + 14;
        const y = evt.clientY - rr.top + 14;
        if (x + tip.offsetWidth > rr.width) x = evt.clientX - rr.left - tip.offsetWidth - 14;
        tip.style.left = `${Math.max(0, x)}px`;
        tip.style.top = `${Math.min(y, rr.height - tip.offsetHeight - 4)}px`;
      };

      const drill = (target, evt) => {
        const col = target.getAttribute("data-col");
        const sIdx = target.getAttribute("data-series");
        if (col == null || sIdx == null || !window.LookerCharts) return;
        const cell = data[+col][series[+sIdx].name];
        if (cell && cell.links && cell.links.length) {
          LookerCharts.Utils.openDrillMenu({ links: cell.links, event: evt });
        }
      };

      if (plot) {
        plot.addEventListener("mousemove", (e) => {
          const t = e.target.closest && e.target.closest("[data-col]");
          if (!t) return;
          const col = +t.getAttribute("data-col");
          highlight(col);
          showTip(col, e);
        });
        plot.addEventListener("mouseleave", () => { highlight(null); tip.style.display = "none"; });
        plot.addEventListener("click", (e) => {
          const t = e.target.closest && e.target.closest("[data-series]");
          if (t) drill(t, e);
        });
      }
      table.addEventListener("mouseover", (e) => {
        const t = e.target.closest && e.target.closest("[data-col]");
        highlight(t ? +t.getAttribute("data-col") : null);
      });
      table.addEventListener("mouseleave", () => highlight(null));
      table.addEventListener("click", (e) => {
        const t = e.target.closest && e.target.closest("td[data-series]");
        if (t) drill(t, e);
      });
    },
  });
})();
