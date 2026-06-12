// Landing page — yesterday's top funder spotlight
(function () {
  'use strict';

  if (!document.getElementById('dashYesterdayTopCard')) return;

  let CSV_LOOKUP = {};
  let CSV_URLS = [
    'https://capmuse-data-882611632216.s3.amazonaws.com/funding_book.csv',
    '../funding_book.csv',
    'funding_book.csv'
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
    let str = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      let d = new Date(str + 'T12:00:00');
      return isNaN(d.getTime()) ? null : d;
    }
    let d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function fundedDateKey(raw, parsedDate) {
    let m = String(raw || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    if (!parsedDate) return '';
    return parsedDate.getFullYear() + '-' +
      String(parsedDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(parsedDate.getDate()).padStart(2, '0');
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
    let dateFundedRaw = (r.date_funded || r.Date_Funded || '').trim();
    let date = parseDate(dateFundedRaw);
    return {
      packageOwner: extra.packageOwner || packageOwnerFromRecord(r),
      funding: nn(r.funding || r.Funded_Amount),
      dateFundedRaw: dateFundedRaw,
      date: date,
      dateKey: fundedDateKey(dateFundedRaw, date)
    };
  }

  function yesterdayBounds() {
    let now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth();
    let d = now.getDate();
    return {
      start: new Date(y, m, d - 1, 0, 0, 0),
      end: new Date(y, m, d - 1, 23, 59, 59)
    };
  }

  function inYesterday(d) {
    let bounds = yesterdayBounds();
    let yKey = bounds.start.getFullYear() + '-' +
      String(bounds.start.getMonth() + 1).padStart(2, '0') + '-' +
      String(bounds.start.getDate()).padStart(2, '0');
    let dealKey = d.dateKey || fundedDateKey(d.dateFundedRaw, d.date);
    return dealKey === yKey;
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

  function topYesterdayRep(deals) {
    let by = {};
    deals.forEach(function (d) {
      let name = d.packageOwner;
      if (!name || isExcludedName(name)) return;
      if (!by[name]) by[name] = { name: name, volume: 0 };
      by[name].volume += d.funding;
    });

    let rows = Object.values(by).filter(function (r) { return r.volume > 0; });
    if (!rows.length) return null;

    rows.sort(function (a, b) {
      if (b.volume !== a.volume) return b.volume - a.volume;
      return String(a.name).localeCompare(String(b.name));
    });

    return rows[0];
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

  function render(top) {
    let card = document.getElementById('dashYesterdayTopCard');
    let nameEl = document.getElementById('dashYesterdayTopName');
    let amtEl = document.getElementById('dashYesterdayTopAmount');
    let photoEl = document.getElementById('dashYesterdayTopPhoto');

    if (!card || !nameEl || !amtEl || !photoEl) return;

    card.removeAttribute('data-person-id');
    card.removeAttribute('data-fb-rep-name');
    card.removeAttribute('role');
    card.removeAttribute('tabindex');
    card.removeAttribute('aria-label');

    if (!top) {
      nameEl.textContent = 'No funding yesterday';
      amtEl.textContent = '';
      photoEl.innerHTML = '';
      return;
    }

    let label = displayName(top.name);
    let pid = repPersonId(top.name);
    let photo = repPhoto(top.name);

    nameEl.textContent = label;
    amtEl.textContent = fmtMoney(top.volume);

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
        '<div class="card-rep-photo" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#60A5FA,#2563EB);color:#fff;font-weight:700;font-size:28px">' +
        esc(repInitials(label)) +
        '</div>';
    }
  }

  function loadAndRender() {
    if (!window.CapMuseData || !window.CapMuseData.getRawDeals) return;
    loadCsvLookup().then(function () {
      return window.CapMuseData.getRawDeals();
    }).then(function (raw) {
      let deals = (raw || []).map(mapDeal).filter(Boolean).filter(inYesterday);
      render(topYesterdayRep(deals));
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
