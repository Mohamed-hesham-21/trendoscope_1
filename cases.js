/* Cases list page. */
(function () {
  "use strict";
  var TS = window.TS;
  document.addEventListener("DOMContentLoaded", function () {
    var host = document.getElementById("case-list");
    if (host) host.innerHTML = TS.core.cases.map(TS.caseCard).join("");
  });
})();
