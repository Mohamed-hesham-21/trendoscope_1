/* ==========================================================================
   Trendoscope — home.js
   The two home demos (spot the signal / where in the world) and the featured
   case cards. Everything is computed from the cached NASA series.
   ========================================================================== */
(function () {
  "use strict";
  var TS = window.TS;
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* ------------------------------------------------------------ helpers -- */

  function anomalies(region, variable) {
    var s = TS.series(region, variable, "monthly");
    if (!s) return [];
    var out = [];
    for (var i = 0; i < s.values.length; i++) {
      var v = s.values[i];
      if (v === null || v === undefined) continue;
      out.push(v - s.clim[i % 12]);
    }
    return out;
  }

  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function gaussianNoise(n, m, s) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var u = Math.random() || 1e-9, v = Math.random();
      var z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      out.push(m + z * s);
    }
    return out;
  }

  function mean(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function sd(a) {
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1));
  }

  function thin(a, target) {
    var step = Math.max(1, Math.floor(a.length / target));
    var out = [];
    for (var i = 0; i < a.length; i += step) out.push(a[i]);
    return out;
  }

  function sparkline(values) {
    var w = 220, h = 66, pad = 7;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var span = (max - min) || 1;
    var pts = values.map(function (v, i) {
      var x = pad + (i / (values.length - 1)) * (w - pad * 2);
      var y = h - pad - ((v - min) / span) * (h - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<line class="spark-base" x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '"/>' +
      '<polyline class="spark-line" points="' + pts + '"/></svg>';
  }

  /* ---------------------------------------------------- demo 1: signal -- */

  var SIGNAL = null;

  function buildSignal() {
    var base = anomalies("sahel", "precip");
    if (base.length < 60) return null;

    var pool = [
      { kind: "real", vals: base },
      { kind: "shuffled", vals: shuffled(base) },
      { kind: "noise", vals: gaussianNoise(base.length, mean(base), sd(base)) }
    ].map(function (o) {
      o.p = TS.stats.mannKendall(o.vals).p;
      return o;
    });

    // random slot for the real series, so the answer is not always the same letter
    return shuffled([0, 1, 2]).map(function (k) { return pool[k]; });
  }

  function initSignalDemo() {
    var root = $("#demo-signal");
    if (!root) return;
    SIGNAL = buildSignal();
    if (!SIGNAL) return;

    $$("[data-spark]").forEach(function (host) {
      host.innerHTML = sparkline(thin(SIGNAL[+host.getAttribute("data-spark")].vals, 70));
    });

    $$("[data-pick]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (root.dataset.done) return;
        root.dataset.done = "1";
        revealSignal(+btn.getAttribute("data-pick"));
      });
    });
  }

  function revealSignal(picked) {
    var letters = ["A", "B", "C"];
    var realIndex = 0;
    SIGNAL.forEach(function (o, i) { if (o.kind === "real") realIndex = i; });

    $$("[data-pick]").forEach(function (btn) {
      var i = +btn.getAttribute("data-pick");
      btn.disabled = true;
      btn.setAttribute("aria-pressed", String(i === picked));
      btn.classList.add(i === realIndex ? "is-real" : "is-decoy");
      var verdict = btn.querySelector(".spark-verdict");
      if (verdict) verdict.textContent = TS.fmt.pText(SIGNAL[i].p);
    });

    var fb = $("#signal-feedback");
    var correct = picked === realIndex;
    var others = [0, 1, 2].filter(function (i) { return i !== realIndex; })
      .map(function (i) { return letters[i] + " " + TS.fmt.pText(SIGNAL[i].p); }).join(", ");

    fb.className = "demo-feedback is-on " + (correct ? "is-good" : "is-bad");
    fb.innerHTML =
      '<div class="fb-head">' + TS.icon(correct ? "check" : "alert") +
      '<p class="fb-line"><strong>' + (correct ? "Correct." : "Not quite.") + "</strong> Series <b>" + letters[realIndex] +
      "</b> is the real one — Sahel rainfall 1993–2024, " + TS.fmt.pText(SIGNAL[realIndex].p) + ".</p></div>" +
      '<p class="fb-body">' + (correct
        ? "The other two are the <em>same numbers</em> in a different order, plus pure noise. They look just as wiggly, yet neither has a trend (" + others + "). That is the whole idea of a significance test: shape alone is not evidence — order is."
        : "You picked " + letters[picked] + " (" + TS.fmt.pText(SIGNAL[picked].p) + "). It has the same numbers as the real series, or the same spread as noise, but no consistent order — so no trend. The real one is " + letters[realIndex] + " (" + TS.fmt.pText(SIGNAL[realIndex].p) + ").") +
      "</p>" +
      '<a class="fb-link mono" href="investigate.html?region=sahel&amp;variable=precip">Open the real series in Investigate →</a>';
  }

  /* ------------------------------------------------ demo 2: where am I -- */

  function initWhereDemo() {
    var host = $("#where-map");
    if (!host) return;
    var chosen = null;

    function paint() { host.innerHTML = TS.regionMap(chosen, { compact: true }); }
    paint();

    host.addEventListener("click", function (e) {
      var pin = e.target.closest("[data-region]");
      if (!pin || chosen === "sahel") return;
      chosen = pin.getAttribute("data-region");
      paint();
      answerWhere(chosen);
    });
    host.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var pin = e.target.closest("[data-region]");
      if (pin) { e.preventDefault(); pin.click(); }
    });
  }

  function answerWhere(id) {
    var fb = $("#where-feedback");
    var region = TS.region(id);
    var a = TS.analyze({
      region: id, variable: "soil_moisture", resolution: "monthly",
      from: 1993, to: 2024, deseasonalize: true
    });
    if (!a || a.error) {
      fb.className = "demo-feedback is-on is-bad";
      fb.innerHTML = '<p class="fb-body">No soil-moisture series for that box.</p>';
      return;
    }
    var correct = id === "sahel";
    fb.className = "demo-feedback is-on " + (correct ? "is-good" : "is-bad");
    fb.innerHTML =
      '<div class="fb-head">' + TS.icon(correct ? "check" : "alert") +
      '<p class="fb-line"><strong>' + (correct ? "That's the one." : "Not this one.") + "</strong> " +
      TS.escapeHtml(region.name) + " soil moisture changes by " +
      TS.fmt.signed(a.slopePerDecade, 4) + " per decade, " + TS.fmt.pText(a.p) +
      (a.significant ? " — significant." : " — not significant.") + "</p></div>" +
      '<p class="fb-body">' + (correct
        ? "Western Sahel is the only one of the six with a strong, significant rise in root-zone soil water. Rain there has recovered since the drought years, and the soil now holds it longer."
        : "Try another pin — the rise is strongest where the rainy season has recovered the most.") + "</p>";
  }

  /* ------------------------------------------------------------ boot -- */

  document.addEventListener("DOMContentLoaded", function () {
    var grid = $("#home-cases");
    if (grid && TS.core.cases) grid.innerHTML = TS.core.cases.map(TS.caseCard).join("");

    initSignalDemo();
    initWhereDemo();

    var ask = $("#feature-ask");
    if (ask) ask.addEventListener("click", function () { TS.openAsk(); });
  });
})();
