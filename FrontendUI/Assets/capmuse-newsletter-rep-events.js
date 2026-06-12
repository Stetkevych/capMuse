// Lender Inbox — funding activity log from live Funding Book data
(function () {
  'use strict';

  let container = document.getElementById('repEventsFeed');
  if (!container) return;

  let LOG_LIMIT = 24;
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

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtMoney(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
    if (n >= 1000) return '$' + Math.round(n).toLocaleString('en-US');
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function fmtLogTime(date) {
    if (!date) return '';
    let now = new Date();
    let sameDay = date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    if (sameDay) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    let yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (date.getFullYear() === yest.getFullYear() &&
        date.getMonth() === yest.getMonth() &&
        date.getDate() === yest.getDate()) {
      return 'Yest.';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  function loadCsvLookup() {
    return fetchCsvText(0).then(function (text) {
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
    });
  }

  function isExcludedName(name) {
    if (!name) return true;
    if (isHouseName(name)) return true;
    let n = normStr(name);
    if (n.indexOf('scheweri') >= 0 || (n.indexOf('schweri') >= 0 && n.indexOf('matthew') >= 0)) return true;
    if (n === 'text' || n.indexOf('capital infusion') >= 0 || n.indexOf('marketing') >= 0) return true;
    return false;
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

  function displayName(ownerName) {
    let id = repPersonId(ownerName);
    if (id && window.REPS && window.REPS[id]) {
      return window.REPS[id].name || window.REPS[id].bookName || ownerName;
    }
    return ownerName;
  }

  function repPhoto(ownerName) {
    let id = repPersonId(ownerName);
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

  function mapDeal(r) {
    if (!r || (!r.company && !r.Deal_Name)) return null;
    let extra = csvEnrich(r);
    let owner = extra.packageOwner || packageOwnerFromRecord(r);
    let funding = nn(r.funding || r.Funded_Amount);
    let date = parseDate(r.date_funded || r.Date_Funded || '');
    let company = (r.company || r.Deal_Name || '').trim();
    if (!owner || isExcludedName(owner) || funding <= 0 || !date) return null;
    return {
      packageOwner: owner,
      funding: funding,
      date: date,
      company: company
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
    let b = monthBounds();
    return d.date >= b.start && d.date <= b.end;
  }

  function buildLogEntries(deals) {
    let entries = [];
    let monthName = new Date().toLocaleString('en-US', { month: 'long' });

    let mtdBy = {};
    deals.forEach(function (d) {
      if (!inCurrentMonth(d)) return;
      if (!mtdBy[d.packageOwner]) mtdBy[d.packageOwner] = { name: d.packageOwner, volume: 0, count: 0 };
      mtdBy[d.packageOwner].volume += d.funding;
      mtdBy[d.packageOwner].count += 1;
    });

    let mtdRows = Object.values(mtdBy).sort(function (a, b) {
      if (b.volume !== a.volume) return b.volume - a.volume;
      return String(a.name).localeCompare(String(b.name));
    });

    if (mtdRows.length) {
      let leader = mtdRows[0];
      entries.push({
        kind: 'rank',
        date: new Date(),
        timeLabel: monthName,
        owner: leader.name,
        personId: repPersonId(leader.name),
        message: 'leads ' + monthName + ' with ' + fmtMoney(leader.volume) + ' funded (' + leader.count + ' deal' + (leader.count === 1 ? '' : 's') + ')'
      });
    }

    let funded = deals.slice().sort(function (a, b) {
      return b.date.getTime() - a.date.getTime();
    });

    funded.slice(0, LOG_LIMIT).forEach(function (d) {
      let name = displayName(d.packageOwner);
      let amt = fmtMoney(d.funding);
      let msg = 'just funded ' + amt + '!';
      if (d.company && d.company.length <= 36) {
        msg = 'funded ' + amt + ' for ' + d.company;
      }
      entries.push({
        kind: 'funded',
        date: d.date,
        timeLabel: fmtLogTime(d.date),
        owner: d.packageOwner,
        display: name,
        personId: repPersonId(d.packageOwner),
        message: msg
      });
    });

    return entries;
  }

  function renderLoading() {
    container.innerHTML = '<div class="rep-log-loading">Loading activity log…</div>';
  }

  function renderEntries(entries) {
    if (!entries.length) {
      container.innerHTML = '<p class="rep-log-empty">No recent funding activity in the book.</p>';
      return;
    }

    container.innerHTML = entries.map(function (entry) {
      let name = entry.display || displayName(entry.owner);
      let photo = repPhoto(entry.owner);
      let photoHtml = photo
        ? '<img class="rep-log-photo" src="' + esc(photo) + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
          '<div class="rep-log-initials" style="display:none">' + esc(repInitials(name)) + '</div>'
        : '<div class="rep-log-initials">' + esc(repInitials(name)) + '</div>';
      let pidAttr = entry.personId ? ' data-person-id="' + esc(entry.personId) + '"' : '';
      let kindCls = entry.kind === 'rank' ? ' rep-log-entry--rank' : '';
      return (
        '<div class="rep-log-entry' + kindCls + '"' + pidAttr + '>' +
          '<time class="rep-log-time" datetime="' + esc(entry.date && entry.date.toISOString ? entry.date.toISOString() : '') + '">' + esc(entry.timeLabel) + '</time>' +
          '<div class="rep-log-avatar">' + photoHtml + '</div>' +
          '<p class="rep-log-text"><strong>' + esc(name) + '</strong> ' + esc(entry.message) + '</p>' +
        '</div>'
      );
    }).join('');
  }

  function loadAndRender() {
    renderLoading();

    let dataPromise;
    if (window.CapMuseData && window.CapMuseData.getRawDeals) {
      dataPromise = window.CapMuseData.getRawDeals();
    } else {
      dataPromise = fetch('https://capmuse-data-882611632216.s3.amazonaws.com/funding_book_live.json')
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });
    }

    return loadCsvLookup().then(function () {
      return dataPromise;
    }).then(function (raw) {
      let deals = (raw || []).map(mapDeal).filter(Boolean);
      renderEntries(buildLogEntries(deals));
    }).catch(function () {
      container.innerHTML = '<p class="rep-log-empty">Could not load funding activity.</p>';
    });
  }

  loadAndRender();

  window.addEventListener('capmuse:deals-updated', function () {
    loadAndRender();
  });
})();
