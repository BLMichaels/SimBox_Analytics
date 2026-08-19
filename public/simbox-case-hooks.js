/* Penetrating Trauma slide hooks — load AFTER simbox-tracking.js.
   Does not edit Storyline-generated files.

   Published package: the visible countdown on Case Preparation is Script1
   (countdownText, currently 60 seconds in user.js). The next content slide
   is Triage and Vitals. Step 4 is the completion slide requested.

   Start: slide id 5W2RpqpDfbE (Triage and Vitals)
   Complete: slide id 5aNIF0c6vDb (Step 4)
*/
(function () {
  "use strict";

  var START_IDS = ["5W2RpqpDfbE"];
  var COMPLETE_IDS = ["5aNIF0c6vDb"];
  var START_TITLES = ["triage and vitals"];
  var COMPLETE_TITLES = ["step 4"];

  function debug() {
    var c = window.SIMBOX_TRACKING_CONFIG || {};
    if (!c.debug) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[SimBoxCaseHooks]");
    if (console && console.log) console.log.apply(console, args);
  }

  function matches(id, title, ids, titles) {
    var i;
    if (id) {
      for (i = 0; i < ids.length; i++) {
        if (id.indexOf(ids[i]) !== -1) return true;
      }
    }
    if (title) {
      var t = String(title).toLowerCase();
      for (i = 0; i < titles.length; i++) {
        if (t.indexOf(titles[i]) !== -1) return true;
      }
    }
    return false;
  }

  function readSlide() {
    var id = "";
    var title = "";
    try {
      if (typeof GetPlayer === "function") {
        var player = GetPlayer();
        if (player && typeof player.GetVar === "function") {
          id = String(player.GetVar("currentSlideId") || "");
        }
      }
    } catch (e) {}
    try {
      if (window.DS && DS.pub && DS.pub.currentSlide) {
        id = id || String(DS.pub.currentSlide.id || DS.pub.currentSlide.slideid || "");
        title = String(DS.pub.currentSlide.title || "");
      }
    } catch (e2) {}
    try {
      var heading = document.querySelector(".cs-slide-title, [data-acc-text], h1");
      if (!title && heading && heading.textContent) title = heading.textContent;
    } catch (e3) {}
    return { id: id, title: title };
  }

  var lastKey = "";
  var started = false;
  var completed = false;

  function tick() {
    if (!window.SimBoxTracking) return;
    var slide = readSlide();
    var key = slide.id + "|" + slide.title;
    if (key !== lastKey && (slide.id || slide.title)) {
      debug("slide", slide);
      lastKey = key;
    }
    if (!started && matches(slide.id, slide.title, START_IDS, START_TITLES)) {
      started = true;
      debug("start");
      window.SimBoxTracking.start();
    }
    if (!completed && matches(slide.id, slide.title, COMPLETE_IDS, COMPLETE_TITLES)) {
      completed = true;
      debug("complete");
      window.SimBoxTracking.complete();
    }
  }

  var intervalId = window.setInterval(tick, 500);
  if (document.addEventListener) {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") tick();
    });
  }
  window.setTimeout(tick, 1000);

  window.SimBoxCaseHooks = {
    stop: function () {
      window.clearInterval(intervalId);
    }
  };
})();
