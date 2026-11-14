/* ==========================================================================
   Trendoscope — charts.js
   All Plotly chart builders. One dark layout so every chart looks the same,
   plus CSV / PNG export helpers.
   ========================================================================== */
(function () {
  "use strict";
  var TS = window.TS;
  TS.chart = {};

  var FONT = "Inter, Helvetica Neue, Arial, sans-serif";

  function baseLayout(opts) {
    opts = opts || {};
    var paper = !!opts.paper;
    var ink = paper ? "#3E3A31" : "#C2D4E8";
    var grid = paper ? "rgba(27,27,27,0.12)" : "rgba(255,255,255,0.07)";
    var axis = paper ? "rgba(27,27,27,0.3)" : "rgba(255,255,255,0.16)";
    var legend = paper ? "#5C5443" : "#94A9C3";
    return {
      margin: { l: 58, r: 18, t: 16, b: 40 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: FONT, size: 12.5, color: ink },
      hovermode: "x unified",
      hoverlabel: { bgcolor: "#101a38", bordercolor: "rgba(255,255,255,0.18)", font: { color: "#fff", size: 12.5, family: FONT } },
      showlegend: opts.showlegend !== false,
      legend: { orientation: "h", y: -0.18, x: 0, font: { size: 11.5, color: legend }, bgcolor: "rgba(0,0,0,0)" },
      xaxis: {
        gridcolor: grid,
        zeroline: false,
        linecolor: axis,
        tickcolor: axis,
        ticks: "outside",
        tickfont: { size: 11.5 },
        title: { text: opts.xTitle || "", font: { size: 11.5, color: legend } },
        type: opts.xType || "date"
      },
      yaxis: {
        gridcolor: grid,
        zeroline: opts.zeroLine || false,
        zerolinecolor: paper ? "rgba(27,27,27,0.35)" : "rgba(255,255,255,0.25)",
        linecolor: axis,
        tickcolor: axis,
        ticks: "outside",
        tickfont: { size: 11.5 },
        title: { text: opts.yTitle || "", font: { size: 11.5, color: legend } }
      }
    };
  }
  TS.chart.baseLayout = baseLayout;

  var CONFIG = { responsive: true, displayModeBar: false, scrollZoom: false, doubleClick: "reset" };
  TS.chart.config = CONFIG;

  function toDate(stamp) {
    var p = stamp.split("-");
    return new Date(+p[0], +p[1] - 1, p[2] ? +p[2] : 15);
  }
  TS.chart.toDate = toDate;

  /** Main time-series chart: series + Theil-Sen trend + 95% CI fan. */
  TS.chart.timeseries = function (host, opts) {
    var a = opts.analysis;
    var color = opts.color || "#8CC63F";
    var dates = a.dates.map(toDate);
    var unitLabel = opts.unit || "";

    var traces = [];

    // 95% CI band around the trend line (fan widening away from the centre)
    if (opts.showCI !== false && a.ciOk && a.ciLow !== null && a.ciHigh !== null) {
      var mid = Math.floor(a.values.length / 2);
      var xMid = a.trendLine[mid];
      var span = Math.max.apply(null, a.trendLine.map(function (v) { return Math.abs(v - xMid); })) || 1;
      var half = Math.abs(a.ciHigh - a.ciLow) / 2;
      traces.push({
        x: dates.concat(dates.slice().reverse()),
        y: a.trendLine.map(function (v) { return v + (half * Math.abs(v - xMid)) / span; })
          .concat(a.trendLine.slice().reverse().map(function (v) { return v - (half * Math.abs(v - xMid)) / span; })),
        type: "scatter", mode: "lines",
        line: { width: 0 },
        fill: "toself",
        fillcolor: hexToRgba(color, 0.14),
        hoverinfo: "skip",
        showlegend: true,
        name: "95% CI of the trend"
      });
    }

    traces.push({
      x: dates, y: a.values,
      type: "scatter", mode: "lines",
      name: opts.seriesName || "Measured",
      line: { color: "#8FB4E8", width: 1.4 },
      hovertemplate: "%{x|%b %Y}<br>" + (opts.valueLabel || "value") + ": %{y:.2f} " + unitLabel + "<extra></extra>"
    });

    traces.push({
      x: dates, y: a.trendLine,
      type: "scatter", mode: "lines",
      name: "Trend (Theil-Sen)",
      line: { color: color, width: 2.6, dash: "solid" },
      hovertemplate: "trend: %{y:.2f} " + unitLabel + "<extra></extra>"
    });

    var layout = baseLayout({
      yTitle: opts.yTitle || unitLabel,
      xTitle: "",
      showlegend: true,
      zeroLine: opts.zeroLine
    });
    layout.margin.t = 8;

    Plotly.react(host, traces, layout, CONFIG);
  };

  /** Overlay chart for Compare: two series and two trend lines. */
  TS.chart.compare = function (host, opts) {
    var A = opts.a, B = opts.b;
    var colors = [opts.colorA || "#4C9BE0", opts.colorB || "#8CC63F"];
    var step = (opts.resolution === "daily" ? 365.25 : 12) * 10;
    var traces = [
      {
        x: A.dates.map(toDate), y: A.values, type: "scatter", mode: "lines",
        name: opts.nameA, line: { color: hexToRgba(colors[0], 0.45), width: 1.1 },
        hovertemplate: "%{x|%b %Y}<br>" + opts.nameA + ": %{y:.2f}<extra></extra>"
      },
      {
        x: A.dates.map(toDate), y: A.trendLine, type: "scatter", mode: "lines",
        name: opts.nameA + " trend " + TS.fmt.signed(A.slopePerDecade, 3) + "/dec", line: { color: colors[0], width: 3, dash: "solid" }, hoverinfo: "skip"
      },
      {
        x: B.dates.map(toDate), y: B.values, type: "scatter", mode: "lines",
        name: opts.nameB, line: { color: hexToRgba(colors[1], 0.45), width: 1.1 },
        hovertemplate: "%{x|%b %Y}<br>" + opts.nameB + ": %{y:.2f}<extra></extra>"
      },
      {
        x: B.dates.map(toDate), y: B.trendLine, type: "scatter", mode: "lines",
        name: opts.nameB + " trend " + TS.fmt.signed(B.slopePerDecade, 3) + "/dec", line: { color: colors[1], width: 3, dash: "solid" }, hoverinfo: "skip"
      }
    ];
    var layout = baseLayout({ yTitle: opts.unit, showlegend: true, zeroLine: opts.zeroLine });
    Plotly.react(host, traces, layout, CONFIG);
  };

  /** Chance Machine histogram with the real slope marked. */
  TS.chart.permutation = function (host, opts) {
    var slopes = opts.slopes, real = opts.real;
    var traces = [
      {
        x: slopes, type: "histogram", name: "Shuffled slopes",
        marker: { color: "rgba(143, 180, 232, 0.55)", line: { width: 0 } },
        nbinsx: 26,
        hovertemplate: "slope %{x:.3f}<br>%{y} shuffles<extra></extra>"
      }
    ];
    var lo = Math.min.apply(null, slopes.concat([real]));
    var hi = Math.max.apply(null, slopes.concat([real]));
    var pad = (hi - lo) * 0.06 || 0.01;

    var layout = baseLayout({
      yTitle: "Number of shuffles",
      xTitle: "Slope of a shuffled series (per decade)",
      showlegend: true,
      xType: "linear"
    });
    layout.margin = { l: 54, r: 14, t: 8, b: 42 };
    layout.shapes = [{
      type: "line", x0: real, x1: real, y0: 0, y1: 1, yref: "paper",
      line: { color: "#8CC63F", width: 2.5 }
    }];
    layout.annotations = [{
      x: real, y: 1.04, yref: "paper", text: "real slope (line fit)", showarrow: false,
      font: { color: "#8CC63F", size: 11.5, family: "JetBrains Mono, monospace" }
    }];
    layout.xaxis.range = [lo - pad, hi + pad];
    Plotly.react(host, traces, layout, CONFIG);
  };

  /** Scatter of target vs suspect at a given lag, for the case file. */
  TS.chart.correlation = function (host, opts) {
    var pts = opts.points; // [{x, y}]
    var color = opts.color || "#A0764A";
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var fit = TS.stats.olsFit(xs, ys);
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);

    var layout = baseLayout({
      xTitle: opts.xTitle,
      yTitle: opts.yTitle,
      showlegend: false,
      xType: "linear",
      paper: opts.paper
    });
    layout.margin = { l: 66, r: 16, t: 10, b: 58 };
    layout.hovermode = "closest";

    Plotly.react(host, [
      {
        x: xs, y: ys, type: "scatter", mode: "markers",
        marker: { size: 5, color: hexToRgba(color, 0.55), line: { width: 0 } },
        hovertemplate: "(%{x:.2f}, %{y:.2f})<extra></extra>"
      },
      {
        x: [minX, maxX],
        y: [fit.intercept + fit.slope * minX, fit.intercept + fit.slope * maxX],
        type: "scatter", mode: "lines",
        line: { color: "#8CC63F", width: 2.5 }, hoverinfo: "skip"
      }
    ], layout, CONFIG);
    return fit;
  };

  /** Story chart: the series with two "then / now" windows highlighted. */
  TS.chart.story = function (host, opts) {
    var dates = opts.story.dates.map(toDate);
    var layout = baseLayout({ yTitle: opts.yTitle, showlegend: false });
    layout.margin = { l: 52, r: 16, t: 10, b: 36 };
    layout.shapes = [
      { type: "rect", xref: "x", yref: "paper", x0: opts.story.thenStart, x1: opts.story.thenEnd, y0: 0, y1: 1, fillcolor: "rgba(27,27,27,0.12)", line: { width: 0 } },
      { type: "rect", xref: "x", yref: "paper", x0: opts.story.nowStart, x1: opts.story.nowEnd, y0: 0, y1: 1, fillcolor: "rgba(140,198,63,0.22)", line: { width: 0 } }
    ];
    Plotly.react(host, [{
      x: dates, y: opts.story.values, type: "scatter", mode: "lines",
      line: { color: "#8FB4E8", width: 1.2 },
      hovertemplate: "%{x|%b %Y}: %{y:.2f}<extra></extra>"
    }], layout, CONFIG);
  };

  /* -------------------------------------------------------------- export -- */

  TS.chart.downloadPNG = function (host, filename) {
    Plotly.toImage(host, { format: "png", width: 1400, height: 700, scale: 2 })
      .then(function (url) {
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        TS.toast("Chart image downloaded");
      })
      .catch(function () { TS.toast("Could not export the image"); });
  };

  TS.chart.downloadCSV = function (analysis, filename) {
    var rows = [["date", "value", "deseasonalized" === "" ? "" : "value_used"]];
    rows = [["date", "value", "value_used_in_trend"]];
    for (var i = 0; i < analysis.dates.length; i++) {
      rows.push([analysis.dates[i], analysis.raw[i], analysis.values[i]]);
    }
    var csv = rows.map(function (r) { return r.join(","); }).join("\n");
    TS.download(filename, "text/csv;charset=utf-8", csv);
    TS.toast("CSV downloaded");
  };

  function hexToRgba(hex, alpha) {
    if (hex.indexOf("var(") === 0) return "rgba(140,198,63," + alpha + ")";
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }
  TS.chart.hexToRgba = hexToRgba;
})();
