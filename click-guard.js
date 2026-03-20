/**
 * EXAMORA Click Guard — click-guard.js
 * Prevents silent failures when onclick handlers fire before
 * the <script type="module"> has finished loading.
 *
 * How it works:
 *  1. Intercepts ALL clicks in capture phase (before onclick fires)
 *  2. If the function doesn't exist yet, queues the call
 *  3. Polls every 80ms and replays queued calls once function exists
 *  4. Gives up after 8 seconds (module load timeout)
 */
(function () {
  'use strict';

  var _queue = [];
  var _started = Date.now();
  var _MAX_WAIT = 8000;

  // Replay queue — runs every 80ms
  var _timer = setInterval(function () {
    if (Date.now() - _started > _MAX_WAIT) {
      clearInterval(_timer);
      _queue = [];
      return;
    }
    if (_queue.length === 0) return;
    var remaining = [];
    _queue.forEach(function (item) {
      if (typeof window[item.fn] === 'function') {
        try { window[item.fn].apply(window, item.args); }
        catch (e) { console.warn('[click-guard] replay error:', e); }
      } else {
        remaining.push(item);
      }
    });
    _queue = remaining;
  }, 80);

  // Parse simple argument strings: 'text', 1, true, false
  function parseArgs(argsStr) {
    if (!argsStr || !argsStr.trim()) return [];
    return argsStr.split(',').map(function (a) {
      a = a.trim();
      if ((a[0] === "'" && a[a.length - 1] === "'") ||
          (a[0] === '"' && a[a.length - 1] === '"')) {
        return a.slice(1, -1);
      }
      if (a === 'true') return true;
      if (a === 'false') return false;
      if (!isNaN(a) && a !== '') return Number(a);
      return a;
    });
  }

  // Capture-phase click listener — fires before onclick attribute
  document.addEventListener('click', function (e) {
    var el = e.target;
    // Walk up DOM to find element with onclick
    while (el && el !== document.body) {
      var oc = el.getAttribute && el.getAttribute('onclick');
      if (oc) {
        // Match: functionName(args)
        var m = oc.trim().match(/^([a-zA-Z_$][\w$]*)\s*\(([^)]*)\)\s*;?$/);
        if (m) {
          var fnName = m[1];
          // Skip built-ins and already-defined functions
          if (typeof window[fnName] !== 'function') {
            e.stopPropagation();
            e.preventDefault();
            _queue.push({ fn: fnName, args: parseArgs(m[2]) });
            return;
          }
        }
        break;
      }
      el = el.parentElement;
    }
  }, true); // true = capture phase

})();

// ── Force SW update check on every page load ─────────────────
// Ensures users never get stuck on stale cached files
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then(function(reg) {
    if (reg) {
      reg.update(); // silently checks for new SW version
    }
  });
}

// ── Smooth page transitions ───────────────────────────────────
// Intercept all internal link clicks and animate out before navigating
(function() {
  function isSameSite(href) {
    if (!href) return false;
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    try {
      var url = new URL(href, location.href);
      return url.hostname === location.hostname;
    } catch(_) { return true; }
  }

  document.addEventListener('click', function(e) {
    var el = e.target;
    // Walk up to find an anchor
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (!el || !el.href) return;
    var href = el.getAttribute('href');
    if (!href || !isSameSite(href)) return;
    // Skip links that open in new tab or have special handling
    if (el.target === '_blank') return;
    // Skip if meta/ctrl key held (open in new tab)
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;

    e.preventDefault();
    var dest = el.href;

    // Apply exit animation
    document.body.classList.add('page-exit');
    setTimeout(function() {
      window.location.href = dest;
    }, 170);
  }, false);

  // Also intercept programmatic window.location changes by wrapping common patterns
  // (nav buttons via onclick use window.location.href= so we can't intercept those easily)
  // The CSS animation on body entry handles the enter direction already.
})();
