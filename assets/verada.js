/* ============================================================
   Verada shared script
   1. Google Consent Mode v2 defaults (DENIED) + cookie banner
   2. Contact form: submission, validation, layered anti-spam
   Loaded on every page. No external dependencies.
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     CONFIGURATION  —  edit these three blocks only
     ---------------------------------------------------------- */

  var CONFIG = {

    // --- Contact form -------------------------------------------------
    // Web3Forms: create a free access key at https://web3forms.com
    // The key below is public and safe;
    // the destination address is stored server-side and never appears
    // in this file, in the page source, or in any HTTP response.
    form: {
      endpoint:   'https://api.web3forms.com/submit',
      accessKey:  'bd167070-93dc-4698-b7fb-7258654a64f6',
      minSeconds: 4,     // reject submissions faster than a human can type
      cooldownSec: 90,   // per-browser rate limit between submissions
      maxMessage: 4000
    },

    // --- Analytics (optional) ----------------------------------------
    // Leave empty until you actually deploy a container. When you add an
    // ID, tags load ONLY after the visitor accepts analytics cookies.
    gtmId: '',

    // --- Cloudflare Turnstile (optional, recommended before paid ads) --
    // Privacy-preserving CAPTCHA alternative: no cookies, no cross-site
    // tracking, no consent banner entry required. Get a key at
    // https://dash.cloudflare.com  →  Turnstile.
    turnstileSiteKey: ''
  };

  var CONSENT_KEY = 'verada_consent';
  var CONSENT_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // re-ask after 12 months

  /* ----------------------------------------------------------
     1. CONSENT MODE v2 — deny everything until told otherwise
     ---------------------------------------------------------- */

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted'
  });

  function readConsent() {
    try {
      var raw = window.localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || typeof v.ts !== 'number') return null;
      if (Date.now() - v.ts > CONSENT_MAX_AGE) return null;
      return v;
    } catch (e) { return null; }
  }

  function writeConsent(analytics) {
    try {
      window.localStorage.setItem(CONSENT_KEY, JSON.stringify({
        analytics: !!analytics, ts: Date.now(), v: 1
      }));
    } catch (e) { /* private browsing — banner will simply reappear */ }
  }

  function loadAnalytics() {
    if (!CONFIG.gtmId) return;
    gtag('consent', 'update', { analytics_storage: 'granted' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(CONFIG.gtmId);
    document.head.appendChild(s);
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  }

  function buildBanner() {
    if (document.getElementById('verada-cookie-banner')) return;
    var b = document.createElement('div');
    b.id = 'verada-cookie-banner';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-live', 'polite');
    b.setAttribute('aria-label', 'Cookie choices');
    b.innerHTML =
      '<div class="vb-title">A quick word about cookies</div>' +
      '<p>This site works without them. We would like to set optional analytics ' +
      'cookies to understand which pages are useful, but only if you say yes. ' +
      'Declining changes nothing about how the site works for you. ' +
      '<a href="cookie-policy.html">Read our Cookie Policy</a>.</p>' +
      '<div class="vb-actions">' +
        '<button type="button" id="vcb-accept">Accept analytics</button>' +
        '<button type="button" id="vcb-decline">Decline</button>' +
      '</div>';
    document.body.appendChild(b);

    document.getElementById('vcb-accept').addEventListener('click', function () {
      writeConsent(true); b.remove(); loadAnalytics();
    });
    document.getElementById('vcb-decline').addEventListener('click', function () {
      writeConsent(false); b.remove();
    });
    var first = document.getElementById('vcb-accept');
    if (first) first.focus();
  }

  function initConsent() {
    var stored = readConsent();
    if (stored === null) { buildBanner(); }
    else if (stored.analytics === true) { loadAnalytics(); }
  }

  // Exposed so the Cookie Policy page's "change my choice" button can call it
  window.veradaResetConsent = function () {
    try { window.localStorage.removeItem(CONSENT_KEY); } catch (e) {}
    buildBanner();
  };

  /* ----------------------------------------------------------
     2. CONTACT FORM
     ---------------------------------------------------------- */

  function initForm() {
    var form = document.getElementById('verada-contact-form');
    if (!form) return;

    var loadedAt   = Date.now();
    var btn        = form.querySelector('.vbtn');
    var statusBox  = document.getElementById('vform-status');
    var turnstileToken = null;

    // Optional Turnstile widget
    if (CONFIG.turnstileSiteKey) {
      var holder = document.getElementById('vform-turnstile');
      if (holder) {
        var ts = document.createElement('script');
        ts.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        ts.async = true; ts.defer = true;
        ts.onload = function () {
          if (window.turnstile) {
            window.turnstile.render(holder, {
              sitekey: CONFIG.turnstileSiteKey,
              theme: 'auto',
              callback: function (t) { turnstileToken = t; }
            });
          }
        };
        document.head.appendChild(ts);
      }
    }

    function setStatus(kind, title, msg) {
      statusBox.className = 'vform-status show ' + kind;
      statusBox.innerHTML = '<strong>' + title + '</strong>' + msg;
      statusBox.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
      statusBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function markField(el, bad) {
      var wrap = el.closest('.vfield') || el.closest('.vcheck');
      if (wrap) wrap.classList.toggle('invalid', !!bad);
    }

    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      el.addEventListener('input', function () { markField(el, false); });
      el.addEventListener('change', function () { markField(el, false); });
    });

    function validate() {
      var ok = true, firstBad = null;
      var required = ['name', 'email', 'enquiry_type', 'message'];
      required.forEach(function (n) {
        var el = form.elements[n];
        if (!el) return;
        var bad = !el.value || !String(el.value).trim();
        if (n === 'email' && !bad) {
          bad = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim());
        }
        if (n === 'message' && !bad) {
          bad = el.value.trim().length < 20 || el.value.length > CONFIG.form.maxMessage;
        }
        markField(el, bad);
        if (bad) { ok = false; if (!firstBad) firstBad = el; }
      });

      var ack = form.elements['privacy_ack'];
      if (ack && !ack.checked) {
        markField(ack, true); ok = false; if (!firstBad) firstBad = ack;
      }
      if (firstBad) firstBad.focus();
      return ok;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      statusBox.className = 'vform-status';

      // --- Anti-spam layer 1: honeypot -----------------------------
      // Real people never see this field, so any value means a bot.
      // We fail silently: bots get a success message and no email is sent.
      var hp = form.elements['botcheck'];
      if (hp && hp.value) {
        setStatus('ok', 'Thank you', 'Your message has been received.');
        form.reset();
        return;
      }

      // --- Anti-spam layer 2: time trap ----------------------------
      var elapsed = (Date.now() - loadedAt) / 1000;
      if (elapsed < CONFIG.form.minSeconds) {
        setStatus('bad', 'One moment', 'That was submitted unusually quickly. Please take a second and try again.');
        return;
      }

      // --- Anti-spam layer 3: per-browser cooldown -----------------
      try {
        var last = parseInt(window.localStorage.getItem('verada_last_send') || '0', 10);
        if (last && (Date.now() - last) / 1000 < CONFIG.form.cooldownSec) {
          setStatus('bad', 'Already sent', 'We have your message. Please wait a moment before sending another.');
          return;
        }
      } catch (err) { /* ignore */ }

      // --- Anti-spam layer 4: Turnstile (if configured) ------------
      if (CONFIG.turnstileSiteKey && !turnstileToken) {
        setStatus('bad', 'Verification needed', 'Please complete the verification check above and try again.');
        return;
      }

      if (!validate()) {
        setStatus('bad', 'Please check the highlighted fields', 'A few details are missing or incomplete.');
        return;
      }

      if (CONFIG.form.accessKey.indexOf('REPLACE_WITH') === 0) {
        setStatus('bad', 'Form not yet connected',
          'This form has not been configured. Please write to ' +
          '<a href="mailto:info@verada.health">info@verada.health</a> in the meantime.');
        return;
      }

      var data = new FormData();
      data.append('access_key', CONFIG.form.accessKey);
      data.append('subject', '[Verada website] ' + form.elements['enquiry_type'].value +
                             ' — ' + form.elements['name'].value);
      data.append('from_name', 'Verada website');
      data.append('name', form.elements['name'].value.trim());
      data.append('email', form.elements['email'].value.trim());
      data.append('organisation', (form.elements['organisation'].value || '').trim());
      data.append('enquiry_type', form.elements['enquiry_type'].value);
      data.append('message', form.elements['message'].value.trim());
      data.append('marketing_opt_in', form.elements['marketing_opt_in'].checked ? 'YES' : 'no');
      data.append('privacy_ack', 'acknowledged ' + new Date().toISOString());
      data.append('botcheck', '');
      if (turnstileToken) data.append('cf-turnstile-response', turnstileToken);

      btn.disabled = true;
      btn.classList.add('sending');

      fetch(CONFIG.form.endpoint, {
        method: 'POST',
        body: data
      })
        .then(function (r) { return r.json().catch(function () { return { success: r.ok }; }); })
        .then(function (res) {
          if (res && res.success) {
            try { window.localStorage.setItem('verada_last_send', String(Date.now())); } catch (err) {}
            setStatus('ok', 'Message sent',
              'Thank you — we have your enquiry and will reply within two working days.');
            form.reset();
            if (window.turnstile) { window.turnstile.reset(); turnstileToken = null; }
          } else {
            setStatus('bad', 'That did not go through',
              'Something went wrong at our end. Please try again, or write to ' +
              '<a href="mailto:info@verada.health">info@verada.health</a>.');
          }
        })
        .catch(function () {
          setStatus('bad', 'No connection',
            'We could not reach the server. Please check your connection and try again, or write to ' +
            '<a href="mailto:info@verada.health">info@verada.health</a>.');
        })
        .then(function () {
          btn.disabled = false;
          btn.classList.remove('sending');
        });
    });
  }

  /* ---------------------------------------------------------- */

  function boot() { initConsent(); initForm(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
