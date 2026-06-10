// Pipeline — rep leaderboard from pipeline.csv (Zoho export)
(function () {
  'use strict';
  if (!document.body.classList.contains('pipeline-page')) return;

  let BUCKET = 'https://capmuse-data-882611632216.s3.amazonaws.com';
  let CSV_URLS = [
    BUCKET + '/pipeline.csv',
    '../pipeline.csv',
    'pipeline.csv'
  ];

  let STATS = [];
  let SORT_KEY = 'fundedAmt';
  let SORT_DIR = 'desc';

  let SORT_LABELS = {
    name: 'Rep',
    apps: 'Apps',
    approvals: 'Approvals',
    appsToApprovals: 'A→Ap %',
    funded: 'Funded',
    approvalToFunding: 'Ap→F %',
    fundedAmt: 'Funded amount',
    avgPoints: 'Avg points',
    avgAmount: 'Avg amount',
    revenue: 'Revenue'
  };

  function parseCSV(text) {
    let lines = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      let ch = text[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === '\n' && !inQuotes) { lines.push(current.replace(/\r$/, '')); current = ''; }
      else { current += ch; }
    }
    if (current.trim()) lines.push(current.replace(/\r$/, ''));
    if (lines.length < 2) return [];
    let headers = splitRow(lines[0]);
    let rows = [];
    for (let j = 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      let vals = splitRow(lines[j]);
      let obj = {};
      for (let k = 0; k < headers.length; k++) { obj[headers[k]] = vals[k] || ''; }
      rows.push(obj);
    }
    return rows;
  }

  function splitRow(line) {
    let result = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      let c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    result.push(cur.trim());
    return result;
  }

  function fetchCsv(urlIndex) {
    if (urlIndex >= CSV_URLS.length) return Promise.resolve('');
    return fetch(CSV_URLS[urlIndex])
      .then(function (res) {
        if (res.ok) return res.text();
        return fetchCsv(urlIndex + 1);
      })
      .catch(function () { return fetchCsv(urlIndex + 1); });
  }

  function fmt(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n || 0).toLocaleString('en-US');
  }

  function fmtFull(n) {
    return '$' + Math.round(n || 0).toLocaleString('en-US');
  }

  function pct(num, den) {
    return den > 0 ? (num / den * 100).toFixed(1) + '%' : '—';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function normStr(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim()
      .toLowerCase();
  }

  function repPersonId(name) {
    if (!window.REPS || !name) return null;
    let n = normStr(name);
    let keys = Object.keys(window.REPS);
    let i;
    for (i = 0; i < keys.length; i++) {
      let rep = window.REPS[keys[i]];
      if (!rep || !rep.bookName) continue;
      if (n === normStr(rep.bookName)) return keys[i];
    }
    for (i = 0; i < keys.length; i++) {
      let rep = window.REPS[keys[i]];
      if (!rep) continue;
      let book = normStr(rep.bookName || rep.name || '');
      if (book && n.indexOf(book) > -1) return keys[i];
      let first = (rep.name || '').split(' ')[0].toLowerCase();
      if (first && first.length > 2 && n.indexOf(first) > -1) return keys[i];
    }
    return null;
  }

  function computeStats(rows) {
    let byRep = {};
    rows.forEach(function (r) {
      let rep = r['Puller'] || r['Packages in Process Owner'] || '';
      if (!rep || rep === 'House .' || rep === 'House') return;

      if (!byRep[rep]) {
        byRep[rep] = {
          name: rep,
          apps: 0,
          approvals: 0,
          funded: 0,
          fundedAmt: 0,
          points: [],
          amounts: [],
          revenue: 0,
          appsToApprovals: '—',
          approvalToFunding: '—',
          avgPoints: '—',
          avgAmount: '—',
          avgPointsNum: 0,
          avgAmountNum: 0
        };
      }

      let stage = (r['Stage of Package'] || '').toLowerCase();
      let amt = parseFloat(String(r['Amount'] || '0').replace(/[$,]/g, '')) || 0;

      if (r['Date Applied'] || stage.indexOf('pack') > -1 || stage.indexOf('review') > -1 ||
          stage.indexOf('approv') > -1 || stage.indexOf('fund') > -1) {
        byRep[rep].apps++;
      }

      if (stage.indexOf('approv') > -1 || (stage.indexOf('fund') > -1 && stage.indexOf('decline') === -1)) {
        byRep[rep].approvals++;
      }

      if (stage.indexOf('fund') > -1 && stage.indexOf('decline') === -1) {
        byRep[rep].funded++;
        byRep[rep].fundedAmt += amt;
        byRep[rep].amounts.push(amt);
        let pts = parseFloat(r['Paid in Percentage'] || '0') || 0;
        if (pts > 0) {
          byRep[rep].points.push(pts);
          byRep[rep].revenue += amt * (pts / 100);
        }
      }
    });

    return Object.keys(byRep).map(function (k) {
      let row = byRep[k];
      row.appsToApprovals = pct(row.approvals, row.apps);
      row.approvalToFunding = pct(row.funded, row.approvals);
      row.avgPointsNum = row.points.length
        ? row.points.reduce(function (s, v) { return s + v; }, 0) / row.points.length
        : 0;
      row.avgPoints = row.points.length ? row.avgPointsNum.toFixed(2) + '%' : '—';
      row.avgAmountNum = row.amounts.length
        ? row.amounts.reduce(function (s, v) { return s + v; }, 0) / row.amounts.length
        : 0;
      row.avgAmount = row.amounts.length ? fmt(row.avgAmountNum) : '—';
      return row;
    });
  }

  function sortRows(rows) {
    let key = SORT_KEY;
    let dir = SORT_DIR === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      let av = a[key];
      let bv = b[key];
      if (key === 'name') {
        return dir * String(av || '').localeCompare(String(bv || ''));
      }
      if (key === 'avgPoints') { av = a.avgPointsNum; bv = b.avgPointsNum; }
      if (key === 'avgAmount') { av = a.avgAmountNum; bv = b.avgAmountNum; }
      av = av || 0;
      bv = bv || 0;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function totals(stats) {
    return stats.reduce(function (t, r) {
      t.apps += r.apps;
      t.approvals += r.approvals;
      t.funded += r.funded;
      t.fundedAmt += r.fundedAmt;
      t.revenue += r.revenue;
      return t;
    }, { apps: 0, approvals: 0, funded: 0, fundedAmt: 0, revenue: 0 });
  }

  function renderHeroKpis(t) {
    let elApps = document.getElementById('plKpiApps');
    let elAppr = document.getElementById('plKpiApprovals');
    let elFund = document.getElementById('plKpiFunded');
    let elAmt = document.getElementById('plKpiFundedAmt');
    let elRev = document.getElementById('plKpiRevenue');
    if (elApps) elApps.textContent = t.apps.toLocaleString('en-US');
    if (elAppr) elAppr.textContent = t.approvals.toLocaleString('en-US');
    if (elFund) elFund.textContent = t.funded.toLocaleString('en-US');
    if (elAmt) elAmt.textContent = fmt(t.fundedAmt);
    if (elRev) elRev.textContent = fmt(t.revenue);
  }

  function renderHeroContext(appCount) {
    let el = document.getElementById('plHeroContext');
    if (el) {
      el.textContent = appCount.toLocaleString('en-US') + ' applications · All time';
    }
  }

  let SPOT_KPI_KEYS = ['apps', 'approvals', 'funded', 'fundedAmt', 'revenue'];

  function spotKpiValue(row, key) {
    if (key === 'fundedAmt' || key === 'revenue') return fmt(row[key]);
    return (row[key] || 0).toLocaleString('en-US');
  }

  function renderSpotKpi(row, key, highlightKey) {
    let sizeCls = (key === 'fundedAmt' || key === 'revenue') ? ' fb-spot-kpi--money' : ' fb-spot-kpi--count';
    let cls = 'fb-spot-kpi' + sizeCls + (key === highlightKey ? ' fb-kpi--primary' : '');
    return '<div class="' + cls + '" data-kpi="' + key + '">' +
      '<div class="fb-spot-kpi-val">' + spotKpiValue(row, key) + '</div>' +
      '<div class="fb-spot-kpi-lbl">' + esc(SORT_LABELS[key] || key) + '</div>' +
    '</div>';
  }

  function renderHeroSpotlight(rows) {
    let el = document.getElementById('plHeroSpotlight');
    if (!el) return;
    if (!rows.length || SORT_KEY === 'name') {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }
    let top = rows[0];
    el.hidden = false;
    let pid = repPersonId(top.name);
    let rep = pid && window.REPS ? window.REPS[pid] : null;
    let ringAttrs = ' class="fb-spot-photo-ring" id="plSpotPhotoRing"';
    if (pid) {
      ringAttrs += ' data-person-id="' + esc(pid) + '" role="button" tabindex="0"' +
        ' aria-label="View ' + esc(top.name) + ' stats card" title="View stats card"';
    }
    let highlightKey = SPOT_KPI_KEYS.indexOf(SORT_KEY) > -1 ? SORT_KEY : '';
    let kpisHtml = SPOT_KPI_KEYS.map(function (key) {
      return renderSpotKpi(top, key, highlightKey);
    }).join('');
    el.innerHTML =
      '<div' + ringAttrs + '>' +
        '<img id="plSpotPhoto" alt="" hidden />' +
        '<div class="hero-photo-placeholder" aria-hidden="true">?</div>' +
      '</div>' +
      '<div class="fb-spot-info">' +
        '<div class="fb-spot-lead">Leading rep</div>' +
        '<div class="fb-spot-name">' + esc(top.name) + '</div>' +
        '<div class="fb-spot-sort-lbl">Leading by ' + esc(SORT_LABELS[SORT_KEY] || SORT_KEY) + '</div>' +
        '<div class="fb-spot-kpis">' + kpisHtml + '</div>' +
      '</div>';

    if (window.setHeroRepPhoto && rep) {
      window.setHeroRepPhoto(
        document.getElementById('plSpotPhotoRing'),
        document.getElementById('plSpotPhoto'),
        rep
      );
    }

    let photoRing = document.getElementById('plSpotPhotoRing');
    if (photoRing && pid) {
      photoRing.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          photoRing.click();
        }
      });
    }
  }

  function renderSortHeaders() {
    let thead = document.querySelector('#plRepTable thead tr');
    if (!thead) return;
    thead.querySelectorAll('[data-sort]').forEach(function (th) {
      let key = th.getAttribute('data-sort');
      let arrow = th.querySelector('.fb-sort-arrow');
      if (!arrow) return;
      if (key === SORT_KEY) {
        arrow.textContent = SORT_DIR === 'asc' ? '▲' : '▼';
        th.classList.add('sorted');
      } else {
        arrow.textContent = '';
        th.classList.remove('sorted');
      }
    });
  }

  function renderTable(rows) {
    let tbody = document.getElementById('plRepTableBody');
    let meta = document.getElementById('plTableMeta');
    let empty = document.getElementById('plEmptyState');
    let table = document.getElementById('plRepTable');
    let t = totals(rows);
    if (!tbody) return;

    if (meta) meta.textContent = t.apps.toLocaleString('en-US') + ' records · ' + rows.length + ' rep' + (rows.length === 1 ? '' : 's');

    if (!rows.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      if (table) table.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (table) table.hidden = false;

    let html = '';
    rows.forEach(function (r, i) {
      let top = i === 0 ? ' class="fb-row-top"' : '';
      let pid = repPersonId(r.name);
      let nameCell = pid
        ? '<span class="fb-rep-name" data-person-id="' + esc(pid) + '" role="button" tabindex="0">' + esc(r.name) + '</span>'
        : '<span class="fb-rep-name">' + esc(r.name) + '</span>';
      html += '<tr' + top + '>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + nameCell + '</td>' +
        '<td>' + r.apps.toLocaleString('en-US') + '</td>' +
        '<td>' + r.approvals.toLocaleString('en-US') + '</td>' +
        '<td>' + r.appsToApprovals + '</td>' +
        '<td>' + r.funded.toLocaleString('en-US') + '</td>' +
        '<td>' + r.approvalToFunding + '</td>' +
        '<td><span class="fb-money">' + fmt(r.fundedAmt) + '</span></td>' +
        '<td><span class="fb-pts">' + r.avgPoints + '</span></td>' +
        '<td>' + r.avgAmount + '</td>' +
        '<td><span class="fb-money fb-money-revenue">' + fmt(r.revenue) + '</span></td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
    renderSortHeaders();
  }

  function render() {
    let sorted = sortRows(STATS);
    let t = totals(STATS);
    renderHeroKpis(t);
    renderHeroContext(t.apps);
    renderHeroSpotlight(sorted);
    renderTable(sorted);
  }

  function wireSortHeaders() {
    document.querySelectorAll('#plRepTable [data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        let key = th.getAttribute('data-sort');
        if (SORT_KEY === key) {
          SORT_DIR = SORT_DIR === 'asc' ? 'desc' : 'asc';
        } else {
          SORT_KEY = key;
          SORT_DIR = key === 'name' ? 'asc' : 'desc';
        }
        render();
      });
    });
  }

  function load(text) {
    if (!text) return;
    let rows = parseCSV(text);
    STATS = computeStats(rows);
    render();
  }

  function init() {
    wireSortHeaders();
    fetchCsv(0).then(function (text) {
      if (!text) {
        console.warn('[Pipeline] No data loaded');
        return;
      }
      console.log('[Pipeline] Loaded pipeline.csv');
      load(text);
    }).catch(function (err) {
      console.error('[Pipeline]', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
