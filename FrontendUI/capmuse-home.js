// Home rep dashboard — live funding stats from funding_book_live.json
(function () {
  if (!document.body.classList.contains('home-page')) return;

  function init() {
    if (!window.CapMuseAuth || !window.CapMuseAuth.getUserId()) return;
    if (!window.CapMuseRepStats || !window.CapMuseData) return;

    let userId = window.CapMuseAuth.getUserId();
    if (window.ensureRepProfile) userId = window.ensureRepProfile(userId);

    function load(uid) {
      return window.CapMuseRepStats.applyForRep(uid).then(function (live) {
        if (live) window.CapMuseRepStats.refreshOpenProfilePanels(uid, live);
        return live;
      });
    }

    load(userId);

    window.addEventListener('capmuse:deals-updated', function () {
      let uid = window.CapMuseAuth.getUserId();
      if (window.ensureRepProfile) uid = window.ensureRepProfile(uid);
      load(uid);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
