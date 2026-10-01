/**
 * OmniSupport embeddable chat widget, v2.
 *
 * Embed with nothing but the project key:
 *
 *   <script src="https://app.example.com/widget.js"
 *           data-project-key="pk_live_..." async defer></script>
 *
 * Design rules this file follows, all of which the previous version broke:
 *
 * 1. Appearance comes from GET /api/v1/public/widget-config/{key}, not from the
 *    snippet. A tenant changing their accent colour must not have to re-embed,
 *    and tenant-controlled strings interpolated into a page is where a stored
 *    XSS would live.
 * 2. No innerHTML, ever. Every tenant or model supplied string reaches the DOM
 *    through textContent. A bot_name of "<img onerror=alert(1)>" renders as
 *    visible nonsense.
 * 3. The launcher paints before any network call. Fetching config first would
 *    mean a slow API delays the widget the customer embedded for its speed.
 * 4. One instance per project key per page. Re-tagging the script, or two
 *    tenants sharing a page, must not produce a duplicate widget or fight over
 *    window globals.
 *
 * Wire protocol, matching app/ws/chat.py and app/services/chat.py:
 *   in : message{text,conversation_id}, ping, handoff
 *   out: ready, conversation, delta{text}, done{text,citations_json,latency_ms},
 *        error{code,message}, quota_exceeded{used,limit,message,scope,retry_after},
 *        handoff{accepted}, pong, superseded, transcript
 *   close: 4001 bad key, 4002 inactive, 4003 origin denied, 4029 rate limited,
 *          1011 server error
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- guard --
  // Keyed by project key rather than a single boolean: one page can legitimately
  // host two tenants' widgets side by side, and each must be initialisable.
  var registry = window.__OMNI_WIDGETS__ || (window.__OMNI_WIDGETS__ = {});

  // ------------------------------------------------------------- settings --
  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName('script');
      return all.length ? all[all.length - 1] : null;
    })();

  function attr(name) {
    var v = script && script.getAttribute(name);
    return v == null ? '' : String(v).trim();
  }

  var globalCfg = window.OmniSupportConfig || {};

  var projectKey = attr('data-project-key') || (globalCfg.projectKey ? String(globalCfg.projectKey) : '');
  if (!projectKey) {
    // Without a key there is nothing to connect to, and guessing would risk
    // sending one tenant's visitors to another's project.
    return;
  }
  if (registry[projectKey]) return;

  // The origin the API is served from, in order of precedence:
  //
  //   1. data-api-url / OmniSupportConfig.apiUrl -- for a host that proxies the
  //      API or terminates it somewhere else.
  //   2. The origin this very script was loaded from. That is the app's origin,
  //      by definition, and it is the only answer that is correct on a customer
  //      page. Defaulting to window.location.origin, as this file did, means a
  //      widget embedded on https://customer.example asks
  //      https://customer.example/api/public/widget-config/... and fails in
  //      production for every tenant while appearing fine on a same-origin demo.
  //   3. window.location.origin, only if the script element cannot be read at
  //      all, in which case there is nothing better to go on.
  function scriptOrigin() {
    var src = script && (script.src || script.getAttribute('src'));
    if (!src) return '';
    try {
      return new URL(src, window.location.href).origin;
    } catch (e) {
      return '';
    }
  }

  var apiOrigin =
    attr('data-api-url') ||
    (globalCfg.apiUrl ? String(globalCfg.apiUrl) : '') ||
    scriptOrigin() ||
    window.location.origin;
  var wsOverride = attr('data-ws-url') || '';
  var debug = attr('data-debug') === 'true' || globalCfg.debug === true;

  // Defaults are overwritten by the server response. They exist so the widget
  // is usable and legible if that request fails.
  var cfg = {
    project_id: '',
    bot_name: 'Support',
    subtitle: 'How can we help?',
    greeting: '',
    theme_color: '#2563eb',
    position: 'right',
    launcher_label: 'Chat',
    dark_mode: false,
    plan: 'trial',
    watermarked: true
  };

  function warn() {
    // Console output is opt-in only: a widget that logs on every customer page
    // is noise in someone else's devtools and tends to get muted wholesale.
    if (debug && window.console && console.warn) {
      console.warn.apply(console, ['[omni-widget]'].concat(Array.prototype.slice.call(arguments)));
    }
  }

  var VISITOR_STORAGE_KEY = 'omni.visitorId';

  /**
   * A stable, random, non-identifying label for this browser.
   *
   * Grants no access to anything: the server stores it to group a transcript and
   * to bucket a rate limit, and authorizes on the project key alone. Generated
   * with getRandomValues rather than a timestamp so two visitors created in the
   * same millisecond do not collide, and validated against the server's accepted
   * charset because a stored value outside it is silently discarded there -- which
   * would reset the bucket on every load and look like the limit never tripping.
   */
  function visitorId() {
    try {
      var existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
      if (existing && /^[A-Za-z0-9_-]{1,64}$/.test(existing)) return existing;
      var bytes = new Uint8Array(16);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(bytes);
      } else {
        for (var i = 0; i < bytes.length; i += 1) {
          bytes[i] = Math.floor(Math.random() * 256);
        }
      }
      var id = 'v';
      for (var j = 0; j < bytes.length; j += 1) {
        id += (bytes[j] + 0x100).toString(16).slice(1);
      }
      window.localStorage.setItem(VISITOR_STORAGE_KEY, id);
      return id;
    } catch (e) {
      // Private browsing with storage disabled. Returning nothing is correct:
      // the server falls back to a per-connection id, which is worse but safe.
      return '';
    }
  }

  function wsEndpoint() {
    if (wsOverride) return wsOverride;
    var base;
    try {
      base = new URL(apiOrigin, window.location.href);
    } catch (e) {
      warn('bad api url, falling back to current origin', apiOrigin);
      base = new URL(window.location.origin);
    }
    var scheme = base.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = scheme + '//' + base.host + '/ws/chat';
    // The project key is not in the query string; it is offered as a subprotocol
    // in connect(). This query carries only the visitor id, which is a label and
    // not a credential, and which a browser has no other way to send -- the
    // WebSocket constructor cannot set headers.
    //
    // It is persisted in localStorage so a visitor keeps one identity across
    // reloads and reconnects. Without it the server mints a fresh id per
    // connection, which resets their rate-limit bucket and fragments their
    // transcript. It authorizes nothing, and it is generated here rather than
    // derived from anything identifying.
    var visitor = visitorId();
    if (visitor) url += '?visitorId=' + encodeURIComponent(visitor);
    return url;
  }

  function configEndpoint() {
    return new URL(
      '/api/v1/public/widget-config/' + encodeURIComponent(projectKey),
      apiOrigin || window.location.href
    ).toString();
  }

  // ----------------------------------------------------------------- dom --
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  var host = document.createElement('div');
  // Not display:none: the widget is visible immediately.
  host.setAttribute('data-omni-widget', projectKey);
  var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  var style = document.createElement('style');
  style.textContent = css();
  shadow.appendChild(style);

  var container = el('div', 'omni-container');
  container.setAttribute('data-position', cfg.position);

  var panel = el('section', 'omni-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', cfg.bot_name);
  panel.setAttribute('aria-hidden', 'true');
  panel.hidden = true;

  var header = el('header', 'omni-header');
  var titles = el('div', 'omni-titles');
  var titleText = el('strong', 'omni-title', cfg.bot_name);
  var subtitleText = el('span', 'omni-subtitle', cfg.subtitle);
  titles.appendChild(titleText);
  titles.appendChild(subtitleText);

  var closeBtn = el('button', 'omni-icon-btn', '×');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close chat');

  header.appendChild(titles);
  header.appendChild(closeBtn);

  // Politely announces streaming replies without interrupting typing.
  var log = el('div', 'omni-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-relevant', 'additions text');
  log.setAttribute('aria-label', 'Conversation');

  var form = el('form', 'omni-composer');
  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'omni-input';
  input.setAttribute('aria-label', 'Message');
  input.setAttribute('autocomplete', 'off');
  input.placeholder = 'Type a message…';
  var sendBtn = el('button', 'omni-send-btn', 'Send');
  sendBtn.type = 'submit';
  form.appendChild(input);
  form.appendChild(sendBtn);

  var footer = el('footer', 'omni-footer');
  var watermark = el('span', 'omni-watermark', 'Powered by OmniSupport');

  panel.appendChild(header);
  panel.appendChild(log);
  panel.appendChild(form);
  panel.appendChild(footer);

  var launcher = el('button', 'omni-launcher');
  launcher.type = 'button';
  launcher.setAttribute('aria-label', cfg.launcher_label);
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-haspopup', 'dialog');

  container.appendChild(panel);
  container.appendChild(launcher);
  shadow.appendChild(container);

  function mount() {
    if (!document.body) {
      // Deferred scripts can run before body exists; retry on the next tick
      // rather than throwing.
      document.addEventListener('DOMContentLoaded', mount, { once: true });
      return;
    }
    document.body.appendChild(host);
    applyConfig(cfg);
    fetchConfig();
  }

  // -------------------------------------------------------------- config --
  function css() {
    return [
      ':host{all:initial;}',
      '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}',
      '.omni-container{position:fixed;bottom:20px;z-index:2147483000;display:flex;flex-direction:column;',
      'align-items:flex-end;gap:12px;pointer-events:none;font-size:14px;line-height:1.5;}',
      '[data-position="left"]{left:20px;align-items:flex-start;}',
      '[data-position="right"]{right:20px;}',
      '.omni-launcher{pointer-events:auto;position:relative;display:inline-flex;align-items:center;gap:8px;',
      'min-height:52px;padding:0 18px;border:0;border-radius:999px;cursor:pointer;',
      'background:var(--omni-accent,#2563eb);color:var(--omni-on-accent,#fff);font-size:14px;font-weight:600;',
      'box-shadow:0 6px 20px rgba(15,23,42,.22);}',
      '.omni-launcher:hover{filter:brightness(1.06);}',
      '.omni-launcher:focus-visible{outline:3px solid var(--omni-focus,#93c5fd);outline-offset:2px;}',
      '.omni-launcher[data-watermarked="true"]::after{content:"";position:absolute;inset:-3px;border-radius:999px;',
      'border:1px dashed var(--omni-watermark-line,rgba(37,99,235,.45));}',
      '.omni-panel{pointer-events:auto;display:flex;flex-direction:column;width:min(380px,calc(100vw - 32px));',
      'height:min(560px,calc(100vh - 120px));overflow:hidden;border-radius:16px;',
      'background:var(--omni-surface,#fff);color:var(--omni-text,#0f172a);',
      'border:1px solid var(--omni-border,#e2e8f0);box-shadow:0 18px 50px rgba(15,23,42,.24);}',
      '.omni-panel[hidden]{display:none;}',
      '.omni-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;',
      'background:var(--omni-accent,#2563eb);color:var(--omni-on-accent,#fff);}',
      '.omni-titles{display:flex;flex-direction:column;min-width:0;}',
      '.omni-title{font-size:15px;font-weight:650;overflow-wrap:anywhere;}',
      '.omni-subtitle{font-size:12px;opacity:.85;overflow-wrap:anywhere;}',
      '.omni-icon-btn{flex:none;width:28px;height:28px;border:0;border-radius:8px;cursor:pointer;',
      'background:rgba(255,255,255,.16);color:inherit;font-size:18px;line-height:1;}',
      '.omni-icon-btn:focus-visible{outline:2px solid #fff;outline-offset:1px;}',
      '.omni-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;',
      'background:var(--omni-log-bg,#f8fafc);}',
      '.omni-row{display:flex;flex-direction:column;gap:3px;max-width:85%;}',
      '.omni-row.user{align-self:flex-end;align-items:flex-end;}',
      '.omni-row.bot{align-self:flex-start;}',
      '.omni-bubble{padding:9px 12px;border-radius:14px;font-size:14px;overflow-wrap:anywhere;white-space:pre-wrap;}',
      '.omni-row.bot .omni-bubble{background:var(--omni-surface,#fff);border:1px solid var(--omni-border,#e2e8f0);',
      'border-bottom-left-radius:4px;}',
      '.omni-row.user .omni-bubble{background:var(--omni-accent,#2563eb);color:var(--omni-on-accent,#fff);',
      'border-bottom-right-radius:4px;}',
      '.omni-bubble code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;',
      'background:rgba(15,23,42,.07);padding:1px 4px;border-radius:4px;}',
      '.omni-bubble strong{font-weight:650;}',
      '.omni-time{font-size:11px;color:var(--omni-muted,#64748b);}',
      '.omni-cites{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;}',
      '.omni-cite{font-size:11px;padding:2px 7px;border-radius:999px;',
      'background:var(--omni-cite-bg,#e2e8f0);color:var(--omni-muted,#475569);}',
      '.omni-card{padding:11px 13px;border-radius:12px;font-size:13px;border:1px solid var(--omni-border,#e2e8f0);',
      'background:var(--omni-surface,#fff);}',
      '.omni-card.warn{border-color:#f59e0b;background:#fffbeb;color:#78350f;}',
      '.omni-card.error{border-color:#ef4444;background:#fef2f2;color:#7f1d1d;}',
      '.omni-card strong{display:block;margin-bottom:3px;}',
      '.omni-typing{align-self:flex-start;display:flex;gap:4px;padding:11px 14px;',
      'background:var(--omni-surface,#fff);border:1px solid var(--omni-border,#e2e8f0);border-radius:14px;}',
      '.omni-typing i{width:6px;height:6px;border-radius:50%;background:var(--omni-muted,#94a3b8);',
      'animation:omni-blink 1.2s infinite;}',
      '.omni-typing i:nth-child(2){animation-delay:.18s;}',
      '.omni-typing i:nth-child(3){animation-delay:.36s;}',
      '@keyframes omni-blink{0%,60%,100%{opacity:.25;}30%{opacity:1;}}',
      '@media (prefers-reduced-motion:reduce){.omni-typing i{animation:none;}}',
      '.omni-composer{display:flex;gap:8px;padding:12px;border-top:1px solid var(--omni-border,#e2e8f0);',
      'background:var(--omni-surface,#fff);}',
      '.omni-input{flex:1;min-width:0;padding:10px 12px;border-radius:10px;font-size:14px;',
      'border:1px solid var(--omni-border,#cbd5e1);background:var(--omni-field-bg,#fff);color:inherit;}',
      '.omni-input:focus-visible{outline:2px solid var(--omni-accent,#2563eb);outline-offset:1px;}',
      '.omni-send-btn{padding:0 16px;border:0;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;',
      'background:var(--omni-accent,#2563eb);color:var(--omni-on-accent,#fff);}',
      '.omni-send-btn:disabled{opacity:.5;cursor:not-allowed;}',
      '.omni-footer{padding:6px 12px 8px;text-align:center;background:var(--omni-surface,#fff);}',
      '.omni-watermark{font-size:10.5px;color:var(--omni-muted,#94a3b8);}',
      '.omni-watermark[hidden]{display:none;}'
    ].join('');
  }

  /** Push server values into the DOM and CSS variables. */
  function applyConfig(next) {
    for (var k in next) {
      if (Object.prototype.hasOwnProperty.call(next, k)) cfg[k] = next[k];
    }

    container.setAttribute('data-position', cfg.position === 'left' ? 'left' : 'right');

    // textContent, never innerHTML: these strings are tenant-controlled.
    titleText.textContent = cfg.bot_name;
    subtitleText.textContent = cfg.subtitle;
    panel.setAttribute('aria-label', cfg.bot_name + ' chat');
    launcher.setAttribute('aria-label', cfg.launcher_label);
    launcher.textContent = cfg.launcher_label;
    sendBtn.textContent = 'Send';

    var dark = !!cfg.dark_mode;
    host.style.setProperty('--omni-accent', cfg.theme_color);
    if (dark) {
      host.style.setProperty('--omni-surface', '#0f172a');
      host.style.setProperty('--omni-log-bg', '#111c31');
      host.style.setProperty('--omni-text', '#e2e8f0');
      host.style.setProperty('--omni-border', '#1e293b');
      host.style.setProperty('--omni-field-bg', '#0b1220');
      host.style.setProperty('--omni-muted', '#94a3b8');
      host.style.setProperty('--omni-cite-bg', '#1e293b');
      host.style.setProperty('--omni-focus', '#60a5fa');
      host.style.setProperty('--omni-watermark-line', 'rgba(147,197,253,.35)');
      host.style.colorScheme = 'dark';
    } else {
      host.style.setProperty('--omni-surface', '#ffffff');
      host.style.setProperty('--omni-log-bg', '#f8fafc');
      host.style.setProperty('--omni-text', '#0f172a');
      host.style.setProperty('--omni-border', '#e2e8f0');
      host.style.setProperty('--omni-field-bg', '#ffffff');
      host.style.setProperty('--omni-muted', '#64748b');
      host.style.setProperty('--omni-cite-bg', '#e2e8f0');
      host.style.setProperty('--omni-focus', '#93c5fd');
      host.style.setProperty('--omni-watermark-line', 'rgba(37,99,235,.35)');
      host.style.colorScheme = 'light';
    }

    // Trial tenants carry the attribution PLAN_LIMITS requires; paying tenants
    // do not get a badge they did not ask for.
    var showWatermark = cfg.watermarked === true;
    watermark.hidden = !showWatermark;
    launcher.setAttribute('data-watermarked', showWatermark ? 'true' : 'false');

    if (cfg.greeting && !logHasContent()) {
      appendBot(cfg.greeting);
    }
  }

  function fetchConfig() {
    if (!window.fetch) return;
    fetch(configEndpoint(), { credentials: 'omit', mode: 'cors' })
      .then(function (res) {
        if (!res.ok) throw new Error('config ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || typeof data !== 'object') return;
        applyConfig({
          project_id: String(data.project_id || ''),
          bot_name: str(data.bot_name, cfg.bot_name),
          subtitle: str(data.subtitle, cfg.subtitle),
          greeting: typeof data.greeting === 'string' ? data.greeting.slice(0, 400) : '',
          // Re-validated client side. The server already enforces hex, but this
          // value lands in a CSS custom property and a second tenant supplying
          // a config by other means must not become a url() loader.
          theme_color: hex(data.theme_color, cfg.theme_color),
          position: data.position === 'left' ? 'left' : 'right',
          launcher_label: str(data.launcher_label, cfg.launcher_label),
          dark_mode: data.dark_mode === true,
          plan: str(data.plan, cfg.plan),
          watermarked: data.watermarked === true
        });
        emit('config', { project_id: cfg.project_id, plan: cfg.plan });
      })
      .catch(function (err) {
        // Defaults already render a working widget; the API being unreachable
        // must not take the customer's support chat offline.
        warn('widget config unavailable, using defaults:', err && err.message);
      });
  }

  function str(v, fallback) {
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : fallback;
  }

  function hex(v, fallback) {
    if (typeof v !== 'string') return fallback;
    var c = v.trim();
    return (c.length === 4 || c.length === 7) && /^#[0-9a-fA-F]+$/.test(c) ? c : fallback;
  }

  // ------------------------------------------------------------ rendering --
  function logHasContent() {
    return log.children.length > 0;
  }

  function atBottom() {
    return log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  }

  function scrollToEnd(force) {
    if (force !== false && atBottom()) log.scrollTop = log.scrollHeight;
  }

  /**
   * Minimal markdown-to-nodes. Bold, inline code, bullets and line breaks are
   * the only formatting an assistant answer needs, and doing it with nodes
   * rather than a string keeps model output structurally incapable of becoming
   * markup.
   */
  function renderRich(target, raw) {
    clear(target);
    var lines = String(raw == null ? '' : raw).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (i > 0) target.appendChild(document.createElement('br'));
      var line = lines[i];
      var bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
      var numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      if (bullet) target.appendChild(document.createTextNode('• ' + bullet[1]));
      else if (numbered) target.appendChild(document.createTextNode(numbered[0].trim()));
      else appendInline(target, line);
    }
  }

  function appendInline(target, text) {
    var re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
    var last = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) target.appendChild(document.createTextNode(text.slice(last, m.index)));
      var tok = m[0];
      if (tok.charAt(0) === '`') {
        target.appendChild(el('code', null, tok.slice(1, -1)));
      } else {
        target.appendChild(el('strong', null, tok.slice(2, -2)));
      }
      last = m.index + tok.length;
    }
    if (last < text.length) target.appendChild(document.createTextNode(text.slice(last)));
  }

  function nowLabel() {
    try {
      return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function appendUser(text) {
    var row = el('div', 'omni-row user');
    var bubble = el('div', 'omni-bubble');
    bubble.textContent = text;
    row.appendChild(bubble);
    row.appendChild(el('div', 'omni-time', nowLabel()));
    log.appendChild(row);
    scrollToEnd();
  }

  function appendBot(text, rawText) {
    var row = el('div', 'omni-row bot');
    var bubble = el('div', 'omni-bubble');
    renderRich(bubble, rawText == null ? text : rawText);
    row.appendChild(bubble);
    log.appendChild(row);
    scrollToEnd();
    return bubble;
  }

  function addCitations(row, citationsJson) {
    if (!citationsJson) return;
    var list;
    try {
      list = typeof citationsJson === 'string' ? JSON.parse(citationsJson) : citationsJson;
    } catch (e) {
      return;
    }
    if (!Array.isArray(list) || !list.length) return;
    var wrap = el('div', 'omni-cites');
    for (var i = 0; i < list.length; i++) {
      var c = list[i] || {};
      var label = String(c.title || 'Source ' + (i + 1)).slice(0, 60);
      if (c.section) label += ' · ' + String(c.section).slice(0, 40);
      wrap.appendChild(el('span', 'omni-cite', label));
    }
    row.appendChild(wrap);
  }

  function appendCard(title, body, variant) {
    var card = el('div', 'omni-card' + (variant ? ' ' + variant : ''));
    if (title) card.appendChild(el('strong', null, title));
    card.appendChild(el('span', null, body));
    var row = el('div', 'omni-row bot');
    row.appendChild(card);
    log.appendChild(row);
    scrollToEnd();
  }

  function showTyping() {
    if (typing) return;
    typing = el('div', 'omni-typing');
    typing.setAttribute('aria-label', 'Assistant is typing');
    typing.appendChild(el('i'));
    typing.appendChild(el('i'));
    typing.appendChild(el('i'));
    log.appendChild(typing);
    scrollToEnd();
  }

  function hideTyping() {
    if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
    typing = null;
  }

  var typing = null;
  var streamingRow = null;

  // ---------------------------------------------------------------- open --
  var lastFocused = null;

  function focusables() {
    return [input, sendBtn, closeBtn].filter(function (n) {
      return n && n.offsetParent !== null;
    });
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    // Trap focus: without this, Tab walks out of the widget and into whatever
    // the host page has after it, leaving the dialog owner tabbing in the dark.
    var items = focusables();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    var active = shadow.activeElement || document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function open() {
    if (!panel.hidden) return;
    lastFocused = document.activeElement;
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    // Focus is trapped below, so the dialog is genuinely modal and saying so is
    // the accurate signal for assistive tech.
    panel.setAttribute('aria-modal', 'true');
    panel.addEventListener('keydown', onKeydown);
    input.focus();
    emit('open', {});
    connect();
  }

  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('aria-modal', 'false');
    panel.removeEventListener('keydown', onKeydown);
    // Focus goes back where it came from, otherwise keyboard users are dropped
    // at the top of the document every time they close the chat.
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
    emit('close', {});
  }

  launcher.addEventListener('click', function () {
    if (panel.hidden) open();
    else close();
  });
  closeBtn.addEventListener('click', close);

  // ------------------------------------------------------------ websocket --
  var ws = null;
  var retry = 0;
  var heartbeat = null;
  var intentionallyClosed = false;
  var conversationId = null;

  // 4001/4002/4003 mean the key or the subscription is wrong. Reconnecting would
  // just replay the same rejection in a loop, so those are terminal and the
  // visitor is told plainly.
  var TERMINAL_CLOSES = {
    4001: 'This chat is not available. Please contact us another way.',
    4002: 'This chat is temporarily unavailable.',
    4003: 'This chat is not allowed on this site.',
    // The server refuses an insecure upgrade; retrying over ws:// would just
    // be rejected again.
    4004: 'This chat requires a secure (https) connection.'
  };

  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    if (!window.WebSocket) {
      appendCard('Unsupported browser', 'This chat needs a modern browser.', 'warn');
      return;
    }
    intentionallyClosed = false;
    var url = wsEndpoint();
    try {
      // The project key travels as a subprotocol, not in the query string. A key
      // in the URL is written to every proxy, CDN and access log between the
      // visitor's browser and this server; the server accepts both, but only one
      // of them is not a published credential. The key charset is alnum plus '-'
      // and '_', which is exactly what a subprotocol token allows, so no encoding
      // is needed or applied.
      ws = new WebSocket(url, ['omni-v1', 'omni-key.' + projectKey]);
    } catch (e) {
      warn('websocket construction failed', e);
      scheduleRetry();
      return;
    }

    ws.onopen = function () {
      retry = 0;
      heartbeat = window.setInterval(function () {
        if (ws && ws.readyState === 1) send({ type: 'ping' });
      }, 25000);
      emit('connected', {});
    };

    ws.onmessage = function (evt) {
      var msg;
      try {
        msg = JSON.parse(evt.data);
      } catch (e) {
        warn('unparseable frame');
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      handle(msg);
    };

    ws.onclose = function (evt) {
      stopHeartbeat();
      hideTyping();
      var reason = TERMINAL_CLOSES[evt.code];
      if (reason) {
        appendCard('Chat unavailable', reason, 'warn');
        emit('unavailable', { code: evt.code, reason: reason });
        return;
      }
      if (evt.code === 4029) {
        appendCard('Too many messages', 'Please wait a moment before sending again.', 'warn');
        emit('rate_limited', { code: evt.code });
        return;
      }
      if (!intentionallyClosed) scheduleRetry();
    };

    ws.onerror = function () {
      // onclose always follows; retry logic lives there so it runs once.
      warn('websocket error');
    };
  }

  function scheduleRetry() {
    // Capped exponential backoff. A backend restart should be picked up quickly;
    // an outage should not turn into a reconnect storm from every customer page.
    var delay = Math.min(1000 * Math.pow(2, retry), 30000);
    retry += 1;
    window.setTimeout(connect, delay);
  }

  function stopHeartbeat() {
    if (heartbeat) {
      window.clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  function send(payload) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
  }

  function handle(msg) {
    switch (msg.type) {
      case 'ready':
        conversationId = msg.conversation_id || null;
        emit('ready', msg);
        break;

      case 'conversation':
        conversationId = msg.conversation_id || null;
        break;

      case 'delta':
        if (!streamingRow) {
          hideTyping();
          streamingRow = appendBot('');
        }
        streamingRow._raw = (streamingRow._raw || '') + String(msg.text || '');
        renderRich(streamingRow, streamingRow._raw);
        scrollToEnd();
        break;

      case 'done':
        hideTyping();
        if (streamingRow) {
          // Prefer the authoritative final text over the accumulated deltas:
          // it is what was persisted, so the widget and the transcript agree.
          renderRich(streamingRow, msg.text || streamingRow._raw || '');
          addCitations(streamingRow, msg.citations_json);
          scrollToEnd();
          streamingRow = null;
        } else if (msg.text) {
          // A reply can arrive with no delta at all -- a provider that streams
          // nothing, or a fast path that skipped the intermediate frames. The
          // answer is in `done`; rendering only the deltas would leave the
          // visitor looking at a typing indicator that resolves to nothing.
          streamingRow = appendBot(String(msg.text));
          addCitations(streamingRow, msg.citations_json);
          scrollToEnd();
        }
        if (msg.handoff) appendHandoff();
        emit('message', { text: msg.text, latency_ms: msg.latency_ms });
        break;

      case 'quota_exceeded':
        hideTyping();
        // Two different producers send this frame and they mean different things:
        // the per-minute rate limiter and the monthly plan quota. The limiter's
        // event carries `scope` and `retry_after` and no `message`; the quota
        // one carries the counters. Telling a visitor who just typed too fast
        // that they have used up their month is the kind of error that generates
        // a support ticket about a limit they have not hit.
        if (msg.scope && msg.scope !== 'month') {
          var wait = msg.retry_after ? Math.ceil(Number(msg.retry_after)) : 60;
          appendCard(
            'Slow down a moment',
            msg.message || 'You are sending messages too quickly. Try again in about ' + wait + ' seconds.',
            'warn'
          );
          emit('rate_limited', { scope: msg.scope, retry_after: msg.retry_after });
        } else {
          appendCard(
            'Monthly limit reached',
            msg.message || 'This assistant has used its messages for this month.',
            'warn'
          );
          emit('quota', { used: msg.used, limit: msg.limit });
        }
        break;

      case 'handoff':
        appendHandoff();
        emit('handoff', {});
        break;

      case 'superseded':
        // A newer turn replaced this one. Drop the partial answer rather than
        // leaving a half-written message the visitor will read as final.
        if (streamingRow && streamingRow.parentNode) streamingRow.parentNode.removeChild(streamingRow);
        streamingRow = null;
        hideTyping();
        break;

      case 'error':
        hideTyping();
        appendCard('Something went wrong', msg.message || 'Please try again.', 'error');
        emit('error', { code: msg.code, message: msg.message });
        break;

      case 'pong':
      case 'transcript':
        break;

      default:
        warn('unknown frame type', msg.type);
    }
  }

  function appendHandoff() {
    appendCard('A human will take over', 'Someone from our team has been notified and will reply here.', '');
  }

  // -------------------------------------------------------------- compose --
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    if (!ws || ws.readyState !== 1) {
      appendCard('Not connected', 'Reconnecting…', 'warn');
      connect();
      return;
    }
    input.value = '';
    appendUser(text);
    showTyping();
    // conversation_id is required, not optional: the server creates a conversation on
    // the first message and, without it, treats every message as a new
    // conversation. That loses history, so the assistant forgets the previous
    // turn and the inbox shows one truncated conversation per message.
    var payload = { type: 'message', text: text };
    if (conversationId) payload.conversation_id = conversationId;
    send(payload);
    emit('sent', { text: text, conversation_id: conversationId });
  });

  // -------------------------------------------------------------- host api --
  function emit(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent('omni:' + name, { detail: detail || {} }));
    } catch (e) {
      // CustomEvent is unsupported or blocked; the widget still works, the host
      // page just does not get its hooks.
    }
  }

  // Let the host page drive the widget without reaching into the shadow tree.
  window.OmniSupport = window.OmniSupport || {};
  window.OmniSupport.open = open;
  window.OmniSupport.close = close;
  window.OmniSupport.toggle = function () {
    if (panel.hidden) open();
    else close();
  };
  window.OmniSupport.isOpen = function () {
    return !panel.hidden;
  };

  registry[projectKey] = {
    open: open,
    close: close,
    destroy: function () {
      intentionallyClosed = true;
      stopHeartbeat();
      if (ws) ws.close();
      if (host.parentNode) host.parentNode.removeChild(host);
      delete registry[projectKey];
    }
  };

  mount();
})();