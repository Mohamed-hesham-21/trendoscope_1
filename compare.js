/* ==========================================================================
   Trendoscope — compare.js
   Two regions, one variable, one range: overlaid chart, divergence banner,
   two stat columns and a grounded "why" note.
   ========================================================================== */
(function () {
  "use strict";
  var TS = window.TS;
  if (!document.getElementById("compare-setup")) return;

  var state = { variable: "precip", a: "sahel", b: "amazon", from: 1993, to: 2024, deseason: true };
  var out = document.getElementById("compare-results");

  function fillSelects() {
    var groups = {};
    TS.core.variables.forEach(function (v) { (groups[v.power] = groups[v.power] || []).push(v); });
    document.getElementById("c-variable").innerHTML = ["water", "land", "weather", "vegetation"].map(function (p) {
      return '<optgroup label="' + p.charAt(0).toUpperCase() + p.slice(1) + '">' +
        groups[p].map(function (v) { return '<option value="' + v.id + '">' + TS.escapeHtml(v.name) + "</option>"; }).join("") +
        "</optgroup>";
    }).join("");

    var regions = TS.core.regions.map(function (r) {
      return '<option value="' + r.id + '">' + TS.escapeHtml(r.name) + "</option>";
    }).join("");
    document.getElementById("c-a").innerHTML = regions;
    document.getElementById("c-b").innerHTML = regions;

    var r = TS.range("monthly");
    var years = [];
    for (var y = r.min; y <= r.max; y++) years.push('<option value="' + y + '">' + y + "</option>");
    document.getElementById("c-from").innerHTML = years.join("");
    document.getElementById("c-to").innerHTML = years.join("");

    document.getElementById("c-variable").value = state.variable;
    document.getElementById("c-a").value = state.a;
    document.getElementById("c-b").value = state.b;
    document.getElementById("c-from").value = state.from;
    document.getElementById("c-to").value = state.to;
  }

  function presets() {
    var host = document.getElementById("presets");
    host.innerHTML = TS.core.presetPairs.map(function (p) {
      return '<button class="preset-chip" type="button" data-id="' + p.id + '">' +
        '<span class="preset-title">' + TS.escapeHtml(p.title) + "</span>" +
        '<span class="preset-sub">' + TS.escapeHtml(TS.variable(p.variable).short) + " · " +
        TS.escapeHtml(TS.region(p.a).short) + " vs " + TS.escapeHtml(TS.region(p.b).short) + "</span>" +
        "</button>";
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".preset-chip"), function (chip) {
      chip.addEventListener("click", function () {
        var p = TS.core.presetPairs.filter(function (x) { return x.id === chip.dataset.id; })[0];
        state.variable = p.variable;
        state.a = p.a;
        state.b = p.b;
        state.from = 1993;
        state.to = 2024;
        document.getElementById("c-variable").value = p.variable;
        document.getElementById("c-a").value = p.a;
        document.getElementById("c-b").value = p.b;
        document.getElementById("c-from").value = 1993;
        document.getElementById("c-to").value = 2024;
        run(p);
      });
    });
  }

  function statBlock(a, v, color, label) {
    return '<div class="region-col">' +
      '<h3><span class="power-dot" style="background:' + color + '"></span>' + TS.escapeHtml(label) + "</h3>" +
      '<div class="stamp ' + TS.verdictClass[a.verdict] + '">' + TS.icon(TS.verdictIcon[a.verdict]) + TS.verdictText[a.verdict] + "</div>" +
      '<div class="mini-stats">' +
      '<div class="mini-stat"><div class="k">Rate / decade</div><div class="v">' + TS.fmt.signed(a.slopePerDecade, 3) + "</div></div>" +
      '<div class="mini-stat"><div class="k">p-value</div><div class="v">' + TS.fmt.p(a.p) + "</div></div>" +
      '<div class="mini-stat"><div class="k">Kendall tau</div><div class="v">' + a.tau.toFixed(2) + "</div></div>" +
      '<div class="mini-stat"><div class="k">Missing</div><div class="v">' + TS.fmt.num(a.missingPct, 1) + "%</div></div>" +
      "</div></div>";
  }

  function run(preset) {
    var v = TS.variable(state.variable);
    var A = TS.analyze({ region: state.a, variable: state.variable, resolution: "monthly", from: state.from, to: state.to, deseasonalize: state.deseason });
    var B = TS.analyze({ region: state.b, variable: state.variable, resolution: "monthly", from: state.from, to: state.to, deseasonalize: state.deseason });

    if (A.error || B.error) {
      out.innerHTML = '<div class="warning warning--danger">' + TS.icon("alert") +
        "<span><strong>No data.</strong> One of these regions has no series for that variable and range.</span></div>";
      return;
    }

    var nameA = TS.region(state.a).name;
    var nameB = TS.region(state.b).name;
    var colorA = "#4C9BE0";
    var colorB = "#8CC63F";
    var opposite = (A.slopePerDecade > 0) !== (B.slopePerDecade > 0);
    var bothSig = A.significant && B.significant;
    var unit = " " + TS.fmt.unit(v);

    var banner = opposite
      ? '<div class="diverge">' + TS.icon("swap") +
        "<div><h3>These regions are moving in OPPOSITE directions</h3>" +
        "<p>" + TS.escapeHtml(nameA) + " is " + (A.slopePerDecade > 0 ? "rising" : "falling") + " by " +
        TS.fmt.num(Math.abs(A.slopePerDecade), 3) + unit + " per decade, while " + TS.escapeHtml(nameB) + " is " +
        (B.slopePerDecade > 0 ? "rising" : "falling") + " by " + TS.fmt.num(Math.abs(B.slopePerDecade), 3) + unit +
        " per decade. " + (bothSig ? "Both trends pass the significance test, so this is a real disagreement, not noise."
          : "Only one of the two trends passes the significance test, so treat the disagreement with care.") + "</p></div></div>"
      : '<div class="diverge diverge--same">' + TS.icon("up") +
        "<div><h3>These regions are moving in the SAME direction</h3>" +
        "<p>Both are " + (A.slopePerDecade > 0 ? "rising" : "falling") + " — " + TS.escapeHtml(nameA) + " by " +
        TS.fmt.num(Math.abs(A.slopePerDecade), 3) + unit + " per decade and " + TS.escapeHtml(nameB) + " by " +
        TS.fmt.num(Math.abs(B.slopePerDecade), 3) + unit + " per decade. " +
        (bothSig ? "Both pass the significance test." : "Only one of them passes the significance test.") + "</p></div></div>";

    if (!preset) {
      preset = TS.core.presetPairs.filter(function (p) {
        return p.variable === state.variable && p.a === state.a && p.b === state.b;
      })[0] || null;
    }
    var note = preset && preset.note ? preset.note : "Compare the two slopes and their p-values before reading anything into the shapes: two lines can look alike over a few years and still have very different thirty-year trends.";

    out.innerHTML =
      '<div class="result-head"><div>' +
      '<p class="result-sub">Monthly · ' + state.from + "–" + state.to + " · seasonal cycle " + (state.deseason ? "removed" : "kept") + "</p>" +
      '<h2 class="result-title">' + TS.escapeHtml(v.name) + " · " + TS.escapeHtml(TS.region(state.a).short) + " vs " + TS.escapeHtml(TS.region(state.b).short) + "</h2>" +
      "</div></div>" +

      '<div class="chart-frame">' +
      '<div class="chart-head"><div><h3 class="chart-title">' + TS.escapeHtml(v.short) + " in two regions</h3>" +
      '<p class="chart-sub">faint = measured · solid = trend</p></div>' +
      '<div class="chart-tools"><button class="btn btn-quiet btn-sm" type="button" id="c-png">Download PNG</button></div></div>' +
      '<div class="chart-host" id="c-chart"></div>' +
      '<p class="chart-alt">Chart summary: ' + TS.escapeHtml(v.name) + " in " + TS.escapeHtml(nameA) + " and " + TS.escapeHtml(nameB) +
      " from " + state.from + " to " + state.to + ". Slopes " + TS.fmt.signed(A.slopePerDecade, 3) + " and " + TS.fmt.signed(B.slopePerDecade, 3) +
      unit + " per decade, moving in " + (opposite ? "opposite" : "the same") + " directions.</p>" +
      '<p class="chart-source">Source: NASA POWER / MERRA-2 · cached.</p>' +
      "</div>" +

      banner +

      '<div class="compare-cols">' +
      statBlock(A, v, colorA, nameA) +
      statBlock(B, v, colorB, nameB) +
      "</div>" +

      '<div class="paper why-card">' +
      '<p class="why-label mono">AI hypothesis · not proven cause</p>' +
      '<h3 class="why-title">Why might they differ?</h3>' +
      '<p class="why-text">' + TS.escapeHtml(note) + "</p>" +
      '<p class="why-text">Read from the numbers: ' + TS.escapeHtml(v.name.toLowerCase()) + " moves by " +
      TS.fmt.signed(A.slopePerDecade, 3) + " per decade in " + TS.escapeHtml(TS.region(state.a).short) + " (" + TS.fmt.pText(A.p) + ") and " +
      TS.fmt.signed(B.slopePerDecade, 3) + " per decade in " + TS.escapeHtml(TS.region(state.b).short) + " (" + TS.fmt.pText(B.p) + "). " +
      "That is a description of the evidence, not an explanation of it.</p>" +
      '<p class="why-foot mono">Generated from the computed statistics · curated note · no language model called</p>' +
      "</div>";

    TS.chart.compare(document.getElementById("c-chart"), {
      a: A, b: B, nameA: nameA, nameB: nameB, unit: v.unit, colorA: colorA, colorB: colorB,
      zeroLine: state.deseason, resolution: state.resolution
    });

    document.getElementById("c-png").addEventListener("click", function () {
      TS.chart.downloadPNG(document.getElementById("c-chart"), "trendoscope-compare.png");
    });

    TS.askContext({
      variable: state.variable, region: state.a,
      summary: v.name + " in " + nameA + " (" + A.from + "–" + A.to + ") vs " + nameB,
      slopePerDecade: A.slopePerDecade, p: A.p, tau: A.tau, mean: A.mean,
      missingPct: A.missingPct, from: A.from, to: A.to,
      significant: A.significant, verdict: A.verdict, unit: v.unit
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    fillSelects();
    presets();

    document.getElementById("compare-setup").addEventListener("submit", function (e) {
      e.preventDefault();
      state.variable = document.getElementById("c-variable").value;
      state.a = document.getElementById("c-a").value;
      state.b = document.getElementById("c-b").value;
      state.from = +document.getElementById("c-from").value;
      state.to = +document.getElementById("c-to").value;
      if (state.from > state.to) { var t = state.from; state.from = state.to; state.to = t; }
      state.deseason = document.getElementById("c-deseason").getAttribute("aria-pressed") === "true";
      run(null);
    });

    document.getElementById("c-deseason").addEventListener("click", function () {
      var on = this.getAttribute("aria-pressed") === "true";
      this.setAttribute("aria-pressed", String(!on));
    });

    var params = new URLSearchParams(location.search);
    var preset = null;
    if (params.get("pair")) {
      preset = TS.core.presetPairs.filter(function (p) { return p.id === params.get("pair"); })[0] || null;
    }
    if (preset) {
      state.variable = preset.variable; state.a = preset.a; state.b = preset.b;
      document.getElementById("c-variable").value = state.variable;
      document.getElementById("c-a").value = state.a;
      document.getElementById("c-b").value = state.b;
    }
    run(preset);
  });
})();
