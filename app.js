/* ==========================================================================
   Trendoscope — app.js
   Shared layer used by every page:
     - data access (monthly / daily caches, lazy loaded)
     - statistics engine (Mann-Kendall, Theil-Sen, OLS, permutation test)
     - text + number formatting
     - the Ask Trendoscope panel (grounded answer engine)
     - small UI helpers (toast, mini map, mascot, tooltips)
   ========================================================================== */
(function () {
  "use strict";

  var TS = {};
  window.TS = TS;

  /* ---------------------------------------------------------------- data -- */

  TS.core = window.TS_CORE || { variables: [], regions: [], cases: [], presetPairs: [], story: null };
  TS.monthly = window.TS_MONTHLY || null;
  TS.daily = window.TS_DAILY || null;

  TS.variable = function (id) {
    return TS.core.variables.filter(function (v) { return v.id === id; })[0];
  };
  TS.region = function (id) {
    return TS.core.regions.filter(function (r) { return r.id === id; })[0];
  };
  TS.caseFile = function (id) {
    return TS.core.cases.filter(function (c) { return c.id === id; })[0];
  };
  TS.powerColor = function (power) {
    return {
      water: "var(--power-water)",
      land: "var(--power-land)",
      weather: "var(--power-weather)",
      vegetation: "var(--power-vegetation)"
    }[power] || "var(--accent)";
  };
  TS.powerHex = function (power) {
    return {
      water: "#4C9BE0", land: "#A0764A", weather: "#9B8CE8", vegetation: "#3FAE5A"
    }[power] || "#8CC63F";
  };

  /* Load the daily cache on demand (it is the big file). */
  TS.loadDaily = function () {
    if (TS.daily) return Promise.resolve(TS.daily);
    if (TS._dailyPromise) return TS._dailyPromise;
    TS._dailyPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "data-daily.js";
      s.onload = function () { TS.daily = window.TS_DAILY; resolve(TS.daily); };
      s.onerror = function () { reject(new Error("Could not load the daily data cache.")); };
      document.head.appendChild(s);
    });
    return TS._dailyPromise;
  };

  /** Returns {dates, values, clim, missing_pct} for one pair, or null. */
  TS.series = function (regionId, variableId, resolution) {
    var pack = resolution === "daily" ? TS.daily : TS.monthly;
    if (!pack) return null;
    var s = pack.series[regionId + "|" + variableId];
    if (!s) return null;
    return { dates: pack.dates, values: s.values, clim: s.clim, missing_pct: s.missing_pct };
  };

  TS.range = function (resolution) {
    var pack = resolution === "daily" ? TS.daily : TS.monthly;
    if (!pack || !pack.dates.length) return { min: 1993, max: 2024 };
    return { min: +pack.dates[0].slice(0, 4), max: +pack.dates[pack.dates.length - 1].slice(0, 4) };
  };

  /* ---------------------------------------------------------- statistics -- */

  var Z_95 = 1.959963984540054;

  function erf(x) {
    // Abramowitz & Stegun 7.1.26
    var s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function normalTwoSidedP(z) {
    return 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
  }

  /** Mann-Kendall trend test with tie correction. */
  function mannKendall(y) {
    var n = y.length, S = 0, i, j;
    for (i = 0; i < n - 1; i++) {
      var yi = y[i];
      for (j = i + 1; j < n; j++) {
        var d = y[j] - yi;
        S += d > 0 ? 1 : (d < 0 ? -1 : 0);
      }
    }
    // tie correction
    var sorted = y.slice().sort(function (a, b) { return a - b; });
    var tieSum = 0, run = 1;
    for (i = 1; i <= n; i++) {
      if (i < n && sorted[i] === sorted[i - 1]) { run++; }
      else { if (run > 1) tieSum += run * (run - 1) * (2 * run + 5); run = 1; }
    }
    var varS = (n * (n - 1) * (2 * n + 5) - tieSum) / 18;
    var z = 0;
    if (varS > 0) {
      if (S > 0) z = (S - 1) / Math.sqrt(varS);
      else if (S < 0) z = (S + 1) / Math.sqrt(varS);
    }
    var p = normalTwoSidedP(z);
    var tau = (n > 1) ? S / (0.5 * n * (n - 1)) : 0;
    return { S: S, z: z, p: Math.max(0, Math.min(1, p)), tau: tau, n: n };
  }

  function median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /**
   * Theil-Sen slope + Sen 95% confidence interval.
   * For long (daily) records the pairwise set is sampled to keep the page fast;
   * the sample is deterministic and `approx` is reported to the UI.
   */
  function theilSen(idx, y, opts) {
    opts = opts || {};
    var n = y.length, slopes = [], i, j;
    var maxPairs = opts.maxPairs || 400000;
    var total = n * (n - 1) / 2;

    if (total <= maxPairs) {
      for (i = 0; i < n - 1; i++) {
        for (j = i + 1; j < n; j++) {
          slopes.push((y[j] - y[i]) / (idx[j] - idx[i]));
        }
      }
      var sensSorted = slopes.sort(function (a, b) { return a - b; });
      var slope = median(sensSorted);
      // Sen's CI from the order statistics of the pairwise slopes
      var varS = n * (n - 1) * (2 * n + 5) / 18;
      var k = Math.round((total - Z_95 * Math.sqrt(varS)) / 2);
      k = Math.max(0, Math.min(n * (n - 1) / 2 - 1, k));
      return {
        slope: slope,
        lo: sensSorted[Math.min(k, sensSorted.length - 1)],
        hi: sensSorted[Math.max(0, sensSorted.length - 1 - k)],
        approx: false
      };
    }

    // deterministic sample of pairs
    var seed = 42;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    for (var s = 0; s < maxPairs; s++) {
      i = Math.floor(rnd() * (n - 1));
      j = i + 1 + Math.floor(rnd() * (n - 1 - i));
      slopes.push((y[j] - y[i]) / (idx[j] - idx[i]));
    }
    var srt = slopes.sort(function (a, b) { return a - b; });
    var med = median(srt);
    var lo = srt[Math.floor(srt.length * 0.025)];
    var hi = srt[Math.floor(srt.length * 0.975)];
    return { slope: med, lo: lo, hi: hi, approx: true };
  }

  function olsFit(x, y) {
    var n = x.length, sx = 0, sy = 0, sxx = 0, sxy = 0, i;
    for (i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
    var mx = sx / n, my = sy / n;
    for (i = 0; i < n; i++) {
      var dx = x[i] - mx;
      sxx += dx * dx;
      sxy += dx * (y[i] - my);
    }
    var slope = sxy / sxx;
    var intercept = my - slope * mx;
    return { slope: slope, intercept: intercept };
  }

  function stdev(a) {
    if (a.length < 2) return 0;
    var m = a.reduce(function (s, v) { return s + v; }, 0) / a.length;
    var v = a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1);
    return Math.sqrt(v);
  }

  TS.stats = {
    mannKendall: mannKendall,
    theilSen: theilSen,
    olsFit: olsFit,
    median: median
  };

  /**
   * Full analysis for one variable + region + range.
   * opts: {region, variable, resolution, from, to, deseasonalize}
   */
  TS.analyze = function (opts) {
    var resolution = opts.resolution || "monthly";
    var ser = TS.series(opts.region, opts.variable, resolution);
    if (!ser) return { error: "nodata" };

    var step = resolution === "daily" ? 365.25 : 12;
    var period = resolution === "daily" ? 366 : 12;
    var from = opts.from || TS.range(resolution).min;
    var to = opts.to || TS.range(resolution).max;

    var dates = [], values = [], index = [], usedRaw = [], missing = 0, total = 0;
    for (var i = 0; i < ser.dates.length; i++) {
      var year = +ser.dates[i].slice(0, 4);
      if (year < from || year > to) continue;
      total++;
      var v = ser.values[i];
      if (v === null || v === undefined) { missing++; continue; }
      var use = opts.deseasonalize ? v - ser.clim[i % period] : v;
      index.push(resolution === "daily" ? dayNumber(ser.dates[i]) : i);
      values.push(use);
      dates.push(ser.dates[i]);
      usedRaw.push(v);
    }

    if (values.length < 8) return { error: "tooShort", n: values.length };

    var mk = mannKendall(values);
    var sen = theilSen(index, values, { maxPairs: resolution === "daily" ? 400000 : 500000 });
    var years = (to - from + 1);
    var slopePerDecade = sen.slope * step * 10;
    var loPerDecade = sen.lo * step * 10;
    var hiPerDecade = sen.hi * step * 10;

    var mean = values.reduce(function (s, x) { return s + x; }, 0) / values.length;
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);

    // % change: mean of the first three years of the window vs the last three
    var first = [], last = [];
    for (i = 0; i < dates.length; i++) {
      var yr = +dates[i].slice(0, 4);
      if (yr >= from && yr <= from + 2) first.push(usedRaw[i]);
      if (yr >= to - 2 && yr <= to) last.push(usedRaw[i]);
    }
    var meanFirst = first.length ? first.reduce(function (s, x) { return s + x; }, 0) / first.length : null;
    var meanLast = last.length ? last.reduce(function (s, x) { return s + x; }, 0) / last.length : null;
    var pctChange = (meanFirst !== null && meanLast !== null && (to - from) >= 6 && Math.abs(meanFirst) > 1e-6)
      ? ((meanLast - meanFirst) / Math.abs(meanFirst)) * 100
      : null;

    // A Sen interval from order statistics can be absurdly wide on short or
    // very spiky records. Flag it instead of printing a meaningless number.
    var ciWidth = Math.abs(hiPerDecade - loPerDecade);
    var ciOk = isFinite(ciWidth) && values.length >= 24 &&
      ciWidth <= 20 * Math.max(Math.abs(slopePerDecade), 1e-9);

    var significant = mk.p < 0.05;
    var verdict = !significant ? "no_significant_trend" : (slopePerDecade > 0 ? "significant_increase" : "significant_decrease");

    return {
      region: opts.region,
      variable: opts.variable,
      resolution: resolution,
      from: from,
      to: to,
      years: years,
      deseasonalize: !!opts.deseasonalize,
      dates: dates,
      values: values,
      raw: usedRaw,
      trendLine: (function () {
        // Theil-Sen intercept = median of (value - slope * x)
        var b = median(values.map(function (v, k) { return v - sen.slope * index[k]; }));
        return index.map(function (x) { return b + sen.slope * x; });
      })(),
      slopePerDecade: slopePerDecade,
      ciLow: ciOk ? loPerDecade : null,
      ciHigh: ciOk ? hiPerDecade : null,
      ciOk: ciOk,
      slopeApprox: sen.approx,
      p: mk.p,
      tau: mk.tau,
      z: mk.z,
      n: values.length,
      mean: mean,
      min: min,
      max: max,
      sd: stdev(values),
      pctChange: pctChange,
      missingPct: total ? (missing / total) * 100 : 0,
      significant: significant,
      verdict: verdict,
      step: step
    };
  };

  function dayNumber(dateStr) {
    var parts = dateStr.split("-");
    var d = Date.UTC(+parts[0], +parts[1] - 1, +parts[2]);
    return Math.round(d / 86400000);
  }
  TS.dayNumber = dayNumber;

  /**
   * Permutation test: shuffle the series order many times and
   * record the OLS slope each time. Returns slopes + how often |shuffle| >= |real|.
   */
  TS.permutation = function (values, iterations, onProgress) {
    var real = olsFit(values.map(function (_, i) { return i; }), values).slope;
    var out = [], i, n = values.length;
    var order = values.slice();
    for (var it = 0; it < iterations; it++) {
      for (i = n - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = order[i]; order[i] = order[j]; order[j] = t;
      }
      var num = 0, den = 0, mx = (n - 1) / 2, my = 0;
      for (i = 0; i < n; i++) my += order[i];
      my /= n;
      for (i = 0; i < n; i++) {
        var dx = i - mx;
        num += dx * (order[i] - my);
        den += dx * dx;
      }
      out.push(num / den);
      if (onProgress && it % 25 === 0) onProgress(it / iterations);
    }
    var extreme = out.filter(function (s) { return Math.abs(s) >= Math.abs(real); }).length;
    return { slopes: out, real: real, share: extreme / out.length };
  };

  /* --------------------------------------------------------- formatting -- */

  var UNITS = {
    "°C": { suffix: " °C", signed: true },
    "mm/day": { suffix: " mm/day", signed: true },
    "m/s": { suffix: " m/s", signed: true },
    "MJ/m²/day": { suffix: " MJ/m²/day", signed: true },
    "fraction (0-1)": { suffix: "", signed: true }
  };

  TS.fmt = {
    num: function (v, d) {
      if (v === null || v === undefined || isNaN(v)) return "–";
      var digs = d === undefined ? 2 : d;
      var out = Number(v).toLocaleString("en-US", { minimumFractionDigits: digs, maximumFractionDigits: digs });
      // never show "-0.00"
      if (/^[−-]0[.,]0+$/.test(out)) out = out.replace(/^[−-]/, "");
      return out;
    },
    signed: function (v, d) {
      if (v === null || v === undefined || isNaN(v)) return "–";
      var s = TS.fmt.num(Math.abs(v), d);
      return (v > 0 ? "+" : v < 0 ? "−" : "") + s;
    },
    pText: function (p) {
      if (p === null || p === undefined) return "p = –";
      return p < 0.001 ? "p < 0.001" : "p = " + p.toFixed(3);
    },
    unit: function (variable) {
      if (!variable) return "";
      return variable.unit === "fraction (0-1)" ? "0–1" : variable.unit;
    },
    p: function (p) {
      if (p === null || p === undefined) return "–";
      if (p < 0.001) return "< 0.001";
      return p.toFixed(p < 0.01 ? 4 : 3);
    },
    pct: function (v, d) {
      if (v === null || v === undefined || isNaN(v)) return "–";
      return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d === undefined ? 1 : d) + "%";
    },
    yearLabel: function (r) { return r + ""; }
  };

  TS.verdictText = {
    significant_increase: "Significant increase",
    significant_decrease: "Significant decrease",
    no_significant_trend: "No significant trend"
  };
  TS.verdictClass = {
    significant_increase: "stamp--sig",
    significant_decrease: "stamp--sig",
    no_significant_trend: "stamp--nosig"
  };
  TS.verdictIcon = {
    significant_increase: "up",
    significant_decrease: "down",
    no_significant_trend: "flat"
  };

  /* Small inline icons (stroke style, currentColor) */
  TS.icon = function (name) {
    var paths = {
      up: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/>',
      down: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="6 13 12 19 18 13"/>',
      flat: '<line x1="4" y1="12" x2="20" y2="12"/>',
      alert: '<path d="M12 3.5 21 19.5H3Z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>',
      search: '<circle cx="10.5" cy="10.5" r="6.2"/><line x1="15.4" y1="15.4" x2="20.5" y2="20.5"/>',
      close: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
      check: '<polyline points="5 12.5 10 17.5 19 7"/>',
      swap: '<polyline points="7 4 3 8 7 12"/><line x1="3" y1="8" x2="15" y2="8"/><polyline points="17 12 21 16 17 20"/><line x1="21" y1="16" x2="9" y2="16"/>',
      arrowRight: '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="13 5 20 12 13 19"/>',
      download: '<path d="M12 4v11"/><polyline points="7 10 12 15 17 10"/><line x1="5" y1="19" x2="19" y2="19"/>',
      send: '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="13 5 20 12 13 19"/>',
      spark: '<path d="M12 3.2 13.8 8.4 19 10.2 13.8 12 12 17.2 10.2 12 5 10.2 10.2 8.4Z"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || "") + "</svg>";
  };

  /* Mascot: Detective Dune (explorer hat + magnifier). mood: "happy" | "think" | "wow" */
  TS.mascot = function (size, mood) {
    var eyes = mood === "think"
      ? '<path d="M12.4 17.4h2.6M18.2 17.4h2.4" stroke="#FFF0D8" stroke-width="1.6"/>'
      : '<circle cx="13.6" cy="17.2" r="1" fill="#FFF0D8"/><circle cx="19" cy="17.2" r="1" fill="#FFF0D8"/>';
    var mouth = mood === "wow"
      ? '<ellipse cx="16.3" cy="21" rx="1.6" ry="2" fill="#FFF0D8" opacity="0.9"/>'
      : '<path d="M14.4 20.3c1.2.9 2.6.9 3.8 0" stroke="#FFF0D8" stroke-width="1.4" fill="none"/>';
    return '<svg viewBox="0 0 34 34" width="' + size + '" height="' + size + '" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M9 13.4c0-4.4 3.4-7.2 8-7.2s8 2.8 8 7.2" stroke="#8CC63F" stroke-width="1.8"/>' +
      '<path d="M7.4 13.7c1.6-1.1 4-1.7 9.6-1.7s8 .6 9.6 1.7" stroke="#8CC63F" stroke-width="1.8"/>' +
      '<path d="M10.4 18.2c0-3.1 2.7-5.4 6.6-5.4s6.6 2.3 6.6 5.4-2.7 5.4-6.6 5.4-6.6-2.3-6.6-5.4Z" stroke="#FFF0D8" stroke-width="1.6"/>' +
      eyes + mouth +
      '<circle cx="25" cy="24.4" r="3.2" stroke="#8CC63F" stroke-width="1.7"/>' +
      '<line x1="27.4" y1="26.8" x2="30" y2="29.4" stroke="#8CC63F" stroke-width="1.7"/>' +
      "</svg>";
  };

  /* ------------------------------------------------------------- toasts -- */

  TS.toast = function (message) {
    var wrap = document.querySelector(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  };

  /* ------------------------------------------------------------ mini map -- */

  TS.miniMap = function (regionId, opts) {
    opts = opts || {};
    var r = TS.region(regionId);
    if (!r) return "";
    var box = r.box; // [latMin, lonMin, latMax, lonMax]
    function px(lon) { return ((lon + 180) / 360) * 360; }
    function py(lat) { return ((90 - lat) / 180) * 180; }
    var x = px(box[1]), y = py(box[2]), w = px(box[3]) - px(box[1]), h = py(box[0]) - py(box[2]);
    var label = opts.label || r.short;
    return '<svg class="mini-map" viewBox="0 0 360 180" role="img" aria-label="World map with the selected region: ' + label + '">' +
      '<rect x="0" y="0" width="360" height="180" fill="rgba(8,12,28,0.75)"/>' +
      '<path class="land" d="' + TS.core.worldPath + '" fill-rule="evenodd"/>' +
      '<g class="graticule"><line x1="0" y1="45" x2="360" y2="45"/><line x1="0" y1="90" x2="360" y2="90"/><line x1="0" y1="135" x2="360" y2="135"/><line x1="90" y1="0" x2="90" y2="180"/><line x1="180" y1="0" x2="180" y2="180"/><line x1="270" y1="0" x2="270" y2="180"/></g>' +
      '<rect class="region-box" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(w, 3).toFixed(1) + '" height="' + Math.max(h, 3).toFixed(1) + '" rx="1.5"/>' +
      '<circle cx="' + px(r.lon).toFixed(1) + '" cy="' + py(r.lat).toFixed(1) + '" r="2.2" fill="#8CC63F"/>' +
      "</svg>";
  };

  /* -------------------------------------------------------- ask the app -- */

  /* ---------------------------------------------------------- region map -- */

  /**
   * Interactive world map. Each region is a numbered pin the user can click or
   * reach with the keyboard; the legend below it (TS.regionLegend) mirrors it.
   */
  TS.regionMap = function (activeId, opts) {
    opts = opts || {};
    var W = 360, H = 180;
    function px(lon) { return ((lon + 180) / 360) * W; }
    function py(lat) { return ((90 - lat) / 180) * H; }

    var out = ['<svg class="region-map' + (opts.compact ? " region-map--compact" : "") +
      '" viewBox="0 0 360 180" role="group" aria-label="World map: choose a region">'];
    out.push('<rect x="0" y="0" width="360" height="180" fill="rgba(8,12,28,0.55)"/>');
    out.push('<path class="land" d="' + TS.core.worldPath + '" fill-rule="evenodd"/>');
    out.push('<g class="graticule">' +
      '<line x1="0" y1="45" x2="360" y2="45"/><line x1="0" y1="90" x2="360" y2="90"/><line x1="0" y1="135" x2="360" y2="135"/>' +
      '<line x1="90" y1="0" x2="90" y2="180"/><line x1="180" y1="0" x2="180" y2="180"/><line x1="270" y1="0" x2="270" y2="180"/></g>');

    TS.core.regions.forEach(function (r, i) {
      // Nile Delta and Upper Egypt sit ~4° apart, so their pins are nudged
      // apart and joined to the true location with a leader line.
      var SPREAD = { nile_delta: [10, -8], upper_egypt: [-10, 9] };
      var off = SPREAD[r.id] || [0, 0];
      var bx = px(r.lon), by = py(r.lat);
      var x = bx + off[0], y = by + off[1];
      var on = r.id === activeId;
      var label = on ? r.short : String(i + 1);
      out.push('<g class="rmap-pin' + (on ? " is-on" : "") + '" data-region="' + r.id + '" tabindex="0" role="button" ' +
        'aria-pressed="' + on + '" aria-label="' + TS.escapeHtml(r.name) + '">' +
        '<title>' + TS.escapeHtml(r.name) + "</title>");
      if (off[0] || off[1]) {
        out.push('<line class="rmap-leader" x1="' + bx.toFixed(1) + '" y1="' + by.toFixed(1) +
          '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>');
      }
      out.push('<circle class="rmap-hit" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="9" fill="transparent"/>');
      if (on) {
        out.push('<circle class="rmap-ring" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="11"/>');
        out.push('<circle class="rmap-halo" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6.5"/>');
      }
      out.push('<circle class="rmap-dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.1"/>');
      if (on) {
        out.push('<text class="rmap-name" x="' + (x + 8).toFixed(1) + '" y="' + (y + 2.6).toFixed(1) + '">' +
          TS.escapeHtml(r.short) + "</text>");
      } else {
        out.push('<text class="rmap-num" x="' + x.toFixed(1) + '" y="' + (y - 7).toFixed(1) + '">' + (i + 1) + "</text>");
      }
      out.push("</g>");
    });
    out.push("</svg>");
    return out.join("");
  };

  TS.regionLegend = function (activeId, opts) {
    opts = opts || {};
    return '<div class="rmap-legend">' + TS.core.regions.map(function (r, i) {
      return '<button type="button" class="rmap-chip' + (r.id === activeId ? " is-on" : "") +
        '" data-region="' + r.id + '" aria-pressed="' + (r.id === activeId) + '">' +
        '<span class="rmap-chip-n mono">' + (i + 1) + "</span>" +
        "<span>" + TS.escapeHtml(r.short) + "</span></button>";
    }).join("") + "</div>";
  };

  /**
   * Small SVG picture of what a p-value means: the slopes you get by shuffling
   * the same numbers, with the real slope marked. Used by the Ask panel.
   */
  TS.pValueViz = function (ctx) {
    var example = false;
    if (!ctx || !ctx.region || !ctx.variable) {
      ctx = { region: "sahel", variable: "soil_moisture", resolution: "monthly", deseasonalize: true };
      example = true;
    }
    var s = TS.series(ctx.region, ctx.variable, ctx.resolution || "monthly");
    if (!s) return "";
    var vals = [], i;
    for (i = 0; i < s.values.length; i++) {
      var v = s.values[i];
      if (v === null || v === undefined) continue;
      if (ctx.deseasonalize === false) vals.push(v);
      else vals.push(v - s.clim[i % 12]);
    }
    if (vals.length < 16) return "";

    var perm = TS.permutation(vals, 160);
    var per = ((ctx.resolution || "monthly") === "daily" ? 365.25 : 12) * 10;
    var real = perm.real * per;
    var slopes = perm.slopes.map(function (x) { return x * per; });
    var lo = Math.min.apply(null, slopes.concat([real]));
    var hi = Math.max.apply(null, slopes.concat([real]));
    if (!(hi > lo)) return "";
    var pad = (hi - lo) * 0.06;
    lo -= pad; hi += pad;

    var W = 300, H = 108, B = 22;
    var bins = 26, counts = new Array(bins).fill(0);
    slopes.forEach(function (x) {
      var k = Math.floor(((x - lo) / (hi - lo)) * bins);
      counts[Math.min(bins - 1, Math.max(0, k))] += 1;
    });
    var maxC = Math.max.apply(null, counts) || 1;
    var bw = W / bins;
    var bars = counts.map(function (c, k) {
      var h = (c / maxC) * (H - B - 6);
      return '<rect class="pv-bar" x="' + (k * bw + 0.6).toFixed(1) + '" y="' + (H - B - h).toFixed(1) +
        '" width="' + (bw - 1.2).toFixed(1) + '" height="' + Math.max(h, 0.8).toFixed(1) + '" rx="1"/>';
    }).join("");

    var rx = ((real - lo) / (hi - lo)) * W;
    var share = Math.round(perm.share * 100);

    return '<figure class="ask-viz">' +
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Distribution of slopes from shuffled data, with the real slope marked">' +
      '<line class="pv-axis" x1="0" y1="' + (H - B) + '" x2="' + W + '" y2="' + (H - B) + '"/>' +
      bars +
      '<line class="pv-real" x1="' + rx.toFixed(1) + '" y1="15" x2="' + rx.toFixed(1) + '" y2="' + (H - B) + '"/>' +
      '<text class="pv-tick" x="2" y="' + (H - 6) + '">' + TS.fmt.signed(lo, 3) + "</text>" +
      '<text class="pv-tick" x="' + W + '" y="' + (H - 6) + '" text-anchor="end">' + TS.fmt.signed(hi, 3) + "</text>" +
      '<text class="pv-real-label" x="' + (rx > W - 70 ? Math.max(6, rx - 5) : Math.min(W - 6, rx + 5)).toFixed(1) +
      '" y="9" text-anchor="' + (rx > W - 70 ? "end" : "start") + '">real trend</text>' +
      "</svg>" +
      "<figcaption>" + (example ? "Example: Sahel root-zone soil wetness, 1993–2024. " : "") +
      "Each bar is one shuffle of the same numbers. " + (share === 0 ? "None" : "Only <strong>" + share + "%</strong>") +
      " of them were at least as steep as the real trend — that is what the p-value counts.</figcaption>" +
      "</figure>";
  };

  var ASK = { open: false, context: null, history: [] };

  TS.askContext = function (ctx) {
    ASK.context = ctx;
    try { sessionStorage.setItem("ts_ask_context", JSON.stringify(ctx)); } catch (e) { /* ignore */ }
    var el = document.querySelector(".ask-context");
    if (el && ctx) {
      el.innerHTML = "<b>Current result:</b> " + ctx.summary;
    }
  };

  function restoreAskContext() {
    if (ASK.context) return ASK.context;
    try {
      var raw = sessionStorage.getItem("ts_ask_context");
      if (raw) ASK.context = JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return ASK.context;
  }

  function bubble(role, html, meta) {
    var div = document.createElement("div");
    div.className = "bubble bubble--" + role;
    div.innerHTML = (meta ? '<span class="bubble-meta">' + meta + "</span>" : "") + html;
    return div;
  }

  /**
   * Grounded answer engine.
   * Every number in an answer is read from the current result context; anything
   * outside the app's domain is declined. No network call is made.
   */
  function answer(question) {
    var c = ASK.context;
    var q = question.toLowerCase();
    var has = function () {
      for (var i = 0; i < arguments.length; i++) if (q.indexOf(arguments[i]) >= 0) return true;
      return false;
    };

    var v = c ? TS.variable(c.variable) : null;
    var reg = c ? TS.region(c.region) : null;
    var where = reg ? reg.name : "the selected region";
    var what = v ? v.name.toLowerCase() : "the variable";
    var unit = v ? v.unit : "";

    // off-topic guard
    if (has("weather tomorrow", "football", "recipe", "stock", "homework", "who are you", "joke", "song", "movie", "translate")) {
      return "That one is outside my case files. I can talk about this app's NASA data, the statistics behind a result, why two regions differ, or what a number means. Ask me one of those and I will dig in.";
    }

    if (has("p-value", "p value", "p=", "significan", "chance")) {
      if (!c) {
        return "A p-value is the probability of seeing a trend at least this steep if the series were really just random wobble. " +
          "We call a trend significant when p is below 0.05 (5%). Here is the picture — the bars are shuffles of a real series, " +
          "the orange line is the trend it actually has:" +
          '<div class="ask-viz-slot" data-viz="p"></div>';
      }
      var signLine = c.significant
        ? "Here p = <strong>" + TS.fmt.p(c.p) + "</strong>, which is below 0.05, so we call this a <strong>" + TS.verdictText[c.verdict].toLowerCase() + "</strong>."
        : "Here p = <strong>" + TS.fmt.p(c.p) + "</strong>, which is above 0.05, so we say there is <strong>no significant trend</strong> - the wobble could be chance.";
      return signLine + " " + (c.significant
        ? "Roughly, if " + what + " in " + where + " were not changing, we would see a trend this strong only about " + (c.p * 100).toFixed(1) + "% of the time."
        : "A longer record or a different time window may still reveal something - a non-significant result is not 'no change', it is 'not enough evidence yet'.") +
        '<div class="ask-viz-slot" data-viz="p"></div>';
    }

    if (has("tau", "kendall", "mann")) {
      return "Mann-Kendall is a rank test: instead of fitting a line, it counts how often later values are higher than earlier ones. Kendall's tau summarises that count between -1 and +1." +
        (c ? " For this case tau = <strong>" + c.tau.toFixed(2) + "</strong> with p = " + TS.fmt.p(c.p) + ", over " + c.n + " points." : "");
    }

    if (has("theil", "slope", "rate", "per decade", "how fast", "how much")) {
      if (!c) return "The rate of change is estimated with the Theil-Sen slope: the median of all the slopes you could draw between pairs of points. It ignores outliers, which is why we prefer it to a simple line fit.";
      return "The rate of change is <strong>" + TS.fmt.signed(c.slopePerDecade, 3) + " " + unit + " per decade</strong> (95% confidence interval " + TS.fmt.signed(c.ciLow, 3) + " to " + TS.fmt.signed(c.ciHigh, 3) + "). That comes from the Theil-Sen estimator - the median of every pairwise slope in the record, " + c.n + " points in all.";
    }

    if (has("why", "cause", "caused", "reason", "explain the change", "what made")) {
      return "The data can tell you <em>what</em> changed and <em>where</em>; it cannot prove <em>why</em>. What we can do is test associations: in this record " + what + " moves with other variables, and those links are worth following. The Detective Story and Cases pages are built for exactly that, and they always say 'associated with', never 'caused by'.";
    }

    if (has("differ", "compare", "two region", "opposite", "why do regions")) {
      return "Two regions can move in opposite directions under the same large-scale process. A monsoon belt shifting north will wet one side and dry the other; aerosols cool one basin while circulation warms another. Open <a href='compare.html'>Compare</a> and pick a preset pair - the Divergence banner tells you whether the two trends agree or oppose, with the actual slopes.";
    }

    if (has("shuffle", "chance machine", "random", "permutation")) {
      return "That is exactly the picture I draw for the p-value: shuffle the same numbers into random order, over and over, and measure the slope each time. If almost none of those shuffles are as steep as the real one, the real trend is unlikely to be chance." +
        (c ? '<div class="ask-viz-slot" data-viz="p"></div>' : "");
    }

    if (has("missing", "gap", "short", "reliable", "quality")) {
      if (!c) return "Short records make trends unreliable. We suggest at least ten years of monthly data before trusting a verdict.";
      return "This case uses " + c.n + " points from " + c.from + " to " + c.to + ", with <strong>" + TS.fmt.num(c.missingPct, 1) + "%</strong> missing. " +
        (c.missingPct > 20 ? "That is a lot of gaps - treat the verdict with caution." : "Gaps are small enough that the verdict should hold.");
    }

    if (has("data", "source", "nasa", "merra", "where does")) {
      return "Every series comes from NASA POWER, which serves the MERRA-2 reanalysis (and GPM/GPCP-corrected precipitation). Nothing here is live: the 1993-2024 monthly series and 2015-2024 daily series were downloaded once and cached, so the demo never depends on the network. Full sources are on the <a href='data-method.html'>Data &amp; Method</a> page.";
    }

    if (has("what am i looking at", "this result", "what does this mean", "summary", "so what")) {
      if (!c) return "Run a case on the Investigate page and I will summarise exactly what the chart and the statistics are saying.";
      return "<strong>" + v.name + " in " + where + " (" + c.from + "-" + c.to + ")</strong>: changing by " + TS.fmt.signed(c.slopePerDecade, 3) + " " + unit + " per decade, which is " + TS.fmt.pct(c.pctChange) + " between the first and last three years. The Mann-Kendall test gives p = " + TS.fmt.p(c.p) + ", so the verdict is <strong>" + TS.verdictText[c.verdict] + "</strong>.";
    }

    if (has("hello", "hi ", "hey", "salaam", "salam")) {
      return "Hello, detective. Ask me about the p-value, the slope, the missing data, or why two regions can disagree - or open a case and I will use its real numbers.";
    }

    return "I can help with: what the p-value means, what the slope says in plain units, how Mann-Kendall works, why two regions differ, where the data comes from, or how the p-value picture is built. " +
      (c ? "I am currently looking at <strong>" + v.name + "</strong> in " + where + "." : "Open a case first and I can quote its exact numbers.");
  }

  function sendQuestion(text) {
    var chat = document.querySelector(".chat");
    if (!chat) return;
    var question = (text || "").trim();
    if (!question) return;

    chat.appendChild(bubble("user", escapeHtml(question), "You"));
    chat.scrollTop = chat.scrollHeight;

    var typing = document.createElement("div");
    typing.className = "bubble bubble--ai";
    typing.innerHTML = '<span class="bubble-meta">Trendoscope</span><span class="typing"><span></span><span></span><span></span></span>';
    chat.appendChild(typing);
    chat.scrollTop = chat.scrollHeight;

    setTimeout(function () {
      typing.remove();
      var b = bubble("ai", answer(question), "Grounded answer · built only from the cached series");
      chat.appendChild(b);
      Array.prototype.forEach.call(b.querySelectorAll('.ask-viz-slot[data-viz="p"]'), function (slot) {
        slot.innerHTML = TS.pValueViz(ASK.context);
      });
      chat.scrollTop = chat.scrollHeight;
      ASK.history.push({ q: question, a: "…" });
    }, 620);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  TS.openAsk = function (prefill, ctx) {
    var panel = document.querySelector(".ask-panel");
    if (!panel) return;
    if (ctx) TS.askContext(ctx);
    restoreAskContext();
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    document.querySelector(".ask-fab").setAttribute("aria-expanded", "true");
    ASK.open = true;

    var chat = panel.querySelector(".chat");
    if (chat && !chat.dataset.ready) {
      chat.dataset.ready = "1";
      chat.appendChild(bubble("ai", "I am Dune, your data assistant. I only quote numbers from the result you have open - never invented ones. Ask me what a p-value is, what the slope means, or why two regions disagree.", "Trendoscope"));
    }
    if (prefill) {
      var input = panel.querySelector(".ask-input");
      if (input) { input.value = prefill; input.focus(); }
    } else {
      var inp = panel.querySelector(".ask-input");
      if (inp) setTimeout(function () { inp.focus(); }, 260);
    }
  };

  TS.closeAsk = function () {
    var panel = document.querySelector(".ask-panel");
    if (!panel) return;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    document.querySelector(".ask-fab").setAttribute("aria-expanded", "false");
    ASK.open = false;
  };

  TS.initAsk = function () {
    var fab = document.querySelector(".ask-fab");
    var panel = document.querySelector(".ask-panel");
    if (!fab || !panel) return;

    fab.addEventListener("click", function () { TS.openAsk(); });
    panel.querySelector(".ask-close").addEventListener("click", TS.closeAsk);

    panel.querySelector(".ask-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = panel.querySelector(".ask-input");
      sendQuestion(input.value);
      input.value = "";
    });

    Array.prototype.forEach.call(panel.querySelectorAll(".ask-suggest .chip"), function (chip) {
      chip.addEventListener("click", function () {
        sendQuestion(chip.getAttribute("data-q") || chip.textContent);
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ASK.open) TS.closeAsk();
    });

    // deep link: ask.html?q=...
    var params = new URLSearchParams(location.search);
    if (params.get("q")) {
      TS.openAsk();
      sendQuestion(params.get("q"));
    }
    var ctx = restoreAskContext();
    if (ctx) TS.askContext(ctx);
  };


  /* Shared case card, used on the home page and the cases list. */
  TS.caseCard = function (c) {
    var region = TS.region(c.region);
    var target = TS.variable(c.target);
    return '<article class="case-card paper">' +
      '<div class="case-no"><span>Case file ' + c.no + '</span><span class="tag">' + TS.escapeHtml(c.difficulty) + '</span></div>' +
      '<h3>' + TS.escapeHtml(c.title) + '</h3>' +
      '<p class="case-event">' + TS.escapeHtml(c.event) + '</p>' +
      '<div class="case-meta">' +
        '<span class="tag">' + TS.escapeHtml(region.short) + '</span>' +
        '<span class="tag">' + TS.escapeHtml(target.short) + '</span>' +
        '<span class="tag">' + c.suspects.length + ' suspects</span>' +
      '</div>' +
      '<a class="btn btn-ink btn-sm" href="detective-game.html?id=' + c.id + '">Start case <span aria-hidden="true">→</span></a>' +
    '</article>';
  };

  /* --------------------------------------------------------------- misc -- */

  TS.escapeHtml = escapeHtml;

  TS.copy = function (text, message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        TS.toast(message || "Copied");
      }).catch(function () { TS.toast("Copy failed — select the text manually"); });
    } else {
      TS.toast("Copy is not available in this browser");
    }
  };

  TS.download = function (filename, mime, content) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  };

  TS.qs = function (name) {
    return new URLSearchParams(location.search).get(name);
  };

  document.addEventListener("DOMContentLoaded", function () {
    TS.initAsk();
  });
})();
