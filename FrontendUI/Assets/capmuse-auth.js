/* ═══════════════════════════════════════════════════════════════
   capmuse-auth.js — Client-side session helpers
   Include after profile-stats.js on protected pages.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var USER_KEY = 'capmuse-user';
  var SHARED_PASSWORD = 'Inc5000DataAnalytics!';

  function initials(name) {
    return name.split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  }

  function buildRepUsers() {
    var map = {};
    if (!window.REPS) return map;
    Object.keys(window.REPS).forEach(function (id) {
      var rep = window.REPS[id];
      if (!rep || !rep.name) return;
      var first = rep.name.split(' ')[0].toLowerCase();
      map[first] = id;
      map[id] = id;
    });
    map.jimmy = 'gimmy';
    map['thecapmuse123'] = 'anderson';
    return map;
  }

  window.CapMuseAuth = {
    USER_KEY: USER_KEY,
    SHARED_PASSWORD: SHARED_PASSWORD,

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

    initPage: function (options) {
      options = options || {};
      if (options.requireLogin && !this.requireLogin()) return;
      this.populateSidebar();
      this.wireLogoutLinks();
    }
  };

  window.getCurrentRep = function () {
    return window.CapMuseAuth.getCurrentRep();
  };
})();
