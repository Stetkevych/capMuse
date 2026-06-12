// Landing page — top rep by pipeline approvals (this month)
(function () {
  'use strict';

  if (!document.getElementById('dashApprovalsTopCard')) return;

  let EXCLUDED_STAGES = ['dd - default', 'deal declined', 'fraud'];

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

  function nn(v) {
    let n = parseFloat(String(v || '').replace(/[$,]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function parsePipelineDate(raw) {
    let str = String(raw || '').trim();
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      let d = new Date(str + 'T12:00:00');
      return isNaN(d.getTime()) ? null : d;
    }
    let d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function inCurrentMonth(date) {
    if (!date) return false;
    let now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  function isExcludedRep(name) {
    if (!name) return true;
    let n = normStr(name).replace(/\./g, '').trim();
    return n === 'house';
  }

  function isApprovalRow(r) {
    let stage = normStr(r['Stage of Package'] || '');
    let dealType = normStr(r['Deal Type'] || '');
    let amt = nn(r['Amount']);
    let isNewDeal = dealType === 'new' || dealType === 'new deal';
    return isNewDeal && EXCLUDED_STAGES.indexOf(stage) === -1 && amt > 0;
  }

  function repFromRow(r) {
    return (r['Puller'] || r['Packages in Process Owner'] || '').trim();
  }

  function mapPipelineRow(r) {
    if (!r) return null;
    let rep = repFromRow(r);
    if (isExcludedRep(rep)) return null;
    if (!isApprovalRow(r)) return null;

    let date = parsePipelineDate(r['Created Time'] || r['Date Applied'] || '');
    if (!inCurrentMonth(date)) return null;

    return { rep: rep };
  }

  function topApprovalsRep(rows) {
    let by = {};
    rows.forEach(function (row) {
      if (!by[row.rep]) by[row.rep] = { name: row.rep, count: 0 };
      by[row.rep].count += 1;
    });

    let list = Object.values(by).filter(function (r) { return r.count > 0; });
    if (!list.length) return null;

    list.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return String(a.name).localeCompare(String(b.name));
    });

    return list[0];
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

  function render(top) {
    let card = document.getElementById('dashApprovalsTopCard');
    let nameEl = document.getElementById('dashApprovalsName');
    let countEl = document.getElementById('dashApprovalsCount');
    let photoEl = document.getElementById('dashApprovalsPhoto');

    if (!card || !nameEl || !countEl || !photoEl) return;

    card.removeAttribute('data-person-id');
    card.removeAttribute('data-fb-rep-name');
    card.removeAttribute('role');
    card.removeAttribute('tabindex');
    card.removeAttribute('aria-label');

    if (!top) {
      nameEl.textContent = 'No approvals yet';
      countEl.textContent = '0';
      photoEl.innerHTML = '';
      return;
    }

    let label = displayName(top.name);
    let pid = repPersonId(top.name);
    let photo = repPhoto(top.name);

    nameEl.textContent = label;
    countEl.textContent = String(top.count);

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
        '<div class="card-rep-photo" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#6EE7B7,#059669);color:#fff;font-weight:700;font-size:28px">' +
        esc(repInitials(label)) +
        '</div>';
    }
  }

  function loadAndRender() {
    if (!window.CapMuseData || !window.CapMuseData.getPipelineRows) {
      render(null);
      return;
    }

    window.CapMuseData.getPipelineRows()
      .then(function (raw) {
        let rows = (raw || []).map(mapPipelineRow).filter(Boolean);
        render(topApprovalsRep(rows));
      })
      .catch(function (err) {
        console.warn('[Dashboard Approvals]', err);
        render(null);
      });
  }

  function init() {
    loadAndRender();
    window.addEventListener('capmuse:pipeline-updated', loadAndRender);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
