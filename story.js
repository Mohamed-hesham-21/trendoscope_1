/* ==========================================================================
   Trendoscope — story.js
   Four slides for younger detectives: intro, then, now (with a year dial), quiz.
   ========================================================================== */
(function () {
  "use strict";
  var TS = window.TS;
  if (!document.getElementById("story-root")) return;

  var story = TS.core.story;
  var v = TS.variable(story.variable);
  var region = TS.region(story.region);
  var series = TS.series(region.id, v.id, "monthly");
  var index = 0;
  var quizIndex = 0;
  var correctCount = 0;
  var windowStart = 2022;   // start year of the highlighted 3-year window

  function dates() {
    return series.dates.map(function (d) {
      var p = d.split("-");
      return new Date(+p[0], +p[1] - 1, 15);
    });
  }

  function windowMean(start, len) {
    var vals = [];
    series.values.forEach(function (val, i) {
      var year = +series.dates[i].slice(0, 4);
      if (val !== null && year >= start && year < start + len) vals.push(val);
    });
    if (!vals.length) return null;
    return vals.reduce(function (s, x) { return s + x; }, 0) / vals.length;
  }

  function meanRange(y0, y1) {
    var vals = [];
    series.values.forEach(function (val, i) {
      var year = +series.dates[i].slice(0, 4);
      if (val !== null && year >= y0 && year <= y1) vals.push(val);
    });
    return vals.length ? vals.reduce(function (s, x) { return s + x; }, 0) / vals.length : null;
  }

  function drawChart(host, start, len) {
    var layout = TS.chart.baseLayout({ yTitle: v.unit === "fraction (0-1)" ? "soil wetness (0–1)" : v.unit, showlegend: false, paper: true });
    layout.margin = { l: 52, r: 16, t: 12, b: 36 };
    layout.hovermode = "closest";
    var x0 = new Date(start, 0, 1);
    var x1 = new Date(start + len, 0, 1);
    layout.shapes = [{
      type: "rect", xref: "x", yref: "paper", x0: x0, x1: x1, y0: 0, y1: 1,
      fillcolor: "rgba(140,198,63,0.22)", line: { width: 0 }
    }];
    Plotly.react(host, [{
      x: dates(), y: series.values, type: "scatter", mode: "lines",
      line: { color: "#8FB4E8", width: 1.4 },
      hovertemplate: "%{x|%b %Y}: %{y:.2f}<extra></extra>"
    }], layout, TS.chart.config);
  }

  function slideIntro() {
    return '<div class="story-slide is-active" data-slide="0">' +
      '<div class="story-mascot">' + TS.mascot(120, "happy") + "</div>" +
      '<h2 class="story-heading">' + TS.escapeHtml(story.slides[0].heading) + "</h2>" +
      '<p class="story-body">' + TS.escapeHtml(story.slides[0].body) + "</p>" +
      "</div>";
  }

  function slideThen() {
    var m = meanRange(1993, 1999);
    return '<div class="story-slide" data-slide="1">' +
      '<h2 class="story-heading">' + TS.escapeHtml(story.slides[1].heading) + "</h2>" +
      '<p class="story-body">' + TS.escapeHtml(story.slides[1].body) + "</p>" +
      '<div class="story-stat"><span class="story-number tnum">' + TS.fmt.num(m, 2) + "</span>" +
      "<span class=\"story-caption\">average soil wetness, 1993–1999<br><span class=\"dim\">(" + TS.escapeHtml(region.name) + ")</span></span></div>" +
      '<div class="story-chart" id="chart-then"></div>' +
      '<p class="chart-source">Source: NASA POWER / MERRA-2 · ' + TS.escapeHtml(v.name) + ".</p>" +
      "</div>";
  }

  function slideNow() {
    var m = meanRange(2022, 2024);
    return '<div class="story-slide" data-slide="2">' +
      '<h2 class="story-heading">' + TS.escapeHtml(story.slides[2].heading) + "</h2>" +
      '<p class="story-body">' + TS.escapeHtml(story.slides[2].body) + "</p>" +
      '<div class="then-now">' +
      '<label class="mono" for="year-dial" style="color:#6B6250">Drag the year dial</label>' +
      '<input type="range" id="year-dial" min="1993" max="2022" step="1" value="2022" />' +
      '<div class="dates"><span>1993</span><span id="dial-readout">2022–2024</span><span>2024</span></div>' +
      "</div>" +
      '<div class="story-stat"><span class="story-number tnum" id="dial-value">' + TS.fmt.num(m, 2) + "</span>" +
      '<span class="story-caption" id="dial-caption">average soil wetness, 2022–2024</span></div>' +
      '<div class="story-chart" id="chart-now"></div>' +
      '<p class="chart-source">The shaded band follows the dial — the same seasons, a different decade.</p>' +
      "</div>";
  }

  function slideQuiz() {
    return '<div class="story-slide" data-slide="3">' +
      '<h2 class="story-heading">Three quick questions</h2>' +
      '<div class="quiz" id="quiz">' +
      '<p class="quiz-progress" id="quiz-progress">Question 1 of ' + story.quiz.length + "</p>" +
      '<p class="quiz-q" id="quiz-q"></p>' +
      '<div class="quiz-opts" id="quiz-opts"></div>' +
      '<p class="quiz-feedback" id="quiz-feedback"></p>' +
      '<div><button class="btn btn-ink btn-sm" type="button" id="quiz-next" style="display:none">Next question</button></div>' +
      "</div>" +
      '<div class="badge-award" id="badge" style="display:none">' +
      '<span class="badge">Trend<br>Detective</span>' +
      "<p class='story-body'>You finished the story and answered all three questions. Dune is impressed.</p>" +
      '<div class="badge-actions"><a class="btn btn-ink" href="investigate.html">Open a real case</a>' +
      '<a class="btn btn-quiet" href="cases.html">Try a detective case</a></div>' +
      "</div></div>";
  }

  function render() {
    var root = document.getElementById("story-root");
    root.innerHTML =
      '<div class="story-card paper">' +
      slideIntro() + slideThen() + slideNow() + slideQuiz() +
      '<div class="story-controls">' +
      '<button class="btn btn-quiet btn-sm" type="button" id="story-back">Back</button>' +
      '<div class="story-dots" id="story-dots">' +
      story.slides.concat([{ kind: "quiz" }]).map(function (_, i) {
        return '<span class="' + (i === 0 ? "is-on" : "") + '"></span>';
      }).join("") +
      "</div>" +
      '<button class="btn btn-ink btn-sm" type="button" id="story-next">Next</button>' +
      "</div></div>";

    document.getElementById("story-next").addEventListener("click", function () { go(index + 1); });
    document.getElementById("story-back").addEventListener("click", function () { go(index - 1); });

    document.getElementById("year-dial").addEventListener("input", function (e) {
      windowStart = +e.target.value;
      drawChart(document.getElementById("chart-now"), windowStart, 3);
      document.getElementById("dial-readout").textContent = windowStart + "–" + (windowStart + 2);
      document.getElementById("dial-caption").textContent = "average soil wetness, " + windowStart + "–" + (windowStart + 2);
      document.getElementById("dial-value").textContent = TS.fmt.num(windowMean(windowStart, 3), 2);
    });

    document.getElementById("quiz-next").addEventListener("click", nextQuestion);
  }

  function go(i) {
    if (i < 0 || i > 3) return;
    index = i;
    var slides = document.querySelectorAll(".story-slide");
    Array.prototype.forEach.call(slides, function (s, k) {
      s.classList.toggle("is-active", k === i);
    });
    Array.prototype.forEach.call(document.querySelectorAll("#story-dots span"), function (d, k) {
      d.classList.toggle("is-on", k === i);
    });
    document.getElementById("story-back").disabled = i === 0;
    document.getElementById("story-next").textContent = i === 3 ? "Finished" : "Next";
    document.getElementById("story-next").disabled = i === 3;

    if (i === 1) drawChart(document.getElementById("chart-then"), 1993, 7);
    if (i === 2) {
      drawChart(document.getElementById("chart-now"), windowStart, 3);
      if (!document.getElementById("quiz-q").textContent) showQuestion();
    }
    document.querySelector(".story-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showQuestion() {
    var q = story.quiz[quizIndex];
    document.getElementById("quiz-progress").textContent = "Question " + (quizIndex + 1) + " of " + story.quiz.length;
    document.getElementById("quiz-q").textContent = q.q;
    document.getElementById("quiz-feedback").textContent = "";
    document.getElementById("quiz-next").style.display = "none";
    var host = document.getElementById("quiz-opts");
    host.innerHTML = q.options.map(function (opt, i) {
      return '<button class="quiz-opt" type="button" data-i="' + i + '">' + TS.escapeHtml(opt) + "</button>";
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".quiz-opt"), function (btn) {
      btn.addEventListener("click", function () {
        var picked = +btn.dataset.i;
        var correct = picked === q.answer;
        if (correct) correctCount++;
        Array.prototype.forEach.call(host.querySelectorAll(".quiz-opt"), function (b) {
          b.disabled = true;
          if (+b.dataset.i === q.answer) b.classList.add("is-correct");
          else if (b === btn) b.classList.add("is-wrong");
        });
        document.getElementById("quiz-feedback").textContent = (correct ? "Correct. " : "Not quite. ") + q.why;
        document.getElementById("quiz-next").style.display = "inline-flex";
        document.getElementById("quiz-next").textContent = quizIndex === story.quiz.length - 1 ? "Finish and get the badge" : "Next question";
      });
    });
  }

  function nextQuestion() {
    if (quizIndex === story.quiz.length - 1) {
      document.getElementById("quiz").style.display = "none";
      document.getElementById("badge").style.display = "grid";
      document.getElementById("badge").querySelector("p").textContent =
        "You got " + correctCount + " of " + story.quiz.length + " right. Dune is impressed.";
      return;
    }
    quizIndex++;
    showQuestion();
  }

  var started = false;
  TS.initStory = function () {
    if (started) return;
    started = true;
    render();
    go(0);
  };

  // the standalone story page (if opened directly) starts itself
  if (document.getElementById("story-root") && !document.getElementById("panel-story")) {
    document.addEventListener("DOMContentLoaded", function () { TS.initStory(); });
  }
})();
