/* Ask page: opens the shared chat panel. */
(function () {
  "use strict";
  var TS = window.TS;
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("open-ask");
    if (btn) {
      btn.addEventListener("click", function () {
        TS.openAsk("What does this p-value mean?");
      });
    }
    // the page explains the panel first; it only opens on request (or with ?q=)
    if (TS.qs("q")) {
      setTimeout(function () { TS.openAsk(); }, 300);
    }
  });
})();
