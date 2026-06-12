// Landing page — Rep vs Rep matchups from Funding Book YTD rankings

(function () {

  'use strict';



  if (!document.getElementById('dashRepVsCard')) return;



  let FEATURED_MATCHUP_IDS = ['rio', 'kip'];

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

    if (!row) {

      return { packageOwner: '' };

    }

    return {

      packageOwner: (row.packageOwner || '').trim()

    };

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



  function ytdBounds() {

    let now = new Date();

    return {

      start: new Date(now.getFullYear(), 0, 1),

      end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    };

  }



  function mtdBounds() {

    let now = new Date();

    return {

      start: new Date(now.getFullYear(), now.getMonth(), 1),

      end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    };

  }



  function inRange(d, bounds) {

    if (!d.date) return false;

    return d.date >= bounds.start && d.date <= bounds.end;

  }



  function inYtd(d) {

    return inRange(d, ytdBounds());

  }



  function inMtd(d) {

    return inRange(d, mtdBounds());

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



  function aggregateByRep(deals) {

    let by = {};

    deals.forEach(function (d) {

      let name = d.packageOwner;

      if (!name) return;

      if (!by[name]) by[name] = { name: name, volume: 0, count: 0 };

      by[name].volume += d.funding;

      by[name].count += 1;

    });

    return Object.values(by).filter(function (r) { return r.volume > 0 || r.count > 0; });

  }



  function aggregateMtdMap(deals) {

    let by = {};

    deals.forEach(function (d) {

      if (!inMtd(d)) return;

      let name = d.packageOwner;

      if (!name) return;

      if (!by[name]) by[name] = 0;

      by[name] += d.funding;

    });

    return by;

  }



  function findFeaturedSide(ranked, repId, mtdByName) {

    let i;

    for (i = 0; i < ranked.length; i++) {

      if (repPersonId(ranked[i].name) !== repId) continue;

      return {

        name: ranked[i].name,

        volume: ranked[i].volume,

        count: ranked[i].count,

        rank: i + 1,

        mtdVolume: mtdByName[ranked[i].name] || 0

      };

    }

    return null;

  }



  function buildMatchups(rows, mtdByName) {

    let ranked = rows.slice().sort(function (a, b) {

      if (b.volume !== a.volume) return b.volume - a.volume;

      return String(a.name).localeCompare(String(b.name));

    });



    let left = findFeaturedSide(ranked, FEATURED_MATCHUP_IDS[0], mtdByName);

    let right = findFeaturedSide(ranked, FEATURED_MATCHUP_IDS[1], mtdByName);

    if (!left || !right) return [];

    return [{ left: left, right: right }];

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



  function repClickAttrs(pid, bookName) {

    if (!bookName) return '';

    let attrs = ' data-fb-rep-name="' + esc(bookName) + '"';

    if (pid) attrs += ' data-person-id="' + esc(pid) + '"';

    attrs += ' role="button" tabindex="0" aria-label="View ' + esc(displayName(bookName)) + ' stats"';

    return attrs;

  }



  function fundedBarHtml(mtdVolume, maxMtd, leading) {
    let pct = maxMtd > 0 ? Math.round((mtdVolume / maxMtd) * 100) : 0;
    if (mtdVolume > 0 && pct < 4) pct = 4;
    let leadCls = leading ? ' rvs-bar-fill--leading' : '';
    return (
      '<div class="rvs-funded">' +
        '<div class="rvs-funded-head">' +
          '<span class="rvs-funded-label">Amount funded</span>' +
          '<span class="rvs-funded-amt">' + esc(fmtMoney(mtdVolume)) + '</span>' +
        '</div>' +
        '<div class="rvs-bar-track" aria-hidden="true">' +
          '<div class="rvs-bar-fill' + leadCls + '" style="width:' + pct + '%"></div>' +
        '</div>' +
      '</div>'
    );
  }

  function repRowHtml(side, maxMtd, mtdLeading) {
    if (!side) return '';
    let pid = repPersonId(side.name);
    let photo = repPhoto(side.name);
    let label = displayName(side.name);
    let clickAttr = pid ? repClickAttrs(pid, side.name) : '';
    let avatar = photo
      ? '<img class="rvs-avatar" src="' + esc(photo) + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
        '<div class="rvs-initials" style="display:none">' + esc(repInitials(label)) + '</div>'
      : '<div class="rvs-initials">' + esc(repInitials(label)) + '</div>';
    let leadCls = mtdLeading ? ' rvs-row--leading' : '';

    return (
      '<div class="rvs-row' + leadCls + '"' + clickAttr + '>' +
        '<div class="rvs-photo-wrap">' + avatar + '</div>' +
        '<div class="rvs-data">' +
          '<div class="rvs-name-row">' +
            '<span class="rvs-name">' + esc(label) + '</span>' +
            '<span class="rvs-meta">#' + side.rank + ' · YTD ' + esc(fmtMoney(side.volume)) + '</span>' +
          '</div>' +
          fundedBarHtml(side.mtdVolume || 0, maxMtd, mtdLeading) +
        '</div>' +
      '</div>'
    );
  }



  function renderMatchups(matchups) {

    let grid = document.getElementById('dashRepVsGrid');

    if (!grid) return;



    if (!matchups.length) {

      grid.innerHTML = '<div class="rvs-empty">No matchups yet — waiting on Funding Book data.</div>';

      return;

    }



    grid.innerHTML = matchups.map(function (m) {

      let maxMtd = Math.max(m.left.mtdVolume || 0, (m.right && m.right.mtdVolume) || 0);

      let leftMtdWin = !m.right || (m.left.mtdVolume || 0) >= (m.right.mtdVolume || 0);
      let rightMtdWin = m.right && (m.right.mtdVolume || 0) > (m.left.mtdVolume || 0);

      return (
        '<article class="rvs-match">' +
          repRowHtml(m.left, maxMtd, leftMtdWin) +
          '<div class="rvs-vs" aria-hidden="true">VS</div>' +
          repRowHtml(m.right, maxMtd, rightMtdWin) +
        '</article>'
      );

    }).join('');

  }



  function loadAndRender() {

    if (!window.CapMuseData || !window.CapMuseData.getRawDeals) return;

    loadCsvLookup().then(function () {

      return window.CapMuseData.getRawDeals();

    }).then(function (raw) {

      let deals = (raw || []).map(mapDeal).filter(Boolean);

      let mtdByName = aggregateMtdMap(deals);

      let rows = aggregateByRep(deals.filter(inYtd));

      renderMatchups(buildMatchups(rows, mtdByName));

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

