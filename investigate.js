/* ==========================================================================
   Trendoscope — investigate.js
   The core screen: region map, case setup, results and the guided demo.
   ========================================================================== */
(function () {
  "use strict";
  var TS = window.TS;
  if (!document.getElementById("setup")) return;

  var state = {
    variable: "soil_moisture",
    region: "sahel",
    from: 1993,
    to: 2024,
    resolution: "monthly",
    deseason: true,
    analysis: null,
    running: false
  };

  var $ = function (sel) { return document.querySelector(sel); };
  var resultsEl = $("#results");

  /* ------------------------------------------------------------ setup UI -- */

  function powerLabel(p) {
    return { water: "Water", land: "Land", weather: "Weather", vegetation: "Vegetation" }[p] || p;
  }

  function fillVariableSelect() {
    var groups = {};
    TS.core.variables.forEach(function (v) {
      (groups[v.power] = groups[v.power] || []).push(v);
    });
    var html = ["water", "land", "weather", "vegetation"].map(function (p) {
      var opts = groups[p].map(function (v) {
        return '<option value="' + v.id + '">' + TS.escapeHtml(v.name) + " (" + TS.escapeHtml(TS.fmt.unit(v)) + ")</option>";
      }).join("");
      return '<optgroup label="' + powerLabel(p) + '">' + opts + "</optgroup>";
    }).join("");
    $("#variable").innerHTML = html;
    $("#variable").value = state.variable;
  }

  function fillRegionSelect() {
    $("#region").innerHTML = TS.core.regions.map(function (r) {
      return '<option value="' + r.id + '">' + TS.escapeHtml(r.name) + "</option>";
    }).join("");
    $("#region").value = state.region;
  }

  function fillRanges() {
    var r = TS.range(state.resolution);
    function opts(selected) {
      var out = [];
      for (var y = r.min; y <= r.max; y++) {
        out.push('<option value="' + y + '"' + (y === selected ? " selected" : "") + ">" + y + "</option>");
      }
      return out.join("");
    }
    $("#from").innerHTML = opts(state.from);
    $("#to").innerHTML = opts(state.to);
  }

  function updateVariableDef() {
    var v = TS.variable(state.variable);
    $("#variable-def").innerHTML = "<strong>" + TS.escapeHtml(v.name) + "</strong> · " +
      TS.escapeHtml(v.unit) + " · " + TS.escapeHtml(v.mission) +
      "<br><span class='dim'>" + TS.escapeHtml(v.definition) + "</span>";
  }

  function updateMiniMap() {
    var el = $("#mini-map");
    if (el) el.innerHTML = TS.miniMap(state.region);
  }

  function renderRegionMap() {
    var band = document.getElementById("region-band");
    if (!band) return;
    var map = band.querySelector(".region-band-map");
    var legend = band.querySelector(".region-band-legend");
    if (map) map.innerHTML = TS.regionMap(state.region);
    if (legend) legend.innerHTML = TS.regionLegend(state.region);

    var cap = document.getElementById("region-band-caption");
    if (cap && !cap.textContent.trim()) {
      var r = TS.region(state.region);
      cap.innerHTML = "<strong>" + TS.escapeHtml(r.name) + "</strong> · " + TS.escapeHtml(r.note);
    }
  }

  function pickRegion(id) {
    if (!TS.region(id) || id === state.region) {
      renderRegionMap();
      return;
    }
    state.region = id;
    $("#region").value = id;
    updateMiniMap();
    renderRegionMap();
    var cap = document.getElementById("region-band-caption");
    if (cap) {
      var r = TS.region(id);
      cap.innerHTML = "<strong>" + TS.escapeHtml(r.name) + "</strong> · " + TS.escapeHtml(r.note) +
        ' <span class="dim mono">' + r.box[2] + "–" + r.box[0] + "°N, " + r.box[1] + "–" + r.box[3] + "°E</span>";
    }
  }

  function updateRangeWarning() {
    var years = state.to - state.from + 1;
    var box = $("#range-warning");
    if (years < 10) {
      box.innerHTML = '<div class="warning">' + TS.icon("alert") +
        "<span><strong>Short record.</strong> Only " + years + " years selected. Short records make trends unreliable — ten years or more is safer.</span></div>";
    } else {
      box.innerHTML = "";
    }
  }

  /* -------------------------------------------------------------- results -- */

  function emptyState() {
    resultsEl.innerHTML =
      '<div class="empty-state">' +
      '<span class="icon-tile" style="width:52px;height:52px">' + TS.icon("search") + "</span>" +
      "<h3>No case open yet</h3>" +
      "<p>Pick a region on the map above, choose a variable in the panel, then press <strong>Open the case</strong>.<br>" +
      "The chart, the verdict and all six statistics appear here.</p>" +
      '<div class="empty-actions">' +
      '<button class="btn btn-primary" type="button" id="empty-run">Open the example case</button>' +
      '<button class="btn btn-ghost" type="button" id="empty-demo">Watch the demo</button>' +
      "</div></div>";
    $("#empty-run").addEventListener("click", function () { runCase(); });
    $("#empty-demo").addEventListener("click", function () { startDemo(); });
  }

  function skeleton() {
    resultsEl.innerHTML =
      '<div class="skeleton sk-chart" style="height:360px"></div>' +
      '<div class="skeleton sk-line" style="width:60%;height:22px;margin-top:20px"></div>' +
      '<div class="sk-grid">' +
      '<div class="skeleton" style="height:86px"></div><div class="skeleton" style="height:86px"></div>' +
      '<div class="skeleton" style="height:86px"></div><div class="skeleton" style="height:86px"></div>' +
      '<div class="skeleton" style="height:86px"></div><div class="skeleton" style="height:86px"></div>' +
      "</div>" +
      '<p class="dim mono" style="margin-top:14px">Computing Mann-Kendall and Theil-Sen…</p>';
  }

  function help(text) {
    return '<button class="help" type="button" aria-label="' + TS.escapeHtml(text) + '">?' +
      '<span class="help__bubble">' + text + "</span></button>";
  }

  function unitSuffix(v) {
    return v.unit === "fraction (0-1)" ? "" : " " + TS.fmt.unit(v);
  }
  function unitLine(v) {
    return v.unit === "fraction (0-1)" ? "0–1 scale" : v.unit;
  }

  function verdictSentence(a, v, region) {
    var unit = unitSuffix(v);
    var scale = v.unit === "fraction (0-1)" ? " on the 0–1 scale" : "";
    var dir = a.slopePerDecade > 0 ? "rose" : "fell";
    var pad = Math.abs(a.slopePerDecade) >= 1 ? 2 : 3;
    var head = TS.escapeHtml(v.name) + " in " + TS.escapeHtml(region.name) + " " + dir + " by <strong>" +
      TS.fmt.num(Math.abs(a.slopePerDecade), pad) + " " + TS.escapeHtml(unit) +
      "</strong> per decade" + scale + " between " + a.from + " and " + a.to + ".";
    if (a.significant) {
      return head + " The Mann-Kendall test says this is very unlikely to be chance (" + TS.fmt.pText(a.p) + ").";
    }
    return head + " But the test cannot rule out chance (" + TS.fmt.pText(a.p) + "), so we report <strong>no significant trend</strong>. Still interesting: a longer record may reveal more.";
  }

  function renderResults(a) {
    var v = TS.variable(state.variable);
    var region = TS.region(state.region);
    var unit = unitSuffix(v);
    var pad = v.unit === "fraction (0-1)" ? 4 : 3;
    var mode = a.deseasonalize ? "Seasonal cycle removed" : "Raw values (seasonal cycle kept)";
    var resLabel = a.resolution === "daily" ? "Daily" : "Monthly";

    var warnings = "";
    if (a.years < 10) {
      warnings += '<div class="warning">' + TS.icon("alert") + "<span><strong>Short record.</strong> " +
        a.years + " years of data. Short records make trends unreliable.</span></div>";
    }
    if (a.missingPct > 20) {
      warnings += '<div class="warning warning--danger">' + TS.icon("alert") + "<span><strong>Lots of gaps.</strong> " +
        TS.fmt.num(a.missingPct, 1) + "% of this window has no value. Treat the verdict with care.</span></div>";
    }

    resultsEl.innerHTML =
      '<div class="result-head">' +
      '<div>' +
      '<p class="result-sub">' + resLabel + " · " + a.from + "–" + a.to + " · " + a.n + " points</p>" +
      '<h2 class="result-title">' + TS.escapeHtml(v.name) + " · " + TS.escapeHtml(region.name) + "</h2>" +
      '<p class="result-sub" style="margin-top:6px">' + mode + "</p>" +
      "</div>" +
      '<button class="btn btn-quiet btn-sm" type="button" id="ask-about">Ask about this result</button>' +
      "</div>" + warnings +

      '<div class="chart-frame">' +
      '<div class="chart-head">' +
      "<div><h3 class=\"chart-title\">" + (a.deseasonalize ? "Anomaly of " : "") + TS.escapeHtml(v.short.toLowerCase()) + "</h3>" +
      '<p class="chart-sub">' + TS.escapeHtml(a.deseasonalize ? "value minus its month-of-year average" : "measured value") + "</p></div>" +
      '<div class="chart-tools">' +
      '<button class="btn btn-quiet btn-sm" type="button" id="dl-png">Download PNG</button>' +
      '<button class="btn btn-quiet btn-sm" type="button" id="dl-csv">Download CSV</button>' +
      "</div></div>" +
      '<div class="chart-host" id="chart"></div>' +
      '<p class="chart-alt">Chart summary: ' + TS.escapeHtml(v.name) + " in " + TS.escapeHtml(region.name) +
      ", " + a.from + " to " + a.to + ", " + a.n + " points. Trend of " + TS.fmt.signed(a.slopePerDecade, pad) + unit +
      " per decade, " + TS.verdictText[a.verdict].toLowerCase() + ".</p>" +
      '<p class="chart-source">Source: ' + TS.escapeHtml(v.source) + " · NASA POWER / MERRA-2 · cached.</p>" +
      "</div>" +

      '<div class="verdict-row">' +
      '<div class="stamp ' + TS.verdictClass[a.verdict] + '">' + TS.icon(TS.verdictIcon[a.verdict]) +
      TS.verdictText[a.verdict] + "</div>" +
      '<p class="verdict-sentence">' + verdictSentence(a, v, region) + "</p>" +
      "</div>" +

      '<div class="stat-grid">' +
      statCard("Rate of change", TS.fmt.signed(a.slopePerDecade, pad) + unit, "per decade" + (unit ? "" : " (0–1)"),
        "The median of every pairwise slope in the record (Theil-Sen). Robust to outliers.") +
      statCard("Total change", a.pctChange === null ? "–" : TS.fmt.pct(a.pctChange), a.pctChange === null ? "window too short" : "first 3 yrs → last 3 yrs",
        "How much the average moved between the first three years and the last three years of the window.") +
      statCard("p-value", TS.fmt.p(a.p), a.significant ? "below 0.05" : "above 0.05",
        "The chance of seeing a trend this strong if nothing were really changing. Below 0.05 we call the trend significant.") +
      statCard("Kendall's tau", a.tau.toFixed(2), "rank correlation",
        "A number between -1 and +1 describing how consistently later values are higher or lower than earlier ones.") +
      statCard("Mean", TS.fmt.num(a.mean, 2) + unit, (a.deseasonalize ? "of the anomalies" : "of the values") + (unit ? "" : " (0–1)"),
        "The average of the values used in the test.") +
      statCard("Missing data", TS.fmt.num(a.missingPct, 1) + "%", "of the window",
        "Share of time steps with no value. Gaps are counted, never filled.") +
      "</div>" +

      '<div class="paper insight">' +
      '<h3 class="insight-title">' + TS.icon("search") + " What the data says</h3>" +
      '<div class="insight-rows">' +
      insightRow("What", TS.escapeHtml(v.name) + " (" + TS.escapeHtml(TS.fmt.unit(v)) + "), " + resLabel.toLowerCase() + " values.") +
      insightRow("Where", TS.escapeHtml(region.name) + " — " + TS.escapeHtml(region.note)) +
      insightRow("How much", "Changing by <strong>" + TS.fmt.signed(a.slopePerDecade, pad) + unit +
        " per decade</strong> " +
        (a.ciOk ? "(95% CI " + TS.fmt.signed(a.ciLow, pad) + " to " + TS.fmt.signed(a.ciHigh, pad) + ")" : "(95% interval not reliable at this record length)") +
        (a.pctChange === null ? "." : ", " + TS.fmt.pct(a.pctChange) + " across the record.")) +
      insightRow("Is it significant?", a.significant
        ? "<strong>Yes.</strong> The p-value is below 0.05, so the trend is unlikely to be chance (" + TS.fmt.pText(a.p) + ")."
        : "<strong>No.</strong> " + TS.fmt.pText(a.p) + ", which is above 0.05 — not enough evidence yet. That is not the same as “no trend”.") +
      "</div></div>";


    // chart
    TS.chart.timeseries($("#chart"), {
      analysis: a,
      unit: unit,
      yTitle: (a.deseasonalize ? "anomaly (" + TS.fmt.unit(v) + ")" : TS.fmt.unit(v)),
      color: TS.powerHex(v.power),
      zeroLine: a.deseasonalize,
      valueLabel: v.short.toLowerCase(),
      seriesName: v.short
    });

    // downloads
    $("#dl-png").addEventListener("click", function () {
      TS.chart.downloadPNG($("#chart"), "trendoscope-" + state.region + "-" + state.variable + ".png");
    });
    $("#dl-csv").addEventListener("click", function () {
      TS.chart.downloadCSV(a, "trendoscope-" + state.region + "-" + state.variable + ".csv");
    });

    // ask
    $("#ask-about").addEventListener("click", function () {
      TS.openAsk("What does this result mean?", {
        variable: state.variable,
        region: state.region,
        summary: v.name + " in " + region.name + " (" + a.from + "–" + a.to + ")",
        slopePerDecade: a.slopePerDecade, p: a.p, tau: a.tau, mean: a.mean,
        missingPct: a.missingPct, from: a.from, to: a.to,
        significant: a.significant, verdict: a.verdict, unit: v.unit,
        resolution: state.resolution, deseasonalize: state.deseason
      });
    });

    // context for the floating ask panel even if not opened from here
    TS.askContext({
      variable: state.variable,
      region: state.region,
      summary: v.name + " in " + region.name + " (" + a.from + "–" + a.to + ")",
      slopePerDecade: a.slopePerDecade, p: a.p, tau: a.tau, mean: a.mean,
      missingPct: a.missingPct, from: a.from, to: a.to,
      significant: a.significant, verdict: a.verdict, unit: v.unit,
      resolution: state.resolution, deseasonalize: state.deseason
    });
  }

  function statCard(label, value, unit, tip) {
    return '<div class="stat-card">' +
      '<span class="stat-label">' + label + help(tip) + "</span>" +
      '<span class="stat-value tnum">' + value + "</span>" +
      '<span class="stat-unit">' + unit + "</span>" +
      "</div>";
  }

  function insightRow(k, v) {
    return '<div class="insight-row"><span class="insight-key">' + k + '</span><span class="insight-val">' + v + "</span></div>";
  }

  /* ------------------------------------------------------------ run case -- */

  function runCase() {
    if (state.running) return;
    state.running = true;
    skeleton();

    var go = function () {
      setTimeout(function () {
        var a = TS.analyze({
          region: state.region,
          variable: state.variable,
          resolution: state.resolution,
          from: state.from,
          to: state.to,
          deseasonalize: state.deseason
        });
        state.running = false;
        if (a.error === "nodata") {
          resultsEl.innerHTML = '<div class="warning warning--danger">' + TS.icon("alert") +
            "<span><strong>No data for that combination.</strong> This region has no series for that variable and range. Try another region or range.</span></div>";
          return;
        }
        if (a.error === "tooShort") {
          resultsEl.innerHTML = '<div class="warning warning--danger">' + TS.icon("alert") +
            "<span><strong>Not enough points.</strong> This window has only " + (a.n || 0) +
            " values. Widen the time range to run a trend test.</span></div>";
          return;
        }
        state.analysis = a;
        renderResults(a);
      }, 180);
    };

    if (state.resolution === "daily") {
      TS.loadDaily().then(go).catch(function () {
        state.running = false;
        resultsEl.innerHTML = '<div class="warning warning--danger">' + TS.icon("alert") +
          "<span><strong>Daily cache unavailable.</strong> Switch back to Monthly.</span></div>";
      });
    } else {
      go();
    }
  }

  /* ---------------------------------------------------------- guided demo -- */

  var DEMO = [
    {
      target: "#variable",
      title: "Pick a variable",
      text: "Eight NASA variables, grouped by water, land, weather and sunlight. Start with root-zone soil wetness: how much water the soil holds where roots grow."
    },
    {
      target: "#region",
      title: "Pick a region",
      text: "Six preset boxes, Egypt and MENA first. The map shows exactly which pixels are averaged."
    },
    {
      target: "#from",
      title: "Choose the years",
      text: "The default uses the whole record, 1993 to 2024. Under ten years, the app warns you that trends get unreliable."
    },
    {
      target: ".verdict-row",
      title: "Read the verdict first",
      text: "The stamp is the answer: significant increase, significant decrease, or no significant trend. The sentence underneath says it in plain words."
    },
    {
      target: "#ask-about",
      title: "Then ask about it",
      text: "Press Ask about this result and ask what the p-value means. You get an answer built only from this case, plus a picture of what the p-value is counting."
    }
  ];

  var demoIndex = 0;

  function startDemo() {
    demoIndex = 0;
    $("#demo-layer").classList.add("is-open");
    $("#demo-layer").setAttribute("aria-hidden", "false");
    // fixed example case so the demo is identical every time
    state.variable = "soil_moisture";
    state.region = "nile_delta";
    state.from = 1993;
    state.to = 2024;
    state.resolution = "monthly";
    state.deseason = true;
    syncControls();
    runCase();
    setTimeout(function () { showStep(0); }, 700);
  }

  function showStep(i) {
    var step = DEMO[i];
    if (!step) return endDemo(true);
    demoIndex = i;
    var el = document.querySelector(step.target);
    $("#demo-step").textContent = "Step " + (i + 1) + " of " + DEMO.length;
    $("#demo-title").textContent = step.title;
    $("#demo-text").textContent = step.text;
    $("#demo-dots").innerHTML = DEMO.map(function (_, k) {
      return '<span class="' + (k === i ? "is-on" : "") + '"></span>';
    }).join("");
    $("#demo-back").disabled = i === 0;
    $("#demo-next").textContent = i === DEMO.length - 1 ? "Finish" : "Next";

    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(function () { position(step, el); }, 420);
    }
  }

  function position(step, el) {
    var r = el.getBoundingClientRect();
    var spot = $("#demo-spot");
    var pad = 8;
    spot.style.top = (r.top - pad) + "px";
    spot.style.left = (r.left - pad) + "px";
    spot.style.width = (r.width + pad * 2) + "px";
    spot.style.height = (r.height + pad * 2) + "px";

    var card = $("#demo-card");
    var w = Math.min(360, window.innerWidth - 32);
    card.style.width = w + "px";
    var below = r.bottom + 16;
    var fitsBelow = below + 260 < window.innerHeight;
    card.style.top = (fitsBelow ? below : Math.max(16, r.top - 276)) + "px";
    card.style.left = Math.min(Math.max(16, r.left), window.innerWidth - w - 16) + "px";
  }

  function endDemo(done) {
    $("#demo-layer").classList.remove("is-open");
    $("#demo-layer").setAttribute("aria-hidden", "true");
    if (done) {
      TS.toast("Demo finished — change any field and press Open the case");
      var v = $("#variable");
      if (v) v.focus();
    }
  }

  /* --------------------------------------------------------------- wiring -- */

  function syncControls() {
    $("#variable").value = state.variable;
    $("#region").value = state.region;
    $("#from").value = state.from;
    $("#to").value = state.to;
    document.querySelectorAll("#resolution button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.res === state.resolution));
    });
    $("#deseason").setAttribute("aria-pressed", String(state.deseason));
    updateVariableDef();
    updateMiniMap();
    updateRangeWarning();
  }

  function init() {
    fillVariableSelect();
    fillRegionSelect();
    fillRanges();
    updateVariableDef();
    updateMiniMap();
    updateRangeWarning();

    var params = new URLSearchParams(location.search);
    if (params.get("power")) {
      var first = TS.core.variables.filter(function (v) { return v.power === params.get("power"); })[0];
      if (first) state.variable = first.id;
    }
    if (params.get("variable") && TS.variable(params.get("variable"))) state.variable = params.get("variable");
    if (params.get("region") && TS.region(params.get("region"))) state.region = params.get("region");
    syncControls();
    renderRegionMap();

    $("#variable").addEventListener("change", function (e) {
      state.variable = e.target.value;
      updateVariableDef();
    });
    $("#region").addEventListener("change", function (e) {
      state.region = e.target.value;
      updateMiniMap();
      renderRegionMap();
    });

    var band = document.getElementById("region-band");
    if (band) {
      band.addEventListener("click", function (e) {
        var t = e.target.closest("[data-region]");
        if (t) pickRegion(t.getAttribute("data-region"));
      });
      band.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var t = e.target.closest("[data-region]");
        if (t) { e.preventDefault(); pickRegion(t.getAttribute("data-region")); }
      });
    }
    $("#from").addEventListener("change", function (e) {
      state.from = +e.target.value;
      if (state.from > state.to) { state.to = state.from; $("#to").value = state.to; }
      updateRangeWarning();
    });
    $("#to").addEventListener("change", function (e) {
      state.to = +e.target.value;
      if (state.to < state.from) { state.from = state.to; $("#from").value = state.from; }
      updateRangeWarning();
    });

    document.querySelectorAll("#resolution button").forEach(function (b) {
      b.addEventListener("click", function () {
        var res = b.dataset.res;
        if (res === state.resolution) return;
        state.resolution = res;
        var r = TS.range(res);
        state.from = r.min;
        state.to = r.max;
        document.querySelectorAll("#resolution button").forEach(function (x) {
          x.setAttribute("aria-pressed", String(x.dataset.res === res));
        });
        fillRanges();
        updateRangeWarning();
        if (res === "daily") {
          TS.loadDaily().then(function () { TS.toast("Daily cache loaded (2015–2024)"); })
            .catch(function () { TS.toast("Could not load the daily cache"); });
        }
      });
    });

    $("#deseason").addEventListener("click", function () {
      state.deseason = !state.deseason;
      $("#deseason").setAttribute("aria-pressed", String(state.deseason));
    });

    $("#setup").addEventListener("submit", function (e) {
      e.preventDefault();
      runCase();
    });

    $("#btn-demo").addEventListener("click", startDemo);
    $("#demo-next").addEventListener("click", function () { showStep(demoIndex + 1); });
    $("#demo-back").addEventListener("click", function () { showStep(Math.max(0, demoIndex - 1)); });
    $("#demo-skip").addEventListener("click", function () { endDemo(false); });
    $("#demo-layer").addEventListener("click", function (e) {
      if (e.target.classList.contains("demo-scrim")) endDemo(false);
    });
    document.addEventListener("keydown", function (e) {
      if (!$("#demo-layer").classList.contains("is-open")) return;
      if (e.key === "Escape") endDemo(false);
      if (e.key === "ArrowRight") showStep(demoIndex + 1);
      if (e.key === "ArrowLeft") showStep(Math.max(0, demoIndex - 1));
    });

    emptyState();

    // deep links
    if (params.get("run") === "1") runCase();
    if (params.get("demo") === "1") {
      setTimeout(startDemo, 300);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
