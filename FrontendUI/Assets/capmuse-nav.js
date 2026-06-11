/* ═══════════════════════════════════════════════════════════════

   capmuse-nav.js — Sidebar hide/collapse with localStorage persistence

═══════════════════════════════════════════════════════════════ */

(function () {

  'use strict';



  let STORAGE_KEY = 'capmuse-nav-hidden';

  let MOBILE_MQ = window.matchMedia('(max-width: 768px)');

  let initialized = false;



  let ICON_COLLAPSE =
    '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">' +
      '<path d="M7 4L3 10l4 6M17 4v12" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  let ICON_EXPAND =
    '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">' +
      '<path d="M13 4L17 10l-4 6M3 4v12" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  function markControlsReady() {
    document.documentElement.classList.add('capmuse-nav-controls-ready');
  }



  function isHidden() {

    return document.documentElement.classList.contains('capmuse-nav-hidden');

  }



  function closeMobileSidebar() {

    let sidebar = document.getElementById('sidebar');

    let overlay = document.getElementById('sidebarOverlay');

    if (!sidebar) return;

    sidebar.classList.remove('mobile-open', 'open');

    if (overlay) overlay.classList.remove('open', 'visible');

    document.body.style.overflow = '';

  }



  function setHidden(hidden) {

    document.documentElement.classList.toggle('capmuse-nav-hidden', hidden);

    try {

      localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0');

    } catch (e) { /* ignore */ }

    updateToggleControls();

    if (hidden) closeMobileSidebar();

  }



  function toggle() {

    setHidden(!isHidden());

  }



  function updateToggleControls() {

    let hidden = isHidden();

    let collapseBtn = document.getElementById('navSidebarToggle');

    let expandRail = document.getElementById('navExpandRail');

    if (collapseBtn) {

      collapseBtn.setAttribute('aria-pressed', hidden ? 'true' : 'false');

      collapseBtn.setAttribute('aria-label', hidden ? 'Show navigation sidebar' : 'Hide navigation sidebar');

    }

    if (expandRail) {
      let showRail = hidden && !MOBILE_MQ.matches;
      expandRail.hidden = !showRail;
      expandRail.setAttribute('aria-hidden', showRail ? 'false' : 'true');
      expandRail.setAttribute('aria-label', 'Show navigation sidebar');
    }

    let legacyTopbar = document.getElementById('navToggleBtn');

    if (legacyTopbar) legacyTopbar.remove();

  }



  function scriptBase() {

    let scripts = document.getElementsByTagName('script');

    let i;

    for (i = scripts.length - 1; i >= 0; i--) {

      let src = scripts[i].src || '';

      if (src.indexOf('capmuse-nav.js') > -1) {

        return src.replace(/capmuse-nav\.js.*$/, '');

      }

      if (src.indexOf('capmuse-auth.js') > -1) {

        return src.replace(/capmuse-auth\.js.*$/, '');

      }

    }

    return 'Assets/';

  }



  function loadStylesheet() {
    return new Promise(function (resolve) {
      let existing = document.getElementById('capmuse-nav-css');
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') resolve();
        else existing.addEventListener('load', resolve);
        return;
      }
      let link = document.createElement('link');
      link.id = 'capmuse-nav-css';
      link.rel = 'stylesheet';
      link.href = scriptBase() + 'capmuse-nav.css';
      link.onload = function () {
        link.setAttribute('data-loaded', '1');
        resolve();
      };
      link.onerror = resolve;
      document.head.appendChild(link);
    });
  }



  function createSidebarControls() {

    let sidebar = document.getElementById('sidebar');

    if (!sidebar) return;



    if (!document.getElementById('navSidebarToggle')) {

      let wrap = document.createElement('div');

      wrap.className = 'nav-sidebar-collapse-wrap';



      let collapseBtn = document.createElement('button');

      collapseBtn.type = 'button';

      collapseBtn.id = 'navSidebarToggle';

      collapseBtn.className = 'nav-sidebar-toggle';

      collapseBtn.setAttribute('aria-pressed', 'false');

      collapseBtn.setAttribute('aria-label', 'Hide navigation sidebar');

      collapseBtn.innerHTML =

        '<span class="nav-sidebar-toggle-icon">' + ICON_COLLAPSE + '</span>' +

        '<span class="nav-sidebar-toggle-label">Collapse sidebar</span>';



      collapseBtn.addEventListener('click', function () {

        toggle();

      });



      wrap.appendChild(collapseBtn);



      sidebar.appendChild(wrap);

    }



    if (!document.getElementById('navExpandRail')) {

      let expandRail = document.createElement('button');

      expandRail.type = 'button';

      expandRail.id = 'navExpandRail';

      expandRail.className = 'nav-expand-rail';

      expandRail.hidden = true;

      expandRail.setAttribute('aria-label', 'Show navigation sidebar');

      expandRail.innerHTML = ICON_EXPAND;

      expandRail.addEventListener('click', function () {

        setHidden(false);

      });

      document.body.appendChild(expandRail);

    }



    updateToggleControls();

  }



  function init() {
    if (initialized || !document.getElementById('sidebar')) return;
    initialized = true;
    loadStylesheet().then(function () {
      createSidebarControls();
      markControlsReady();
      MOBILE_MQ.addEventListener('change', updateToggleControls);
      updateToggleControls();
    });
  }



  window.CapMuseNav = {

    STORAGE_KEY: STORAGE_KEY,

    init: init,

    toggle: toggle,

    setHidden: setHidden,

    isHidden: isHidden

  };

})();


