/* ==========================================================================
   Trendoscope — case.js
   One case file: story, target evidence, suspects, accusation, effects timeline.
   All relationships are computed from the NASA series at run time.
   ========================================================================== */
(function () {
  "use strict";
  var TS = window.TS;
  if (!document.getElementById("case-root")) return;

  var state = { caseFile: null, pick: null, score: 0, revealed: 0, correlations: null };

  var $ = function (s) { return document.querySelector(s); };

  /* -------------------------------------------------------------- maths --- */

  function anomalies(regionId, variableId) {
    var s = TS.series(regionId, variableId, "monthly");
    if (!s) return null;
    return s.values.map(function (v, i) {
      return v === null ? null : v - s.clim[i % 12];
    });
  }

  function correlate(a, b, lag) {
    var xs = [], ys = [];
    for (var i = 0; i < a.length; i++) {
      var j = i + lag;
      if (j < 0 || j >= b.length) continue;
      if (a[i] === null || b[j] === null) continue;
      xs.push(a[i]); ys.push(b[j]);
    }
    var n = xs.length;
    if (n < 20) return { r: 0, n: n };
    var mx = 0, my = 0, i2;
    for (i2 = 0; i2 < n; i2++) { mx += xs[i2]; my += ys[i2]; }
    mx /= n; my /= n;
    var num = 0, dx = 0, dy = 0;
    for (i2 = 0; i2 < n; i2++) {
      var ax = xs[i2] - mx, by = ys[i2] - my;
      num += ax * by; dx += ax * ax; dy += by * by;
    }
    return { r: num / Math.sqrt(dx * dy), n: n };
  }

  function bestLag(target, suspect) {
    var best = { r: 0, lag: 0 };
    for (var lag = -6; lag <= 6; lag++) {
      var c = correlate(target, suspect, lag);
      if (Math.abs(c.r) > Math.abs(best.r)) best = { r: c.r, lag: lag };
    }
    return best;
  }

  function verdictFor(r) {
    var abs = Math.abs(r);
    if (abs >= 0.5) return { key: "strong", label: "Strong clue", cls: "stamp--sig", points: 80 };
    if (abs >= 0.3) return { key: "weak", label: "Weak clue", cls: "stamp--neutral", points: 40 };
    return { key: "red", label: "Red herring", cls: "stamp--nosig", points: 0 };
  }

  var NUMBER_WORDS = { 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven" };
  function fixCount(text, n) {
    return text.replace(/(three|four|five|six|seven) suspects/, (NUMBER_WORDS[n] || n) + " suspects");
  }

  function lagText(lag) {
    if (lag === 0) return "same month";
    return Math.abs(lag) + " month" + (Math.abs(lag) === 1 ? "" : "s") + (lag > 0 ? " later" : " earlier");
  }

  /* ------------------------------------------------------------- render --- */

  function renderHeader(c) {
    var region = TS.region(c.region);
    $("#case-header").innerHTML =
      '<p class="eyebrow">Case file ' + c.no + " · " + TS.escapeHtml(region.name) + " · " + TS.escapeHtml(c.difficulty) + "</p>" +
      '<h1 class="page-title">' + TS.escapeHtml(c.title) + "</h1>" +
      '<p class="page-lede">' + TS.escapeHtml(c.event) + "</p>";
  }

  function renderStage1(c) {
    var target = TS.variable(c.target);
    var a = TS.analyze({
      region: c.region, variable: c.target, resolution: "monthly",
      from: 1993, to: 2024, deseasonalize: true
    });

    var suspects = c.suspects.map(function (id) {
      var v = TS.variable(id);
      return '<button class="suspect" type="button" data-id="' + id + '" aria-pressed="false">' +
        '<span class="s-name">' + TS.escapeHtml(v.name) + "</span>" +
        '<span class="s-def">' + TS.escapeHtml(v.definition.split(".")[0]) + ".</span>" +
        '<span class="s-pick">Accuse this one</span>' +
        "</button>";
    }).join("");

    $("#case-root").innerHTML =
      '<div class="case-shell">' +
      '<div class="case-main">' +

      '<div class="paper case-brief">' +
      '<p class="case-no-line mono">Stage 1 · find the cause</p>' +
      '<p class="case-task"><strong>Your job:</strong> ' + TS.escapeHtml(fixCount(c.brief, c.suspects.length)) + "</p>" +
      "</div>" +

      '<div class="chart-frame">' +
      '<div class="chart-head"><div><h3 class="chart-title">The evidence: ' + TS.escapeHtml(target.short.toLowerCase()) + " in " + TS.escapeHtml(TS.region(c.region).short) + "</h3>" +
      '<p class="chart-sub">' + TS.escapeHtml(target.name) + " · anomaly · 1993–2024</p></div></div>" +
      '<div class="chart-host" id="case-chart"></div>' +
      '<p class="chart-alt">Chart summary: ' + TS.escapeHtml(target.name) + " in " + TS.escapeHtml(TS.region(c.region).name) +
      ", trend " + TS.fmt.signed(a.slopePerDecade, 3) + " " + TS.escapeHtml(TS.fmt.unit(target)) + " per decade, " +
      TS.verdictText[a.verdict].toLowerCase() + ".</p>" +
      '<p class="chart-source">Source: ' + TS.escapeHtml(target.source) + " · NASA POWER / MERRA-2.</p>" +
      "</div>" +

      '<div class="paper suspects-card">' +
      '<h2 class="suspects-title">The suspects</h2>' +
      '<p class="suspects-hint">Pick the variable you think is most closely linked to the evidence, then accuse. The link is computed with a lag from −6 to +6 months.</p>' +
      '<div class="suspect-grid" id="suspects">' + suspects + "</div>" +
      '<div class="accuse-row">' +
      '<button class="btn btn-ink" type="button" id="accuse" disabled>Accuse</button>' +
      '<span class="dim" id="pick-label">No suspect selected yet.</span>' +
      "</div></div>" +

      '<div id="case-result"></div>' +
      "</div>" +

      '<aside class="case-side">' +
      '<div class="paper score-box">' +
      '<p class="score-value" id="score">0</p>' +
      '<p class="score-label">Points</p>' +
      "</div>" +
      '<div class="glass-card case-help">' +
      '<h3 style="font-size:17px;margin-bottom:8px">How the link is measured</h3>' +
      '<p class="dim" style="font-size:14px">Both series are de-seasonalised, then correlated at every lag from −6 to +6 months. The strongest lag is kept. A correlation describes how two series move together — never that one caused the other.</p>' +
      "</div>" +
      "</aside>" +
      "</div>";

    TS.chart.timeseries($("#case-chart"), {
      analysis: a, unit: " " + TS.fmt.unit(target), yTitle: "anomaly (" + TS.fmt.unit(target) + ")",
      color: TS.powerHex(target.power), zeroLine: true, valueLabel: target.short.toLowerCase()
    });

    Array.prototype.forEach.call(document.querySelectorAll(".suspect"), function (btn) {
      btn.addEventListener("click", function () {
        Array.prototype.forEach.call(document.querySelectorAll(".suspect"), function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        state.pick = btn.dataset.id;
        $("#accuse").disabled = false;
        $("#pick-label").textContent = "Accusing: " + TS.variable(state.pick).name;
      });
    });

    $("#accuse").addEventListener("click", function () { accuse(c); });
  }

  function accuse(c) {
    var target = anomalies(c.region, c.target);
    var results = c.suspects.map(function (id) {
      var best = bestLag(target, anomalies(c.region, id));
      return { id: id, r: best.r, lag: best.lag };
    });
    var ranked = results.slice().sort(function (x, y) { return Math.abs(y.r) - Math.abs(x.r); });
    var mine = results.filter(function (x) { return x.id === state.pick; })[0];
    var v = TS.variable(mine.id);
    var targetVar = TS.variable(c.target);
    var verdict = verdictFor(mine.r);
    var isTop = ranked[0].id === mine.id;
    var nearlyTop = Math.abs(ranked[0].r) - Math.abs(mine.r) <= 0.1;
    var points = (isTop || nearlyTop) && Math.abs(mine.r) >= 0.5 ? 100 : verdict.points;
    state.correlations = results;
    state.score = points;

    $("#score").textContent = points;

    var verdictHtml = '<div class="stamp ' + verdict.cls + '">' + TS.icon(verdict.key === "red" ? "close" : "check") + verdict.label + "</div>";
    var explain = "<p class='result-line'>" + TS.escapeHtml(v.name) + " and " + TS.escapeHtml(targetVar.name.toLowerCase()) +
      " move together with <strong>r = " + TS.fmt.signed(mine.r, 2) + "</strong>, with " +
      TS.escapeHtml(v.short.toLowerCase()) + " leading by about <strong>" + lagText(mine.lag) + "</strong>.</p>";

    var tail;
    if (isTop || nearlyTop) {
      tail = "<p class='result-line'>That is the strongest link in the file, and it is physically plausible: " +
        TS.escapeHtml(v.definition) + "</p>";
    } else {
      var topVar = TS.variable(ranked[0].id);
      tail = "<p class='result-line'>The strongest connection in this file is <strong>" + TS.escapeHtml(topVar.name) +
        "</strong> at r = " + TS.fmt.signed(ranked[0].r, 2) + " (" + lagText(ranked[0].lag) + "). Your suspect still has a story of its own, but it explains less.</p>";
    }

    var caution = "<p class='result-foot'>Association, not proof: both series could be answering to a third process. " +
      "The case never says “caused”.</p>";

    $("#case-result").innerHTML =
      '<div class="paper result-card">' +
      '<p class="case-no-line mono">Your accusation</p>' +
      verdictHtml +
      "<h3 class='result-title-ink'>" + TS.escapeHtml(v.name) + "</h3>" +
      explain + tail +
      '<div class="chart-host" id="corr-chart" style="margin-top:16px;min-height:260px"></div>' +
      '<p class="chart-alt" style="color:#5C5443">Scatter of the two de-seasonalised series at the best lag (r = ' + TS.fmt.signed(mine.r, 2) + ").</p>" +
      caution +
      "</div>" +

      '<div class="paper stage2-card" id="stage2">' +
      '<p class="case-no-line mono">Stage 2 · follow the effects</p>' +
      "<h3 class='result-title-ink'>What happened next?</h3>" +
      '<p class="result-line">Once ' + TS.escapeHtml(v.short.toLowerCase()) + " changes, other parts of the system answer — each after its own delay. Reveal them one at a time.</p>" +
      '<div class="timeline" id="timeline"></div>' +
      '<div class="accuse-row">' +
      '<button class="btn btn-quiet" type="button" id="reveal">Reveal the next effect</button>' +
      "</div>" +
      '<div id="case-end"></div>' +
      "</div>";

    // scatter chart
    var xs = [], ys = [];
    var tArr = target, sArr = anomalies(c.region, mine.id);
    for (var i = 0; i < tArr.length; i++) {
      var j = i + mine.lag;
      if (j < 0 || j >= sArr.length) continue;
      if (tArr[i] === null || sArr[j] === null) continue;
      xs.push(sArr[j]); ys.push(tArr[i]);
    }
    TS.chart.correlation($("#corr-chart"), {
      points: xs.map(function (x, k) { return { x: x, y: ys[k] }; }),
      xTitle: v.short + " anomaly (" + TS.fmt.unit(v) + ")",
      yTitle: targetVar.short + " anomaly (" + TS.fmt.unit(targetVar) + ")",
      color: TS.powerHex(v.power),
      paper: true
    });

    Array.prototype.forEach.call(document.querySelectorAll(".suspect"), function (b) {
      b.disabled = true;
      if (b.dataset.id === mine.id) b.setAttribute("aria-pressed", "true");
    });
    $("#accuse").disabled = true;
    $("#accuse").textContent = "Case accused";
    $("#pick-label").textContent = "Verdict: " + verdict.label + " · " + points + " points";

    state.revealed = 0;
    $("#reveal").addEventListener("click", function () { revealNext(c, v); });

    TS.askContext({
      variable: c.target, region: c.region,
      summary: targetVar.name + " in " + TS.region(c.region).name + " (case " + c.no + ")",
      slopePerDecade: 0, p: 1, tau: 0, mean: 0, missingPct: 0, from: 1993, to: 2024,
      significant: false, verdict: "no_significant_trend", unit: targetVar.unit
    });

    $("#stage2").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function revealNext(c, suspectVar) {
    var target = anomalies(c.region, c.target);
    var box = $("#timeline");

    if (!state.effects) {
      // compute, keep only links that are actually visible in the data, strongest first
      state.effects = c.effects.map(function (e) {
        return { def: e, r: correlate(target, anomalies(c.region, e.var), e.lag).r };
      }).filter(function (e) {
        return Math.abs(e.r) >= 0.2;
      }).sort(function (x, y) {
        return Math.abs(y.r) - Math.abs(x.r);
      }).slice(0, 3);
    }

    var next = state.effects[state.revealed];
    if (!next) return;
    var effect = next.def;
    var v = TS.variable(effect.var);
    var r = next.r;

    var item = document.createElement("div");
    item.className = "timeline-item";
    item.innerHTML =
      '<span class="timeline-dot">' + (state.revealed + 1) + "</span>" +
      '<div class="timeline-body">' +
      "<h4>" + TS.escapeHtml(v.name) + "</h4>" +
      '<p class="timeline-lag">' + lagText(effect.lag) + " · r = " + TS.fmt.signed(r, 2) + "</p>" +
      "<p>" + TS.escapeHtml(effect.label) + ".</p>" +
      "</div>";
    box.appendChild(item);
    state.revealed++;

    if (state.revealed >= state.effects.length) {
      $("#reveal").style.display = "none";
      var next = TS.core.cases[(TS.core.cases.indexOf(c) + 1) % TS.core.cases.length];
      $("#case-end").innerHTML =
        '<div class="case-end">' +
        '<p class="case-end-score">Final score: <strong>' + state.score + " / 100</strong></p>" +
        "<p class='dim'>Effects shown here are associations with the same delay structure — a chain of clues, not a causal proof.</p>" +
        '<div class="case-end-actions">' +
        '<a class="btn btn-ink" href="detective-game.html?id=' + next.id + '">Next case <span aria-hidden="true">→</span></a>' +
        '<a class="btn btn-quiet" href="investigate.html?variable=' + c.target + "&region=" + c.region + '&run=1">Open in Investigate</a>' +
        "</div></div>";
    }
  }

  /* --------------------------------------------------------------- init --- */

  document.addEventListener("DOMContentLoaded", function () {
    var id = TS.qs("id");
    var c = TS.caseFile(id) || TS.core.cases[0];
    state.caseFile = c;
    document.title = "Case " + c.no + ": " + c.title + " — Trendoscope";
    renderHeader(c);
    renderStage1(c);
  });
})();
