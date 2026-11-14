/* ==========================================================================
   Trendoscope — game.js
   Tabs for the merged Detective game page: case files + story mode.
   ========================================================================== */
(function () {
  "use strict";
  var TS = window.TS;
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".game-tab"));
  if (!tabs.length) return;

  var panels = { cases: document.getElementById("panel-cases"), story: document.getElementById("panel-story") };
  var listView = document.getElementById("case-list-view");
  var fileView = document.getElementById("case-file-view");
  var storyStarted = false;

  function params() { return new URLSearchParams(location.search); }

  function setTab(tab, push) {
    if (!panels[tab]) tab = "cases";

    tabs.forEach(function (t) {
      var on = t.getAttribute("data-tab") === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle("is-on", on);
    });

    Object.keys(panels).forEach(function (k) {
      if (panels[k]) panels[k].hidden = k !== tab;
    });

    if (tab === "story") {
      if (!storyStarted && typeof TS.initStory === "function") {
        storyStarted = true;
        TS.initStory();
      }
    }

    if (push) {
      var p = params();
      if (tab === "story") {
        p.set("tab", "story");
        p.delete("id");
      } else {
        p.delete("tab");
      }
      var q = p.toString();
      history.replaceState(null, "", location.pathname + (q ? "?" + q : ""));
    }
  }

  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { setTab(t.getAttribute("data-tab"), true); });
    t.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      setTab(next.getAttribute("data-tab"), true);
    });
  });

  document.addEventListener("DOMContentLoaded", function () {
    var p = params();
    var hasCase = !!p.get("id");

    // a case file replaces the list inside the cases tab
    if (hasCase) {
      if (listView) listView.hidden = true;
      if (fileView) fileView.hidden = false;
      var head = document.querySelector(".page-head--game");
      if (head) head.classList.add("is-case");
    }

    setTab(p.get("tab") === "story" && !hasCase ? "story" : "cases", false);
  });
})();
