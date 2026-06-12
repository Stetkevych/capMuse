// Landing page — Monthly Rep Leaderboard from Funding Book (current month)
(function () {
  'use strict';

  if (!document.getElementById('dashMonthlyLeaderCard')) return;

  let CSV_LOOKUP = {};
  let CSV_URLS = [
    'https://capmuse-data-882611632216.s3.amazonaws.com/funding_book.csv',
    '../funding_book.csv',
    'funding_book.csv'
  ];

  let MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  let PACKAGE_OWNER_RECORD_FIXES = {
    '3793076000601237337': 'House .',
    '3793076000605384128': 'House .',
    '3793076000606189343': 'House .',
    '3793076000624144182': 'House .',
    '3793076000649034499': 'House .'
  };

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

  function isHouseName(name) {
    return normStr(name).replace(/\./g, '').trim() === 'house';
  }

  function nn(v) {
    let n = parseFloat(String(v || '').replace(/[$,]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function parseDate(raw) {
    if (!raw) return null;
    let d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  function fundingBookOwnerFromRecord(r) {
    return (r.funding_book_owner || r.Funding_Book_Owner || r['Funding_Book_Owner.name'] || r.Owner || r['Owner.name'] || '').trim();
  }

  function packageOwnerFromRecord(r) {
    let recordId = String(r.record_id || r.id || '');
    if (PACKAGE_OWNER_RECORD_FIXES[recordId]) return PACKAGE_OWNER_RECORD_FIXES[recordId];

    let fromLookup = (r['Package_Owner.name'] || (r.Package_Owner && r.Package_Owner.name) || r.package_owner_name || '').trim();
    if (fromLookup) return fromLookup;

    let flat = (r.package_owner || '').trim();
    let puller = (r.puller || r.Puller || r['Puller.name'] || '').trim();
    let fbOwner = fundingBookOwnerFromRecord(r);

    if (flat && puller && normStr(flat) === normStr(puller) && fbOwner && isHouseName(fbOwner)) {
      return fbOwner;
    }
    return flat;
  }

  function csvHeaderIndex(headers, names) {
    let i;
    for (i = 0; i < names.length; i++) {
      let idx = headers.indexOf(names[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function csvEnrich(r) {
    let id = String(r.record_id || r.id || '');
    let row = CSV_LOOKUP[id];
    if (!row) return { packageOwner: '' };
    return { packageOwner: (row.packageOwner || '').trim() };
  }

  function parseCsvLine(line) {
    let out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      let ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function fetchCsvText(urlIndex) {
    if (urlIndex >= CSV_URLS.length) return Promise.resolve('');
    return fetch(CSV_URLS[urlIndex])
      .then(function (res) {
        if (res.ok) return res.text();
        return fetchCsvText(urlIndex + 1);
      })
      .catch(function () { return fetchCsvText(urlIndex + 1); });
  }

  function parseCsvLookup(text) {
    if (!text) return;
    let lines = text.split(/\r?\n/);
    if (!lines.length) return;
    let headers = parseCsvLine(lines[0]);
    let idIdx = csvHeaderIndex(headers, ['Record Id', 'record_id', 'id']);
    let poIdx = csvHeaderIndex(headers, ['Package Owner', 'Package_Owner.name']);
    if (idIdx < 0) return;
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      let cols = parseCsvLine(lines[i]);
      let id = (cols[idIdx] || '').trim();
      if (!id) continue;
      CSV_LOOKUP[id] = {
        packageOwner: poIdx >= 0 ? (cols[poIdx] || '').trim() : ''
      };
    }
  }

  function loadCsvLookup() {
    return fetchCsvText(0).then(function (text) {
      parseCsvLookup(text);
    });
  }

  function mapDeal(r) {
    if (!r || (!r.company && !r.Deal_Name)) return null;
    let extra = csvEnrich(r);
    return {
      packageOwner: extra.packageOwner || packageOwnerFromRecord(r),
      funding: nn(r.funding || r.Funded_Amount),
      date: parseDate(r.date_funded || r.Date_Funded || '')
    };
  }

  function monthBounds() {
    let now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    };
  }

  function inCurrentMonth(d) {
    if (!d.date) return false;
    let bounds = monthBounds();
    return d.date >= bounds.start && d.date <= bounds.end;
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

  function isExcludedName(name) {
    if (!name) return true;
    if (isHouseName(name)) return true;
    let n = normStr(name);
    if (n.indexOf('scheweri') >= 0 || (n.indexOf('schweri') >= 0 && n.indexOf('matthew') >= 0)) return true;
    if (n === 'text' || n.indexOf('capital infusion') >= 0 || n.indexOf('marketing') >= 0) return true;
    return false;
  }

  function aggregateByRep(deals) {
    let by = {};
    deals.forEach(function (d) {
      let name = d.packageOwner;
      if (!name || isExcludedName(name)) return;
      if (!by[name]) by[name] = { name: name, volume: 0 };
      by[name].volume += d.funding;
    });
    return Object.values(by).filter(function (r) { return r.volume > 0; });
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

  function fmtMoney(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
    if (n >= 1000) return '$' + Math.round(n).toLocaleString('en-US');
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function monthLabel() {
    return MONTH_NAMES[new Date().getMonth()];
  }

  function rowRankClass(rank) {
    if (rank === 2) return ' r-silver';
    if (rank === 3) return ' r-bronze';
    return '';
  }

  function rowPosHtml(rank) {
    if (rank === 2) return '<span class="rep-pos medal" aria-hidden="true">🥈</span>';
    if (rank === 3) return '<span class="rep-pos medal" aria-hidden="true">🥉</span>';
    return '<span class="rep-pos num">' + rank + '</span>';
  }

  function rowClickAttrs(pid, bookName) {
    if (!pid || !bookName) return '';
    return (
      ' data-person-id="' + esc(pid) + '"' +
      ' data-fb-rep-name="' + esc(bookName) + '"' +
      ' role="button" tabindex="0"' +
      ' aria-label="View ' + esc(displayName(bookName)) + ' stats"'
    );
  }

  function renderHero(top) {
    let hero = document.getElementById('dashMonthlyLeaderHero');
    if (!hero) return;

    if (!top) {
      hero.removeAttribute('data-person-id');
      hero.removeAttribute('data-fb-rep-name');
      hero.removeAttribute('role');
      hero.removeAttribute('tabindex');
      hero.removeAttribute('aria-label');
      hero.innerHTML =
        '<div class="rep-crown" aria-hidden="true">🥇</div>' +
        '<div class="rep-photo-wrap" id="dashMonthlyLeaderPhoto"></div>' +
        '<div class="rep-hero-name">—</div>' +
        '<div class="rep-hero-label">Most Funded · ' + esc(monthLabel()) + '</div>' +
        '<div class="rep-hero-amount">$0</div>';
      return;
    }

    let pid = repPersonId(top.name);
    let label = displayName(top.name);
    let photo = repPhoto(top.name);

    hero.innerHTML = '';
    if (pid) {
      hero.setAttribute('data-person-id', pid);
      hero.setAttribute('data-fb-rep-name', top.name);
      hero.setAttribute('role', 'button');
      hero.setAttribute('tabindex', '0');
      hero.setAttribute('aria-label', 'View ' + label + ' stats');
    } else {
      hero.removeAttribute('data-person-id');
      hero.removeAttribute('data-fb-rep-name');
      hero.removeAttribute('role');
      hero.removeAttribute('tabindex');
      hero.removeAttribute('aria-label');
    }

    let crown = document.createElement('div');
    crown.className = 'rep-crown';
    crown.setAttribute('aria-hidden', 'true');
    crown.textContent = '🥇';
    hero.appendChild(crown);

    let photoWrap = document.createElement('div');
    photoWrap.className = 'rep-photo-wrap';
    photoWrap.id = 'dashMonthlyLeaderPhoto';
    photoWrap.innerHTML = photo
      ? '<img src="' + esc(photo) + '" alt="" class="rep-photo" onerror="this.style.display=\'none\'">'
      : '<div class="rep-photo" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;font-weight:700;font-size:24px">' + esc(repInitials(label)) + '</div>';
    hero.appendChild(photoWrap);

    let nameEl = document.createElement('div');
    nameEl.className = 'rep-hero-name';
    nameEl.textContent = label;
    hero.appendChild(nameEl);

    let labelEl = document.createElement('div');
    labelEl.className = 'rep-hero-label';
    labelEl.textContent = 'Most Funded · ' + monthLabel();
    hero.appendChild(labelEl);

    let amtEl = document.createElement('div');
    amtEl.className = 'rep-hero-amount';
    amtEl.textContent = fmtMoney(top.volume);
    hero.appendChild(amtEl);
  }

  function gridPairOrder(rows) {
    let mid = Math.ceil(rows.length / 2);
    let left = rows.slice(0, mid);
    let right = rows.slice(mid);
    let out = [];
    let i;
    for (i = 0; i < left.length; i++) {
      out.push(left[i]);
      if (right[i]) out.push(right[i]);
    }
    return out;
  }

  function renderGrid(rows) {
    let grid = document.getElementById('dashMonthlyLeaderGrid');
    if (!grid) return;

    if (!rows.length) {
      grid.innerHTML = '<div class="rep-row rep-row--empty"><span class="rep-name">No funded deals this month yet.</span></div>';
      return;
    }

    grid.innerHTML = gridPairOrder(rows).map(function (r) {
      let pid = repPersonId(r.name);
      let label = displayName(r.name);
      return (
        '<div class="rep-row' + rowRankClass(r.rank) + '"' + rowClickAttrs(pid, r.name) + '>' +
          rowPosHtml(r.rank) +
          '<span class="rep-name">' + esc(label) + '</span>' +
          '<span class="rep-amt">' + esc(fmtMoney(r.volume)) + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function renderLeaderboard(rows) {
    let head = document.getElementById('dashMonthlyLeaderHead');
    if (head) head.textContent = 'Monthly Rep Leaderboard · ' + monthLabel();

    if (!rows.length) {
      renderHero(null);
      renderGrid([]);
      return;
    }

    let ranked = rows.slice().sort(function (a, b) {
      if (b.volume !== a.volume) return b.volume - a.volume;
      return String(a.name).localeCompare(String(b.name));
    });

    ranked.forEach(function (r, i) {
      r.rank = i + 1;
    });

    renderHero(ranked[0]);
    renderGrid(ranked.slice(1, 9));
  }

  function loadAndRender() {
    if (!window.CapMuseData || !window.CapMuseData.getRawDeals) return;
    loadCsvLookup().then(function () {
      return window.CapMuseData.getRawDeals();
    }).then(function (raw) {
      let deals = (raw || []).map(mapDeal).filter(Boolean).filter(inCurrentMonth);
      renderLeaderboard(aggregateByRep(deals));
    });
  }

  function init() {
    loadAndRender();
    window.addEventListener('capmuse:deals-updated', loadAndRender);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
