// Landing page — top rep by interested Convoso calls (this week)
(function () {
  'use strict';

  if (!document.getElementById('dashConvosoTopCard')) return;

  let CONVOSO_API = 'https://capmuse.onrender.com';

  function normStr(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim()
      .toLowerCase();
  }

  function normRepName(s) {
    return normStr(s).replace(/[''`]/g, '');
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function thisWeekRange() {
    let now = new Date();
    let d = now.getDate();
    let dow = now.getDay();
    let weekStart = new Date(now);
    weekStart.setDate(d - (dow === 0 ? 6 : dow - 1));
    return {
      start: weekStart.getFullYear() + '-' + pad2(weekStart.getMonth() + 1) + '-' + pad2(weekStart.getDate()),
      end: now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate())
    };
  }

  function repIdMatchesName(id, name) {
    if (!id || !name || !window.REPS || !window.REPS[id]) return false;
    let rep = window.REPS[id];
    let n = normRepName(name);
    let book = normRepName(rep.bookName || '');
    let shortName = normRepName(rep.name || '');

    if (book && n === book) return true;
    if (shortName && n === shortName) return true;
    if (book && book.length >= 3 && (n.indexOf(book) > -1 || book.indexOf(n) > -1)) return true;

    let parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      let labels = [rep.bookName, rep.name].filter(Boolean);
      let i;
      for (i = 0; i < labels.length; i++) {
        let lp = normRepName(labels[i]).split(/\s+/).filter(Boolean);
        if (lp.length >= 2 && lp[0] === parts[0] && lp[lp.length - 1] === parts[parts.length - 1]) return true;
      }
    }

    if (parts.length === 1 && parts[0].length > 2) {
      if (shortName === parts[0]) return true;
      if (book && book.split(/\s+/)[0] === parts[0]) return true;
    }

    return false;
  }

  function repPersonId(name) {
    if (!name || !window.resolveRepPersonId) return null;
    let id = window.resolveRepPersonId(name);
    if (!id) return null;
    return repIdMatchesName(id, name) ? id : null;
  }

  function displayName(name) {
    let id = repPersonId(name);
    if (id && window.REPS && window.REPS[id]) {
      return window.REPS[id].bookName || window.REPS[id].name || name;
    }
    return name;
  }

  function repPhoto(name) {
    let id = repPersonId(name);
    if (id && window.REPS && window.REPS[id] && window.REPS[id].photo) {
      return window.REPS[id].photo;
    }
    return '';
  }

  function repInitials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).map(function (w) {
      return w[0];
    }).slice(0, 2).join('').toUpperCase();
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function topInterestedRep(users) {
    let rows = (users || []).map(function (u) {
      return {
        name: (u.user || '').trim(),
        inst: u.inst || 0
      };
    }).filter(function (r) {
      return r.name && r.inst > 0;
    });

    if (!rows.length) return null;

    rows.sort(function (a, b) {
      if (b.inst !== a.inst) return b.inst - a.inst;
      return String(a.name).localeCompare(String(b.name));
    });

    return rows[0];
  }

  function fetchConvosoSummary(range) {
    return fetch(CONVOSO_API + '/convoso/all-users-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_date: range.start,
        end_date: range.end
      })
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function render(top) {
    let card = document.getElementById('dashConvosoTopCard');
    let nameEl = document.getElementById('dashConvosoName');
    let countEl = document.getElementById('dashConvosoCount');
    let photoEl = document.getElementById('dashConvosoPhoto');

    if (!card || !nameEl || !countEl || !photoEl) return;

    card.removeAttribute('data-person-id');
    card.removeAttribute('data-fb-rep-name');
    card.removeAttribute('role');
    card.removeAttribute('tabindex');
    card.removeAttribute('aria-label');

    if (!top) {
      nameEl.textContent = 'No data yet';
      countEl.textContent = '—';
      photoEl.innerHTML = '';
      return;
    }

    let label = displayName(top.name);
    let pid = repPersonId(top.name);
    let photo = repPhoto(top.name);

    nameEl.textContent = label;
    countEl.textContent = String(top.inst);

    if (pid) {
      card.setAttribute('data-person-id', pid);
      card.setAttribute('data-fb-rep-name', top.name);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'View ' + label + ' stats');
    }

    if (photo) {
      photoEl.innerHTML = '<img class="card-rep-photo" src="' + esc(photo) + '" alt="" onerror="this.style.display=\'none\'">';
    } else {
      photoEl.innerHTML =
        '<div class="card-rep-photo" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#C4B5FD,#7C3AED);color:#fff;font-weight:700;font-size:18px">' +
        esc(repInitials(label)) +
        '</div>';
    }
  }

  function loadAndRender() {
    let range = thisWeekRange();
    fetchConvosoSummary(range)
      .then(function (data) {
        render(topInterestedRep(data.users || []));
      })
      .catch(function (err) {
        console.warn('[Dashboard Convoso]', err.message);
        render(null);
        let nameEl = document.getElementById('dashConvosoName');
        if (nameEl) nameEl.textContent = 'Unavailable';
      });
  }

  function init() {
    loadAndRender();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
