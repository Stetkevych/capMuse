/* ═══════════════════════════════════════════════════════════════
   capmuse-auth.js — Client-side session helpers
   Include after profile-stats.js on protected pages.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  let USER_KEY = 'capmuse-user';
  let NAV_HIDDEN_KEY = 'capmuse-nav-hidden';
  let SHARED_PASSWORD = 'Inc5000DataAnalytics!';

  // Demo mode — set false after exec demo to restore full sidebar.
  let DEMO_MODE = true;
  let DEMO_HOME_HREF = 'home.html';
  let DEMO_DISABLED_PAGES = [
    'lead.html',
    'lender_recommendation.html'
  ];
  let DEMO_HIDDEN_NAV = [
    { href: 'lead.html', label: 'Leads' },
    { href: 'lender_recommendation.html', label: 'Lender Match' }
  ];

  let demoStylesInjected = false;

  function injectNavCriticalGuard() {
    try {
      if (localStorage.getItem(NAV_HIDDEN_KEY) === '1') {
        document.documentElement.classList.add('capmuse-nav-hidden');
      }
    } catch (e) { /* ignore */ }
    if (document.getElementById('capmuse-nav-critical')) return;
    let style = document.createElement('style');
    style.id = 'capmuse-nav-critical';
    style.textContent =
      '@media(min-width:769px){' +
      'html.capmuse-nav-hidden .sidebar-column{transform:translateX(calc(-1*(var(--sidebar-w,215px) + var(--sidebar-gap,16px) + 16px)));pointer-events:none;visibility:hidden}' +
      'html.capmuse-nav-hidden .main-wrapper{margin-left:0!important}' +
      '}' +
      '.nav-sidebar-collapse-wrap{opacity:0;visibility:hidden;pointer-events:none}' +
      'html.capmuse-nav-controls-ready .nav-sidebar-collapse-wrap{opacity:1;visibility:visible;pointer-events:auto}' +
      '.nav-sidebar-toggle{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:1px solid transparent;border-radius:10px;background:transparent;font:inherit;font-size:12px;font-weight:600;cursor:pointer;color:inherit;box-sizing:border-box}' +
      '.nav-sidebar-toggle-icon{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:16px;height:16px}' +
      '.nav-sidebar-toggle-icon svg,.nav-expand-rail svg{width:16px;height:16px;display:block;max-width:16px;max-height:16px}' +
      '.nav-expand-rail{display:none!important}' +
      'html.capmuse-nav-hidden .nav-expand-rail{display:flex!important;position:fixed;left:0;bottom:24px;z-index:350;width:22px;height:52px;padding:0;align-items:center;justify-content:center;border:1px solid var(--sidebar-border,#1A2435);border-left:none;border-radius:0 12px 12px 0;background:var(--sidebar-bg,#111720);cursor:pointer;box-sizing:border-box}' +
      '.cm-notif-panel{position:absolute;top:calc(100% + 10px);right:0;z-index:1200;opacity:0!important;visibility:hidden!important;pointer-events:none!important}' +
      '.cm-notif-panel.open{opacity:1!important;visibility:visible!important;pointer-events:auto!important}' +
      '.cm-present-overlay{opacity:0!important;visibility:hidden!important;pointer-events:none!important}' +
      '.cm-present-overlay.open{opacity:1!important;visibility:visible!important;pointer-events:auto!important}' +
      '.cm-present-overlay[hidden]{display:none!important}';
    (document.head || document.documentElement).appendChild(style);
  }

  function injectDemoCriticalGuard() {
    if (!DEMO_MODE) return;
    document.documentElement.classList.add('capmuse-demo');
    if (document.getElementById('capmuse-demo-nav-critical')) return;
    let style = document.createElement('style');
    style.id = 'capmuse-demo-nav-critical';
    style.textContent =
      'html.capmuse-demo #overviewToggle,' +
      'html.capmuse-demo #overviewSub,' +
      'html.capmuse-demo #crmToggle,' +
      'html.capmuse-demo #crmSub,' +
      'html.capmuse-demo #dialerToggle,' +
      'html.capmuse-demo #dialerSub,' +
      'html.capmuse-demo #demoMoreSub:not(.open){max-height:0!important;overflow:hidden!important}';
    (document.head || document.documentElement).appendChild(style);
  }

  function currentPage() {
    return (window.location.pathname.split('/').pop() || 'home.html').toLowerCase();
  }
  
  
  function injectDemoStyles() {
    injectDemoCriticalGuard();
    if (demoStylesInjected) return;
    demoStylesInjected = true;
    let style = document.createElement('style');
    style.id = 'capmuse-demo-nav-styles';
    style.textContent =
      '.nav-disabled,' +
      '.nav-section-toggle.nav-disabled {' +
      '  opacity: 0.42 !important;' +
      '  pointer-events: none !important;' +
      '  cursor: not-allowed !important;' +
      '}' +
      '.nav-demo-legacy { display: none !important; }' +
      '.nav-demo-more-wrap { margin-top: auto; padding-top: 8px; border-top: 1px solid var(--border, rgba(255,255,255,0.08)); }' +
      '.nav-demo-more-wrap .nav-sub-item { font-size: 12px; }';
    document.head.appendChild(style);
  }

  function disableNavTarget(el) {
    if (!el || el.classList.contains('nav-disabled')) return;
    el.classList.add('nav-disabled');
    el.setAttribute('aria-disabled', 'true');
    el.setAttribute('title', 'Unavailable for demo');
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  function linkIconHtml(href) {
    let existing = document.querySelector(
      '.sidebar-nav a[href="' + href + '"] .sub-icon, .sidebar-nav a[href="' + href + '"] .nav-icon,' +
      '.sidebar-nav a[data-page="dashboard"] .sub-icon'
    );
    if (existing) return existing.outerHTML;
    return '<svg class="sub-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10" cy="10" r="7"/></svg>';
  }

  function wireDemoMoreToggle(toggle) {
    toggle.addEventListener('click', function () {
      let sub = document.getElementById('demoMoreSub');
      let open = sub && sub.classList.contains('open');
      if (!open && sub) {
        sub.classList.add('open');
        toggle.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
      } else if (sub) {
        sub.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function applyAnalyticsDemoSidebar() {
    if (currentPage() !== 'analytics.html') return;

    document.querySelectorAll('a[data-page="funding"], a[data-page="alerts"]').forEach(function (el) {
      el.classList.add('nav-demo-legacy');
    });
    ['trendingToggle', 'trendingSub', 'dataToggle', 'dataSub'].forEach(function (id) {
      let el = document.getElementById(id);
      if (el) el.classList.add('nav-demo-legacy');
    });
  }

  function restructureDemoNav() {
    let nav = document.querySelector('.sidebar-nav');
    if (!nav || nav.getAttribute('data-demo-nav') === 'true') return;

    nav.setAttribute('data-demo-nav', 'true');

    nav.querySelectorAll('#overviewToggle, #overviewSub, #crmToggle, #crmSub, #dialerToggle, #dialerSub').forEach(function (el) {
      if (el) el.classList.add('nav-demo-legacy');
    });
    nav.querySelectorAll('a.nav-item[href="home.html"]').forEach(function (el) {
      el.classList.add('nav-demo-legacy');
    });

    let page = currentPage();
    let topHtml =
      '<a class="nav-item' + (page === 'home.html' ? ' active' : '') + '" href="home.html"' +
        (page === 'home.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('home.html') +
        'Home</a>' +
      '<a class="nav-item' + (page === 'dashboard.html' ? ' active' : '') + '" href="dashboard.html"' +
        (page === 'dashboard.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('dashboard.html') +
        'Landing Page</a>' +
      '<a class="nav-item' + (page === 'analytics.html' ? ' active' : '') + '" href="analytics.html"' +
        (page === 'analytics.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('analytics.html') +
        'Dashboard</a>' +
      '<a class="nav-item' + (page === 'funding_book.html' ? ' active' : '') + '" href="funding_book.html"' +
        (page === 'funding_book.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('funding_book.html') +
        'Funding Book</a>' +
      '<a class="nav-item' + (page === 'pipeline.html' ? ' active' : '') + '" href="pipeline.html"' +
        (page === 'pipeline.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('pipeline.html') +
        'Pipeline</a>' +
      '<a class="nav-item' + (page === 'convoso.html' ? ' active' : '') + '" href="convoso.html"' +
        (page === 'convoso.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('convoso.html') +
        'Convoso</a>' +
      '<a class="nav-item' + (page === 'ringcentral.html' ? ' active' : '') + '" href="ringcentral.html"' +
        (page === 'ringcentral.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('ringcentral.html') +
        'RingCentral</a>' +
      '<a class="nav-item' + (page === 'coaching.html' ? ' active' : '') + '" href="coaching.html"' +
        (page === 'coaching.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('coaching.html') +
        'Coaching</a>' +
      '<a class="nav-item' + (page === 'call-scoring.html' ? ' active' : '') + '" href="call-scoring.html"' +
        (page === 'call-scoring.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('call-scoring.html') +
        'Call Scoring</a>';

    let hiddenItems = DEMO_HIDDEN_NAV.map(function (item) {
      return '<a class="nav-sub-item nav-disabled" href="' + item.href + '" aria-disabled="true" title="Unavailable for demo">' +
        linkIconHtml(item.href) + item.label + '</a>';
    }).join('');

    let moreHtml =
      '<div class="nav-demo-more-wrap">' +
        '<div class="nav-section-toggle" id="demoMoreToggle" role="button" tabindex="0" aria-expanded="false">' +
          '<div class="toggle-left">' +
            '<svg class="toggle-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">' +
              '<path d="M4 7h12M4 12h12M4 17h8" stroke-linecap="round"/>' +
            '</svg>More' +
          '</div>' +
          '<svg class="toggle-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
            '<path d="M5 8l5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>' +
        '</div>' +
        '<div class="nav-sub" id="demoMoreSub">' + hiddenItems + '</div>' +
      '</div>';

    let mount = document.createElement('div');
    mount.innerHTML = topHtml;
    let topNodes = Array.prototype.slice.call(mount.childNodes);
    for (let i = topNodes.length - 1; i >= 0; i--) {
      nav.insertBefore(topNodes[i], nav.firstChild);
    }

    nav.insertAdjacentHTML('beforeend', moreHtml);

    let moreToggle = document.getElementById('demoMoreToggle');
    if (moreToggle) wireDemoMoreToggle(moreToggle);

    nav.querySelectorAll('#demoMoreSub .nav-sub-item').forEach(disableNavTarget);
    applyAnalyticsDemoSidebar();
  }

  function applyDemoNav() {
    if (!DEMO_MODE) return;
    injectDemoStyles();
    restructureDemoNav();
  }

  function authScriptBase() {
    let scripts = document.getElementsByTagName('script');
    let i;
    for (i = scripts.length - 1; i >= 0; i--) {
      let src = scripts[i].src || '';
      if (src.indexOf('capmuse-auth.js') > -1) {
        return src.replace(/capmuse-auth\.js.*$/, '');
      }
    }
    return 'Assets/';
  }

  function loadAuthScriptOnce(url) {
    return new Promise(function (resolve) {
      let existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') resolve();
        else existing.addEventListener('load', function () { resolve(); });
        return;
      }
      let el = document.createElement('script');
      el.src = url;
      el.onload = function () {
        el.setAttribute('data-loaded', '1');
        resolve();
      };
      el.onerror = function () { resolve(); };
      document.body.appendChild(el);
    });
  }

  function initAchievements() {
    if (!localStorage.getItem(USER_KEY)) return;
    let base = authScriptBase();
    loadAuthScriptOnce(base + 'capmuse-achievements.js').then(function () {
      return loadAuthScriptOnce(base + 'capmuse-notifications.js');
    }).then(function () {
      if (window.CapMuseNotifications) window.CapMuseNotifications.init();
    });
  }

  function initNav() {
    if (!document.getElementById('sidebar')) return;
    let base = authScriptBase();
    loadAuthScriptOnce(base + 'capmuse-nav.js').then(function () {
      if (window.CapMuseNav) window.CapMuseNav.init();
    });
  }

  function guardDemoPage() {
    if (!DEMO_MODE) return;
    if (DEMO_DISABLED_PAGES.indexOf(currentPage()) !== -1) {
      window.location.replace(DEMO_HOME_HREF);
    }
  }

  function initials(name) {
    return name.split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  }

  let REP_ID_ALIASES = {
    jimmy: 'gimmy',
    matt: 'matthew',
    schweri: 'mschweri',
    scheweri: 'mschweri'
  };
  let SESSION_PRESENT_PREFIX = 'capmuse-ach-present-session:';
  let SESSION_SCAN_PREFIX = 'capmuse-ach-scan-session:';

  function clearSessionPresentKeys(repId) {
    if (!repId) return;
    let keys = [repId];
    Object.keys(REP_ID_ALIASES).forEach(function (alias) {
      if (REP_ID_ALIASES[alias] === repId) keys.push(alias);
    });
    keys.forEach(function (key) {
      try {
        sessionStorage.removeItem(SESSION_PRESENT_PREFIX + key);
        sessionStorage.removeItem(SESSION_SCAN_PREFIX + key);
      } catch (e) { /* ignore */ }
    });
  }

  function canonicalRepId(repId) {
    if (!repId) return repId;
    if (window.ensureRepProfile) return window.ensureRepProfile(repId);
    let key = String(repId).toLowerCase();
    return REP_ID_ALIASES[key] || key;
  }

  function buildRepUsers() {
    let map = {};
    if (!window.REPS) return map;
    Object.keys(window.REPS).forEach(function (id) {
      let rep = window.REPS[id];
      if (!rep || !rep.name) return;
      let parts = rep.name.split(/\s+/).filter(Boolean);
      let first = parts[0].toLowerCase();
      map[first] = id;
      map[id] = id;
      if (rep.bookName) {
        map[rep.bookName.toLowerCase()] = id;
        map[rep.bookName.toLowerCase().replace(/\s+/g, '')] = id;
      }
      if (parts.length > 1) {
        map[parts.join('').toLowerCase()] = id;
      }
    });
    map.jimmy = 'gimmy';
    map.matt = 'matthew';
    map.matthew = 'matthew';
    map.mschweri = 'mschweri';
    map.schweri = 'mschweri';
    map.scheweri = 'mschweri';
    map.matthewschweri = 'mschweri';
    map.matthewscheweri = 'mschweri';
    map['thecapmuse123'] = 'anderson';
    return map;
  }

  window.CapMuseAuth = {
    USER_KEY: USER_KEY,
    SHARED_PASSWORD: SHARED_PASSWORD,
    DEMO_MODE: DEMO_MODE,
    DEMO_DISABLED_PAGES: DEMO_DISABLED_PAGES,

    getUserId: function () {
      let id = localStorage.getItem(USER_KEY);
      if (!id) return null;
      return canonicalRepId(id);
    },

    getCurrentRep: function () {
      let id = this.getUserId();
      if (!id || !window.REPS) return null;
      return window.REPS[id] || null;
    },

    resolveRepId: function (username) {
      let key = (username || '').trim().toLowerCase();
      let map = buildRepUsers();
      return map[key] || null;
    },

    login: function (username, password) {
      let repId = this.resolveRepId(username);
      if (repId && password === SHARED_PASSWORD) {
        repId = canonicalRepId(repId);
        localStorage.setItem(USER_KEY, repId);
        clearSessionPresentKeys(repId);
        return repId;
      }
      return null;
    },

    requireLogin: function () {
      if (!this.getUserId()) {
        window.location.href = 'login.html';
        return false;
      }
      return true;
    },

    logout: function (e) {
      if (e) e.preventDefault();
      localStorage.removeItem(USER_KEY);
      window.location.href = 'login.html';
    },

    populateSidebar: function (rep) {
      if (!rep) rep = this.getCurrentRep();
      if (!rep) return;

      let init = initials(rep.name);

      let sidebarAvatar = document.getElementById('sidebarAvatar');
      let sidebarName   = document.getElementById('sidebarName');
      let sidebarRole   = document.getElementById('sidebarRole');
      let avatarBtn     = document.getElementById('avatarBtn');

      if (sidebarAvatar) sidebarAvatar.textContent = init;
      if (sidebarName)   sidebarName.textContent   = rep.name;
      if (sidebarRole)   sidebarRole.textContent   = rep.role;
      if (avatarBtn)     avatarBtn.textContent     = init;

      document.querySelectorAll('.sidebar-user .user-avatar:not(#sidebarAvatar)').forEach(function (el) {
        el.textContent = init;
      });
      document.querySelectorAll('.sidebar-user .user-name:not(#sidebarName)').forEach(function (el) {
        el.textContent = rep.name;
      });
      document.querySelectorAll('.sidebar-user .user-role:not(#sidebarRole)').forEach(function (el) {
        el.textContent = rep.role;
      });
    },

    wireLogoutLinks: function () {
      document.querySelectorAll('a[href="login.html"].avatar-menu-item, a[href="login.html"].danger').forEach(function (link) {
        if (link.textContent.trim().toLowerCase().indexOf('log out') !== -1) {
          link.addEventListener('click', function (e) {
            e.preventDefault();
            window.CapMuseAuth.logout();
          });
        }
      });
    },

    applyDemoNav: applyDemoNav,
    guardDemoPage: guardDemoPage,
    initAchievements: initAchievements,
    initNav: initNav,

    initPage: function (options) {
      options = options || {};
      if (options.requireLogin && !this.requireLogin()) return;
      guardDemoPage();
      this.populateSidebar();
      this.wireLogoutLinks();
      applyDemoNav();
      initAchievements();
      initNav();
    }
  };

  window.getCurrentRep = function () {
    return window.CapMuseAuth.getCurrentRep();
  };

  function injectLayoutStyles() {
    if (document.getElementById('capmuse-layout-css')) return;
    let link = document.createElement('link');
    link.id = 'capmuse-layout-css';
    link.rel = 'stylesheet';
    link.href = authScriptBase() + 'capmuse-layout.css';
    document.head.appendChild(link);
  }

  injectNavCriticalGuard();
  injectDemoCriticalGuard();

  function restructureSidebarColumn() {
    let sidebar = document.getElementById('sidebar');
    if (!sidebar || document.getElementById('sidebarColumn')) return;
    let logo = sidebar.querySelector('.sidebar-logo');
    if (!logo) return;
    let column = document.createElement('div');
    column.className = 'sidebar-column';
    column.id = 'sidebarColumn';
    sidebar.parentNode.insertBefore(column, sidebar);
    logo.classList.add('sidebar-brand');
    column.appendChild(logo);
    column.appendChild(sidebar);
  }

  function bootPageChrome() {
    injectLayoutStyles();
    restructureSidebarColumn();
    initNav();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPageChrome);
  } else {
    bootPageChrome();
  }

  if (DEMO_MODE) {
    function runDemoNavEarly() {
      applyDemoNav();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runDemoNavEarly);
    } else {
      runDemoNavEarly();
    }
  }
})();
