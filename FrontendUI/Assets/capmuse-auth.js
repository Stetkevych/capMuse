/* ═══════════════════════════════════════════════════════════════
   capmuse-auth.js — Client-side session helpers
   Include after profile-stats.js on protected pages.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var USER_KEY = 'capmuse-user';
  var SHARED_PASSWORD = 'Inc5000DataAnalytics!';

  // Demo mode — set false after exec demo to restore full sidebar.
  var DEMO_MODE = true;
  var DEMO_HOME_HREF = 'home.html';
  var DEMO_DISABLED_PAGES = [
    'dashboard.html',
    'lead.html',
    'pipeline.html',
    'lender_recommendation.html',
    'ringcentral.html'
  ];
  var DEMO_HIDDEN_NAV = [
    { href: 'dashboard.html', label: 'Dashboard' },
    { href: 'lead.html', label: 'Leads' },
    { href: 'pipeline.html', label: 'Pipeline' },
    { href: 'lender_recommendation.html', label: 'Lender Match' },
    { href: 'ringcentral.html', label: 'RingCentral' }
  ];

  var demoStylesInjected = false;

  function currentPage() {
    return (window.location.pathname.split('/').pop() || 'home.html').toLowerCase();
  }
  
  
  function injectDemoStyles() {
    if (demoStylesInjected) return;
    demoStylesInjected = true;
    var style = document.createElement('style');
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
    var existing = document.querySelector(
      '.sidebar-nav a[href="' + href + '"] .sub-icon, .sidebar-nav a[href="' + href + '"] .nav-icon,' +
      '.sidebar-nav a[data-page="dashboard"] .sub-icon'
    );
    if (existing) return existing.outerHTML;
    return '<svg class="sub-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10" cy="10" r="7"/></svg>';
  }

  function wireDemoMoreToggle(toggle) {
    toggle.addEventListener('click', function () {
      var sub = document.getElementById('demoMoreSub');
      var open = sub && sub.classList.contains('open');
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
      var el = document.getElementById(id);
      if (el) el.classList.add('nav-demo-legacy');
    });
  }

  function restructureDemoNav() {
    var nav = document.querySelector('.sidebar-nav');
    if (!nav || nav.getAttribute('data-demo-nav') === 'true') return;

    nav.setAttribute('data-demo-nav', 'true');

    nav.querySelectorAll('#overviewToggle, #overviewSub, #crmToggle, #crmSub, #dialerToggle, #dialerSub').forEach(function (el) {
      if (el) el.classList.add('nav-demo-legacy');
    });
    nav.querySelectorAll('a.nav-item[href="home.html"]').forEach(function (el) {
      el.classList.add('nav-demo-legacy');
    });

    var page = currentPage();
    var topHtml =
      '<a class="nav-item' + (page === 'home.html' ? ' active' : '') + '" href="home.html"' +
        (page === 'home.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('home.html') +
        'Home</a>' +
      '<a class="nav-item' + (page === 'analytics.html' ? ' active' : '') + '" href="analytics.html"' +
        (page === 'analytics.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('analytics.html') +
        'Dashboard</a>' +
      '<a class="nav-item' + (page === 'funding_book.html' ? ' active' : '') + '" href="funding_book.html"' +
        (page === 'funding_book.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('funding_book.html') +
        'Funding Book</a>' +
      '<a class="nav-item' + (page === 'convoso.html' ? ' active' : '') + '" href="convoso.html"' +
        (page === 'convoso.html' ? ' aria-current="page"' : '') + '>' +
        linkIconHtml('convoso.html') +
        'Convoso</a>';

    var hiddenItems = DEMO_HIDDEN_NAV.map(function (item) {
      return '<a class="nav-sub-item nav-disabled" href="' + item.href + '" aria-disabled="true" title="Unavailable for demo">' +
        linkIconHtml(item.href) + item.label + '</a>';
    }).join('');

    var moreHtml =
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

    var mount = document.createElement('div');
    mount.innerHTML = topHtml;
    var topNodes = Array.prototype.slice.call(mount.childNodes);
    for (var i = topNodes.length - 1; i >= 0; i--) {
      nav.insertBefore(topNodes[i], nav.firstChild);
    }

    nav.insertAdjacentHTML('beforeend', moreHtml);

    var moreToggle = document.getElementById('demoMoreToggle');
    if (moreToggle) wireDemoMoreToggle(moreToggle);

    nav.querySelectorAll('#demoMoreSub .nav-sub-item').forEach(disableNavTarget);
    applyAnalyticsDemoSidebar();
  }

  function applyDemoNav() {
    if (!DEMO_MODE) return;
    injectDemoStyles();
    restructureDemoNav();
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

  function buildRepUsers() {
    var map = {};
    if (!window.REPS) return map;
    Object.keys(window.REPS).forEach(function (id) {
      var rep = window.REPS[id];
      if (!rep || !rep.name) return;
      var parts = rep.name.split(/\s+/).filter(Boolean);
      var first = parts[0].toLowerCase();
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
    map['thecapmuse123'] = 'anderson';
    return map;
  }

  window.CapMuseAuth = {
    USER_KEY: USER_KEY,
    SHARED_PASSWORD: SHARED_PASSWORD,
    DEMO_MODE: DEMO_MODE,
    DEMO_DISABLED_PAGES: DEMO_DISABLED_PAGES,

    getUserId: function () {
      return localStorage.getItem(USER_KEY);
    },

    getCurrentRep: function () {
      var id = this.getUserId();
      if (!id || !window.REPS) return null;
      return window.REPS[id] || null;
    },

    resolveRepId: function (username) {
      var key = (username || '').trim().toLowerCase();
      var map = buildRepUsers();
      return map[key] || null;
    },

    login: function (username, password) {
      var repId = this.resolveRepId(username);
      if (repId && password === SHARED_PASSWORD) {
        localStorage.setItem(USER_KEY, repId);
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

      var init = initials(rep.name);

      var sidebarAvatar = document.getElementById('sidebarAvatar');
      var sidebarName   = document.getElementById('sidebarName');
      var sidebarRole   = document.getElementById('sidebarRole');
      var avatarBtn     = document.getElementById('avatarBtn');

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

    initPage: function (options) {
      options = options || {};
      if (options.requireLogin && !this.requireLogin()) return;
      guardDemoPage();
      this.populateSidebar();
      this.wireLogoutLinks();
      applyDemoNav();
    }
  };

  window.getCurrentRep = function () {
    return window.CapMuseAuth.getCurrentRep();
  };
})();
