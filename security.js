/**
 * EXAMORA Security Layer — security.js
 * Loaded on every page. Handles:
 *  1. HTML sanitizer (XSS prevention)
 *  2. Login brute-force rate limiter
 *  3. Session idle timeout (30 min)
 *  4. Service worker update notifier
 *  5. Network status banner
 *  6. Cookie/privacy consent (NDPR)
 *  7. Input length enforcement
 *  8. Console warning for open DevTools
 */

(function EXAMORA_SECURITY() {
  'use strict';

  // ── 1. HTML SANITIZER ──────────────────────────────────────────────────
  // Safe innerHTML replacement — strips dangerous tags/attrs
  var ALLOWED_TAGS  = /^(b|i|strong|em|br|p|span|div|ul|ol|li|h[1-6]|a|code|pre|blockquote|small|sup|sub|mark)$/i;
  var ALLOWED_ATTRS = /^(href|class|style|id|target|rel)$/i;
  var SAFE_STYLE    = /^(color|font-weight|font-style|text-decoration|background-color|padding|margin|border-radius):\s*[^;\"\'<>]+;?$/;

  window.EXAMORA = window.EXAMORA || {};

  window.EXAMORA.sanitize = function(dirty) {
    if (typeof dirty !== 'string') return '';
    var doc  = document.createElement('div');
    // Use textContent to safely parse (no script execution)
    var tmp  = document.createElement('template');
    tmp.innerHTML = dirty;
    var cleaned = cleanNode(tmp.content.cloneNode(true));
    doc.appendChild(cleaned);
    return doc.innerHTML;
  };

  function cleanNode(node) {
    var result = document.createDocumentFragment();
    node.childNodes.forEach(function(child) {
      if (child.nodeType === Node.TEXT_NODE) {
        result.appendChild(document.createTextNode(child.textContent));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      var tag = child.tagName.toLowerCase();

      // Strip dangerous tags entirely (including their content)
      if (/^(script|style|iframe|object|embed|form|input|button|select|textarea|link|meta|base|svg|math)$/i.test(tag)) return;

      if (ALLOWED_TAGS.test(tag)) {
        var el = document.createElement(tag);
        for (var i = 0; i < child.attributes.length; i++) {
          var attr = child.attributes[i];
          if (!ALLOWED_ATTRS.test(attr.name)) continue;
          if (attr.name === 'href') {
            // Only allow safe protocols
            if (/^(javascript|data|vbscript)/i.test(attr.value.trim())) continue;
            el.setAttribute('href', attr.value);
            if (attr.value.startsWith('http')) {
              el.setAttribute('rel', 'noopener noreferrer');
              el.setAttribute('target', '_blank');
            }
            continue;
          }
          if (attr.name === 'style') {
            // Allow only safe individual style declarations
            var parts = attr.value.split(';').filter(Boolean);
            var safeParts = parts.filter(function(p) { return SAFE_STYLE.test(p.trim() + ';'); });
            if (safeParts.length) el.setAttribute('style', safeParts.join(';'));
            continue;
          }
          el.setAttribute(attr.name, attr.value);
        }
        el.appendChild(cleanNode(child));
        result.appendChild(el);
      } else {
        // Unknown tag — keep content, drop tag
        result.appendChild(cleanNode(child));
      }
    });
    return result;
  }

  // Safe innerHTML setter — use this instead of element.innerHTML = untrustedHTML
  window.EXAMORA.setHTML = function(el, html) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(cleanNode((function() {
      var t = document.createElement('template');
      t.innerHTML = typeof html === 'string' ? html : '';
      return t.content.cloneNode(true);
    })()));
  };

  // ── 2. BRUTE-FORCE / RATE LIMIT for auth ──────────────────────────────
  var AUTH_KEY      = 'examora_auth_attempts';
  var AUTH_LOCK_KEY = 'examora_auth_lockout';
  var MAX_ATTEMPTS  = 6;
  var LOCK_DURATION = 15 * 60 * 1000; // 15 minutes

  window.EXAMORA.authGate = {
    check: function() {
      var lockUntil = parseInt(localStorage.getItem(AUTH_LOCK_KEY) || '0', 10);
      if (lockUntil && Date.now() < lockUntil) {
        var remaining = Math.ceil((lockUntil - Date.now()) / 60000);
        return { blocked: true, minutes: remaining };
      }
      if (lockUntil && Date.now() >= lockUntil) {
        localStorage.removeItem(AUTH_LOCK_KEY);
        localStorage.removeItem(AUTH_KEY);
      }
      return { blocked: false };
    },
    recordFail: function() {
      var attempts = parseInt(localStorage.getItem(AUTH_KEY) || '0', 10) + 1;
      localStorage.setItem(AUTH_KEY, attempts);
      if (attempts >= MAX_ATTEMPTS) {
        localStorage.setItem(AUTH_LOCK_KEY, Date.now() + LOCK_DURATION);
        localStorage.removeItem(AUTH_KEY);
        return { locked: true, minutes: 15 };
      }
      return { locked: false, remaining: MAX_ATTEMPTS - attempts };
    },
    recordSuccess: function() {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(AUTH_LOCK_KEY);
    }
  };

  // ── 3. SESSION IDLE TIMEOUT ───────────────────────────────────────────
  var IDLE_LIMIT   = 30 * 60 * 1000; // 30 minutes
  var WARN_BEFORE  =  2 * 60 * 1000; // warn 2 min before
  var _idleTimer, _warnTimer, _warnBanner;

  function resetIdleTimer() {
    clearTimeout(_idleTimer);
    clearTimeout(_warnTimer);
    if (_warnBanner) { _warnBanner.remove(); _warnBanner = null; }

    _warnTimer = setTimeout(showIdleWarning, IDLE_LIMIT - WARN_BEFORE);
    _idleTimer = setTimeout(idleLogout,       IDLE_LIMIT);
  }

  function showIdleWarning() {
    if (_warnBanner || document.visibilityState === 'hidden') return;
    _warnBanner = document.createElement('div');
    _warnBanner.id = 'examora-idle-banner';
    _warnBanner.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9999;background:#f59e0b;color:#1a1a1a;font-family:Sora,sans-serif;font-weight:700;font-size:.82rem;padding:10px 18px;border-radius:0 0 12px 12px;box-shadow:0 4px 16px rgba(0,0,0,.2);display:flex;align-items:center;gap:10px;max-width:420px;width:90%;';
    _warnBanner.innerHTML = '⏰ Still there? You\'ll be logged out in 2 minutes. <button onclick="window.EXAMORA.stayActive()" style="margin-left:auto;background:#1a1a1a;color:white;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-weight:700;font-size:.76rem;">Stay</button>';
    document.body.appendChild(_warnBanner);
  }

  window.EXAMORA.stayActive = function() {
    resetIdleTimer();
  };

  function idleLogout() {
    // Only auto-logout on auth pages (not login)
    var path = window.location.pathname;
    if (path.includes('login')) return;
    // Sign out via Firebase if available
    if (window._firebaseAuth) {
      try { window._firebaseAuth.signOut(); } catch(_) {}
    }
    sessionStorage.setItem('examora_idle_logout', '1');
    window.location.href = 'login.html?reason=idle';
  }

  // Only run idle timer if not on login page
  if (!window.location.pathname.includes('login')) {
    ['mousemove','keydown','touchstart','scroll','click'].forEach(function(evt) {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();
  }

  // Show idle logout message on login page
  if (window.location.pathname.includes('login') && sessionStorage.getItem('examora_idle_logout')) {
    sessionStorage.removeItem('examora_idle_logout');
    document.addEventListener('DOMContentLoaded', function() {
      var el = document.getElementById('errMsg') || document.getElementById('authMsg');
      if (el) {
        el.textContent = '⏰ You were signed out due to inactivity. Please sign in again.';
        el.style.display = 'block';
      }
    });
  }

  // ── 4. SERVICE WORKER UPDATE NOTIFIER ────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(function(reg) {
      reg.addEventListener('updatefound', function() {
        var newWorker = reg.installing;
        newWorker.addEventListener('statechange', function() {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });
    }).catch(function() {});

    // Triggered when new SW takes control
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      window.location.reload();
    });
  }

  function showUpdateBanner() {
    if (document.getElementById('examora-update-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'examora-update-banner';
    banner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9998;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-family:Sora,sans-serif;font-weight:700;font-size:.8rem;padding:12px 18px;border-radius:12px;box-shadow:0 6px 24px rgba(99,102,241,.45);display:flex;align-items:center;gap:10px;max-width:360px;width:90%;animation:slideUp .3s ease;';
    banner.innerHTML = '🆕 A new version of EXAMORA is ready! <button onclick="window.location.reload()" style="margin-left:auto;background:rgba(255,255,255,.2);color:white;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-weight:700;font-size:.76rem;white-space:nowrap;">Update now</button>';
    document.body.appendChild(banner);
  }

  // ── 5. NETWORK STATUS BANNER ──────────────────────────────────────────
  var _netBanner = null;

  function showNetworkBanner(online) {
    if (_netBanner) _netBanner.remove();
    if (online) {
      // Show briefly then auto-remove
      _netBanner = document.createElement('div');
      _netBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9997;background:#10b981;color:white;font-family:Sora,sans-serif;font-weight:700;font-size:.78rem;padding:8px 16px;text-align:center;animation:slideDown .3s ease;';
      _netBanner.textContent = '✅ Back online!';
      document.body.appendChild(_netBanner);
      setTimeout(function() { if (_netBanner) { _netBanner.remove(); _netBanner = null; } }, 2500);
    } else {
      _netBanner = document.createElement('div');
      _netBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9997;background:#f43f5e;color:white;font-family:Sora,sans-serif;font-weight:700;font-size:.78rem;padding:8px 16px;text-align:center;';
      _netBanner.textContent = '📡 You\'re offline — showing cached content';
      document.body.appendChild(_netBanner);
    }
  }

  window.addEventListener('online',  function() { showNetworkBanner(true);  });
  window.addEventListener('offline', function() { showNetworkBanner(false); });
  // Check immediately on page load
  if (!navigator.onLine) {
    document.addEventListener('DOMContentLoaded', function() { showNetworkBanner(false); });
  }

  // ── 6. COOKIE / PRIVACY CONSENT (NDPR) ───────────────────────────────
  var CONSENT_KEY = 'examora_privacy_consent';

  function showConsentBanner() {
    if (localStorage.getItem(CONSENT_KEY)) return;
    if (window.location.pathname.includes('privacy') || window.location.pathname.includes('terms')) return;

    document.addEventListener('DOMContentLoaded', function() {
      // Slight delay so page loads first
      setTimeout(function() {
        if (document.getElementById('examora-consent-banner')) return;
        var banner = document.createElement('div');
        banner.id = 'examora-consent-banner';
        banner.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);z-index:9996;background:var(--surface,#fff);border:1.5px solid var(--border,#e2e5f1);border-radius:16px;padding:14px 16px;box-shadow:0 8px 32px rgba(0,0,0,.15);max-width:400px;width:calc(100% - 32px);font-family:Outfit,sans-serif;';
        banner.innerHTML =
          '<div style="font-family:Sora,sans-serif;font-weight:800;font-size:.85rem;color:var(--ink,#0d1030);margin-bottom:6px;">🍪 We use cookies</div>' +
          '<div style="font-size:.75rem;color:var(--ink-3,#9399c2);line-height:1.6;margin-bottom:12px;">EXAMORA uses cookies and local storage to keep you signed in and remember your preferences. We don\'t sell your data. <a href="privacy.html" style="color:#6366f1;font-weight:700;">Privacy Policy</a></div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button onclick="window.EXAMORA.acceptConsent()" style="flex:1;padding:9px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;border-radius:8px;font-family:Sora,sans-serif;font-weight:700;font-size:.78rem;cursor:pointer;">Accept</button>' +
            '<a href="privacy.html" style="flex:1;padding:9px;background:var(--surface-2,#eef0fa);color:var(--ink-2,#454c7a);border:1.5px solid var(--border,#e2e5f1);border-radius:8px;font-family:Sora,sans-serif;font-weight:700;font-size:.78rem;cursor:pointer;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;">Learn more</a>' +
          '</div>';
        document.body.appendChild(banner);
      }, 1000);
    });
  }

  window.EXAMORA.acceptConsent = function() {
    localStorage.setItem(CONSENT_KEY, Date.now().toString());
    var b = document.getElementById('examora-consent-banner');
    if (b) b.remove();
  };

  showConsentBanner();

  // ── 7. INPUT SANITIZATION HELPERS ────────────────────────────────────
  window.EXAMORA.sanitizeInput = function(str, maxLen) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/[<>'"&]/g, function(c) {
        return {'<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;','&':'&amp;'}[c];
      })
      .substring(0, maxLen || 2000)
      .trim();
  };

  // Validate email format
  window.EXAMORA.isValidEmail = function(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
  };

  // Validate password strength
  window.EXAMORA.passwordStrength = function(pw) {
    if (!pw || pw.length < 8) return { score: 0, label: 'Too short', color: '#f43f5e' };
    var score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    var labels = ['Weak','Fair','Good','Strong','Very strong'];
    var colors = ['#f43f5e','#f59e0b','#06b6d4','#10b981','#10b981'];
    return { score, label: labels[Math.min(score-1,4)], color: colors[Math.min(score-1,4)] };
  };

  // ── 8. DEVTOOLS WARNING ───────────────────────────────────────────────
  // Deter casual tampering — not a hard security measure
  var _devCheck = new Date();
  Object.defineProperty(_devCheck, 'toString', {
    get: function() {
      console.warn(
        '%c⚠ EXAMORA Security Notice',
        'color:#f43f5e;font-size:1.2rem;font-weight:bold;',
        '\n\nModifying this app in the browser may violate our Terms of Service.\nIf you found a security issue, please report it to: hello@examora.com.ng'
      );
    }
  });

  // ── 9. PREVENT CLICKJACKING (belt + suspenders with CSP) ──────────────
  if (window.self !== window.top) {
    window.top.location = window.self.location;
  }

  // ── 10. INLINE CSS ANIMATION KEYFRAMES needed for banners ─────────────
  var style = document.createElement('style');
  style.textContent = '@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}} @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}';
  document.head.appendChild(style);

})();
