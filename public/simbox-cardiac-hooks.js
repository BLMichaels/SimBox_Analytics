/* Pediatric Cardiac Codes — poll Storyline vars and emit coded metrics.
   Load AFTER simbox-tracking.js. Does not rewrite Storyline Script1–Script34.
*/
(function () {
  "use strict";

  var WATCH = [
    { varName: "SimBegin1", action: "stage1_begin", label: "Begin simulation", stage: 1, step: 1 },
    { varName: "One1", action: "pulse_check", label: "Initial pulse check", stage: 1, step: 1 },
    { varName: "Two1", action: "compressions_start", label: "Initiated compressions", stage: 1, step: 1 },
    { varName: "Three1", action: "bvm_start", label: "Initiated BVM", stage: 1, step: 1 },
    { varName: "Four1", action: "pads_applied", label: "Applied pads", stage: 1, step: 1 },
    { varName: "Five1", action: "iv_io_access", label: "IV/IO access", stage: 1, step: 1 },
    { varName: "Six1", action: "rhythm_check", label: "Rhythm/pulse check", stage: 1, step: 1 },
    { varName: "Seven1", action: "epinephrine", label: "Epinephrine administered", stage: 1, step: 1 },
    { varName: "Eight1", action: "defib", label: "Defib delivered", stage: 1, step: 1 },

    { varName: "SimBegin2", action: "stage2_begin", label: "Begin Stage 2", stage: 2, step: 2 },
    { varName: "One2", action: "rhythm_check", label: "Rhythm/pulse check", stage: 2, step: 2 },
    { varName: "Two2", action: "epinephrine", label: "Epinephrine administered", stage: 2, step: 2 },
    { varName: "Three2", action: "defib", label: "Defib delivered", stage: 2, step: 2 },
    { varName: "Four2", action: "switch_compressors", label: "Switch compressors", stage: 2, step: 2 },
    { varName: "Five2", action: "continuous_compressions", label: "Continuous compressions", stage: 2, step: 2 },
    { varName: "Six2", action: "breath_interval", label: "Breath every 2-3 seconds", stage: 2, step: 2 },

    { varName: "SimBegin3", action: "stage3_begin", label: "Begin Stage 3", stage: 3, step: 3 },
    { varName: "One3", action: "pulse_check", label: "Checked pulse", stage: 3, step: 3 },
    { varName: "Two3", action: "rosc", label: "Announced ROSC", stage: 3, step: 3 },
    { varName: "Three3", action: "compressions_stop", label: "Stopped compressions", stage: 3, step: 3 },
    { varName: "Four3", action: "post_resuscitation", label: "Post-resuscitation care", stage: 3, step: 3 },
    { varName: "Five3", action: "transfer_called", label: "Called for transfer", stage: 3, step: 3 },
    { varName: "Debrief", action: "go_to_debrief", label: "Clicked Go to Debrief", stage: 3, step: 4 }
  ];

  var seen = {};
  var lastPauseCount = null;
  var summarySent = false;

  function debug() {
    var c = window.SIMBOX_TRACKING_CONFIG || {};
    if (c.debug !== true && !/[?&]simbox_debug=1(?:&|$)/.test(window.location.search || "")) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[SimBoxCardiac]");
    if (console && console.log) console.log.apply(console, args);
  }

  function getPlayer() {
    try {
      if (typeof window.GetPlayer === "function") return window.GetPlayer();
    } catch (e) {}
    try {
      var frames = document.getElementsByTagName("iframe");
      var i;
      for (i = 0; i < frames.length; i++) {
        try {
          var w = frames[i].contentWindow;
          if (w && typeof w.GetPlayer === "function") return w.GetPlayer();
        } catch (e2) {}
      }
    } catch (e3) {}
    return null;
  }

  function extractClock(raw) {
    var s = String(raw || "").replace(/<[^>]*>/g, " ").trim();
    if (!s) return "";
    var matches = s.match(/\d{1,2}:\d{2}(?::\d{2})?/g);
    if (matches && matches.length) return matches[matches.length - 1];
    return s.slice(0, 16);
  }

  function parseClockSeconds(raw) {
    var clock = extractClock(raw);
    var m = String(clock).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    var a = Number(m[1]);
    var b = Number(m[2]);
    var c = m[3] != null ? Number(m[3]) : 0;
    if (m[3] != null) return a * 3600 + b * 60 + c;
    return a * 60 + b;
  }

  function emitAction(item, raw) {
    if (!window.SimBoxTracking || typeof window.SimBoxTracking.action !== "function") return;
    var clock = extractClock(raw);
    var key = item.varName + "|" + clock + "|" + String(raw).slice(0, 40);
    if (seen[key]) return;
    seen[key] = 1;
    debug("action", item.action, clock);
    window.SimBoxTracking.action({
      kind: "action",
      action: item.action,
      label: item.label,
      stage: item.stage,
      step: item.step,
      clock: clock,
      slideTitle: "Stage " + item.stage
    });
  }

  function emitCompressionSummary(player) {
    if (!window.SimBoxTracking || typeof window.SimBoxTracking.action !== "function") return;
    var countRaw = player.GetVar("CompressionPauseCount");
    var count = Number(countRaw);
    if (!isFinite(count) || count < 0) return;
    if (lastPauseCount != null && count === lastPauseCount && summarySent) return;
    lastPauseCount = count;
    summarySent = true;
    var totalSec = parseClockSeconds(player.GetVar("CompressionPauseTotal")) || 0;
    var avgSec = parseClockSeconds(player.GetVar("CompressionPauseAverage")) || 0;
    debug("compression", count, totalSec, avgSec);
    window.SimBoxTracking.action({
      kind: "compression",
      action: "compression_summary",
      label: "Compression interruptions",
      stage: 0,
      step: 5,
      pauseCount: count,
      pauseTotalSec: totalSec,
      pauseAvgSec: avgSec,
      slideTitle: "Compressions"
    });
  }

  function tick() {
    var player = getPlayer();
    if (!player || typeof player.GetVar !== "function") return;
    var i;
    for (i = 0; i < WATCH.length; i++) {
      var item = WATCH[i];
      var raw = "";
      try {
        raw = player.GetVar(item.varName);
      } catch (e) {
        continue;
      }
      if (raw == null || raw === "" || raw === false) continue;
      emitAction(item, raw);
    }
    try {
      var pauseCount = player.GetVar("CompressionPauseCount");
      if (pauseCount != null && pauseCount !== "" && Number(pauseCount) >= 0) {
        emitCompressionSummary(player);
      }
    } catch (e2) {}
  }

  var intervalId = window.setInterval(tick, 400);
  window.setTimeout(tick, 300);

  window.SimBoxCardiacHooks = {
    stop: function () {
      window.clearInterval(intervalId);
    },
    tick: tick
  };
})();
