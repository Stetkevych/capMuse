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

  let RAW_ROWS = [];
  let MAPPED_ROWS = [];
  let FILTERED_ROW_COUNT = 0;
  let STATS = [];
  let SORT_KEY = 'fundedAmt';
  let SORT_DIR = 'desc';

  let FILTERS = {
    leadSource: [],
    marketingAssist: [],
    state: [],
    dateRange: 'ytd',
    customFrom: '',
    customTo: '',
    lender: [],
    productType: [],
    dealType: [],
    fundingMin: null,
    fundingMax: null
  };

  let FILTER_DEFS = [
    { key: 'leadSource', label: 'Lead Source', field: 'leadSource', searchable: true, grouped: true },
    { key: 'marketingAssist', label: 'Marketing Assist', field: 'marketingAssist', searchable: true },
    { key: 'state', label: 'State', field: 'state', searchable: true },
    { key: 'dateRange', label: 'Date Range', type: 'date' },
    { key: 'fundingRange', label: 'Funded Amount', type: 'range' },
    { key: 'lender', label: 'Lender', field: 'lender', searchable: true },
    { key: 'productType', label: 'Product Type', field: 'productType', searchable: true, extraOptions: ['Reverse'] },
    { key: 'dealType', label: 'Deal Type', field: 'dealType', searchable: true, grouped: true }
  ];

  let FUNDING_RANGE_STEP = 5000;

  let LENDER_ALIASES = {
    'can': 'Can Capital',
    'can capital': 'Can Capital',
    'canacap': 'Can Capital',
    'cancap': 'Can Capital',
    'can equipment': 'CAN Equipment',
    'ondeck (loc)': 'OnDeck (LOC)',
    'ondeck (canada)': 'OnDeck (Canada)',
    'ondeck (canda)': 'OnDeck (Canada)'
  };

  let DATE_PRESETS = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'ytd', label: 'Year to date' },
    { id: 'last_month', label: 'Last month' },
    { id: 'last_3_months', label: 'Last 3 months' },
    { id: 'last_6_months', label: 'Last 6 months' },
    { id: 'this_month', label: 'This month' },
    { id: 'all_time', label: 'Last 24 Months'},
    { id: 'custom', label: 'Custom range' }
  ];

  let LEAD_SOURCE_GROUP_FACEBOOK = '__group:facebook';
  let LEAD_SOURCE_GROUP_FB_SPO = '__group:facebook-spo';

  let popupKey = null;
  let popupDraft = [];

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

  function parseDate(s) {
    if (!s) return null;
    let d = new Date(String(s).length === 10 ? String(s) + 'T12:00:00' : s);
    return isNaN(d.getTime()) ? null : d;
  }

  function normState(s) { return String(s || '').trim().toUpperCase(); }

  function normStr(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim()
      .toLowerCase();
  }

  function normLeadKey(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }

  function fmtFundingShort(v) {
    let n = Math.round(v || 0);
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + n.toLocaleString('en-US');
  }

  function roundFundingBound(v, up) {
    if (!v) return 0;
    let step = FUNDING_RANGE_STEP;
    return up ? Math.ceil(v / step) * step : Math.floor(v / step) * step;
  }

  function fundingDataBounds(exceptKey) {
    let rows = applyFilters(MAPPED_ROWS, exceptKey || 'fundingRange');
    let amounts = computeStats(rows)
      .map(function (s) { return s.fundedAmt || 0; })
      .filter(function (v) { return v > 0; });
    if (!amounts.length) return { min: 0, max: FUNDING_RANGE_STEP };
    let rawMin = Math.min.apply(null, amounts);
    let rawMax = Math.max.apply(null, amounts);
    return {
      min: roundFundingBound(rawMin, false),
      max: Math.max(roundFundingBound(rawMax, true), roundFundingBound(rawMin, false) + FUNDING_RANGE_STEP)
    };
  }

  function isFundingFilterActive() {
    return FILTERS.fundingMin != null || FILTERS.fundingMax != null;
  }

  function repInFundingRange(stat) {
    if (!isFundingFilterActive()) return true;
    let f = stat.fundedAmt || 0;
    if (FILTERS.fundingMin != null && f < FILTERS.fundingMin) return false;
    if (FILTERS.fundingMax != null && f > FILTERS.fundingMax) return false;
    return true;
  }

  function fundingRangeLabel(min, max) {
    if (min != null && max != null) return fmtFundingShort(min) + ' – ' + fmtFundingShort(max);
    if (min != null) return fmtFundingShort(min) + '+';
    if (max != null) return 'Up to ' + fmtFundingShort(max);
    return 'All';
  }

  function normalizeLender(name) {
    let raw = String(name || '').trim();
    if (!raw) return '';
    let key = normStr(raw);
    if (LENDER_ALIASES[key]) return LENDER_ALIASES[key];
    if (key === 'can') return 'Can Capital';
    if (/^can\s+equipment$/i.test(raw)) return 'CAN Equipment';
    if (/^canacap$/i.test(raw) || /^cancap$/i.test(raw)) return 'Can Capital';
    if (/^ondeck\s*\(loc\)$/i.test(raw)) return 'OnDeck (LOC)';
    if (/^ondeck\s*\(canada\)$/i.test(raw) || /^ondeck\s*\(canda\)$/i.test(raw)) return 'OnDeck (Canada)';
    return raw;
  }

  function normalizeProductType(raw, dealType) {
    let s = String(raw || '').trim();
    if (s && s !== '-') return s;
    let dt = String(dealType || '').trim();
    if (!dt || dt === '-') return '';
    let m = dt.match(/^(?:renewal|new deal|add\s*[- ]?on)\s+(.+)$/i);
    if (m) return m[1].trim();
    return '';
  }

  function normalizeDealType(type) {
    let raw = String(type || '').trim();
    if (!raw || raw === '-') return '';
    let key = normStr(raw);
    if (key === 'renewal' || key.indexOf('renewal') === 0) return 'Renewal';
    if (key === 'new deal') return 'New Deal';
    if (key === 'stack') return 'Stack';
    if (key === 'loc') return 'LOC';
    if (key === 'reverse' || key === 'reversal') return 'Reverse';
    if (/add\s*[- ]?\s*on/i.test(raw)) return 'Add-on';
    if (key === 'bizdev') return 'Bizdev';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function sortProductTypeFacets(values) {
    let sorted = values.slice().sort(function (a, b) {
      return String(a).localeCompare(String(b));
    });
    let reverseIdx = sorted.indexOf('Reverse');
    if (reverseIdx === -1) return sorted;
    sorted.splice(reverseIdx, 1);
    let wcIdx = sorted.indexOf('Working Capital');
    if (wcIdx === -1) sorted.push('Reverse');
    else sorted.splice(wcIdx + 1, 0, 'Reverse');
    return sorted;
  }

  function looksLikeFacebook(leadSource) {
    let n = normLeadKey(leadSource);
    return n.indexOf('facebook') > -1 || n.indexOf('faceboook') > -1;
  }

  function isFacebookSpo(leadSource) {
    return looksLikeFacebook(leadSource) && normLeadKey(leadSource).indexOf('spo') > -1;
  }

  function isFacebookNonSpo(leadSource) {
    return looksLikeFacebook(leadSource) && !isFacebookSpo(leadSource);
  }

  function mapPipelineRow(r) {
    let mm = (r['Marketing Assist.'] || r['Marketing  Assist.'] || r['Marketing Master'] || '').trim();
    if (mm === '-' || mm === '0.0%') mm = '';
    let dealTypeRaw = r['Deal Type'] || '';
    let stageLc = (r['Stage of Package'] || '').toLowerCase();
    let isFunded = stageLc.indexOf('fund') > -1 && stageLc.indexOf('decline') === -1;
    let amt = nn(r['Amount']);
    return {
      raw: r,
      dateApplied: parseDate(r['Date Applied'] || r['Created Time'] || ''),
      leadSource: (r['Lead Source'] || '').trim(),
      state: (r['State'] || '').trim(),
      marketingAssist: mm,
      lender: normalizeLender(r['Funder'] || r['Funder 2'] || ''),
      productType: normalizeProductType(r['Product Type'] || '', dealTypeRaw),
      dealType: normalizeDealType(dealTypeRaw),
      funded: isFunded,
      funding: amt,
      fundedAmount: isFunded ? amt : 0
    };
  }

  function expandFilterValues(field, selected) {
    if (!selected || !selected.length) return null;
    let expanded = {};
    selected.forEach(function (val) {
      if (val === LEAD_SOURCE_GROUP_FACEBOOK) {
        MAPPED_ROWS.forEach(function (d) {
          if (isFacebookNonSpo(d.leadSource)) expanded[d.leadSource] = d.leadSource;
        });
        return;
      }
      if (val === LEAD_SOURCE_GROUP_FB_SPO) {
        MAPPED_ROWS.forEach(function (d) {
          if (isFacebookSpo(d.leadSource)) expanded[d.leadSource] = d.leadSource;
        });
        return;
      }
      if (val.indexOf('__parent:') === 0) {
        let parent = val.slice(9);
        MAPPED_ROWS.forEach(function (d) {
          let v = d[field];
          if (!v) return;
          if (normStr(v) === normStr(parent) || normStr(v).indexOf(normStr(parent) + ' -') === 0 || normStr(v).indexOf(normStr(parent) + '-') === 0) {
            expanded[v] = v;
          }
        });
        return;
      }
      expanded[val] = val;
    });
    return Object.keys(expanded);
  }

  function matchesMulti(field, dealVal, selected) {
    let expanded = expandFilterValues(field, selected);
    if (!expanded) return true;
    if (!dealVal) return false;
    let dv = field === 'state' ? normState(dealVal) : normStr(dealVal);
    return expanded.some(function (v) {
      return field === 'state' ? normState(v) === dv : normStr(v) === dv;
    });
  }

  function dateRangeBounds() {
    let now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth();
    let start;
    let end;

    switch (FILTERS.dateRange) {
      case 'today':
        start = new Date(y, m, now.getDate(), 0, 0, 0);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
        break;
      case 'yesterday':
        start = new Date(y, m, now.getDate() - 1, 0, 0, 0);
        end = new Date(y, m, now.getDate() - 1, 23, 59, 59);
        break;
      case 'ytd':
        start = new Date(y, 0, 1);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
        break;
      case 'last_month':
        start = new Date(y, m - 1, 1);
        end = new Date(y, m, 0, 23, 59, 59);
        break;
      case 'last_3_months':
        start = new Date(y, m - 2, 1);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
        break;
      case 'last_6_months':
        start = new Date(y, m - 5, 1);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
        break;
      case 'this_month':
        start = new Date(y, m, 1);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
        break;
      case 'all_time':
        return null;
      case 'custom':
        start = FILTERS.customFrom ? parseDate(FILTERS.customFrom) : null;
        end = FILTERS.customTo ? parseDate(FILTERS.customTo) : null;
        if (end) end.setHours(23, 59, 59, 999);
        if (!start && !end) return null;
        return { start: start, end: end };
      default:
        start = new Date(y, 0, 1);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
    }
    return { start: start, end: end };
  }

  function inDateRange(row) {
    let bounds = dateRangeBounds();
    if (!bounds) return true;
    if (!row.dateApplied) return false;
    if (bounds.start && row.dateApplied < bounds.start) return false;
    if (bounds.end && row.dateApplied > bounds.end) return false;
    return true;
  }

  function applyFilters(rows, exceptKey) {
    return rows.filter(function (d) {
      if (!inDateRange(d)) return false;
      if (exceptKey !== 'leadSource' && !matchesMulti('leadSource', d.leadSource, FILTERS.leadSource)) return false;
      if (exceptKey !== 'marketingAssist' && !matchesMulti('marketingAssist', d.marketingAssist, FILTERS.marketingAssist)) return false;
      if (exceptKey !== 'state' && !matchesMulti('state', d.state, FILTERS.state)) return false;
      if (exceptKey !== 'lender' && !matchesMulti('lender', d.lender, FILTERS.lender)) return false;
      if (exceptKey !== 'productType' && !matchesMulti('productType', d.productType, FILTERS.productType)) return false;
      if (exceptKey !== 'dealType' && !matchesMulti('dealType', d.dealType, FILTERS.dealType)) return false;
      return true;
    });
  }

  function rowsForFacetOptions(excludeKey) {
    return applyFilters(MAPPED_ROWS, excludeKey);
  }

  function fmt(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n || 0).toLocaleString('en-US');
  }

  function pct(num, den) {
    return den > 0 ? (num / den * 100).toFixed(1) + '%' : '—';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function rowData(m) {
    return m.raw || m;
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
    rows.forEach(function (m) {
      let r = rowData(m);
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
      let isRenewal = r['Position'] && r['Position'] !== '0' && r['Position'] !== '1';

      byRep[rep].apps++;

      if (stage.indexOf('funded') > -1 || stage === 'future funding' || stage === 'dd - default') {
        byRep[rep].approvals++;
        // Credit Re-Puller too
        let rePuller = (r['Re-Puller'] || '').trim();
        if (rePuller && rePuller !== rep && rePuller !== 'House .' && rePuller !== 'House') {
          if (!byRep[rePuller]) byRep[rePuller] = { name: rePuller, apps: 0, approvals: 0, funded: 0, fundedAmt: 0, points: [], amounts: [], revenue: 0, appsToApprovals: '—', approvalToFunding: '—', avgPoints: '—', avgAmount: '—', avgPointsNum: 0, avgAmountNum: 0 };
          byRep[rePuller].approvals++;
        }
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
    }).filter(function (row) {
      return row.apps > 0 || row.approvals > 0 || row.funded > 0;
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

  function dateRangeMetaLabel() {
    let preset = DATE_PRESETS.filter(function (p) { return p.id === FILTERS.dateRange; })[0];
    return preset ? preset.label : 'Year to date';
  }

  function multiFilterLabel(key) {
    let arr = FILTERS[key];
    if (!arr || !arr.length) return 'All';
    if (key === 'leadSource') {
      if (arr.length === 1 && arr[0].indexOf('__') === 0) {
        if (arr[0] === LEAD_SOURCE_GROUP_FACEBOOK) return 'Facebook';
        if (arr[0] === LEAD_SOURCE_GROUP_FB_SPO) return 'Facebook - SPO';
        if (arr[0].indexOf('__parent:') === 0) return arr[0].slice(9);
      }
    }
    if (arr.length === 1) return arr[0].indexOf('__parent:') === 0 ? arr[0].slice(9) : arr[0];
    return arr.length + ' selected';
  }

  function filterDisplayValue(key) {
    if (key === 'dateRange') {
      let preset = DATE_PRESETS.filter(function (p) { return p.id === FILTERS.dateRange; })[0];
      if (FILTERS.dateRange === 'custom' && (FILTERS.customFrom || FILTERS.customTo)) {
        return (FILTERS.customFrom || '…') + ' – ' + (FILTERS.customTo || '…');
      }
      return preset ? preset.label : 'Year to date';
    }
    if (key === 'fundingRange') {
      if (!isFundingFilterActive()) return 'All';
      return fundingRangeLabel(FILTERS.fundingMin, FILTERS.fundingMax);
    }
    return multiFilterLabel(key);
  }

  function buildFacetValues(rows, field) {
    let seen = {};
    rows.forEach(function (d) {
      let val = d[field];
      if (!val) return;
      let key = field === 'state' ? normState(val) : val;
      if (!seen[key]) seen[key] = field === 'state' ? normState(val) : val;
    });
    return Object.values(seen).sort(function (a, b) {
      return String(a).localeCompare(String(b));
    });
  }

  function buildGroupedTree(rows, field) {
    let values = buildFacetValues(rows, field);
    let parents = {};
    let standalone = [];

    values.forEach(function (v) {
      let m = v.match(/^([^–\-]+?)\s*[-–]\s*(.+)$/);
      if (m) {
        let parent = m[1].trim();
        if (!parents[parent]) parents[parent] = [];
        parents[parent].push(v);
      } else {
        standalone.push(v);
      }
    });

    let tree = [];
    if (field === 'leadSource') {
      let hasFb = false;
      let hasFbSpo = false;
      values.forEach(function (v) {
        if (isFacebookSpo(v)) hasFbSpo = true;
        else if (isFacebookNonSpo(v)) hasFb = true;
      });
      if (hasFb) tree.push({ type: 'leaf', value: LEAD_SOURCE_GROUP_FACEBOOK, label: 'Facebook' });
      if (hasFbSpo) tree.push({ type: 'leaf', value: LEAD_SOURCE_GROUP_FB_SPO, label: 'Facebook - SPO' });
    }

    Object.keys(parents).sort().forEach(function (p) {
      if (parents[p].length >= 1) {
        tree.push({
          type: 'parent',
          value: '__parent:' + p,
          label: p,
          children: parents[p].sort().map(function (c) {
            return { type: 'child', value: c, label: c };
          })
        });
      }
    });

    standalone.forEach(function (v) {
      if (field === 'leadSource' && looksLikeFacebook(v)) return;
      if (parents[v]) return;
      tree.push({ type: 'leaf', value: v, label: v });
    });

    return tree;
  }

  function renderFilterChips() {
    let grid = document.getElementById('plFilterGrid');
    if (!grid) return;
    grid.innerHTML = FILTER_DEFS.map(function (def) {
      let active;
      if (def.type === 'date') {
        active = FILTERS.dateRange !== 'ytd' || FILTERS.customFrom || FILTERS.customTo;
        if (def.key === 'dateRange' && FILTERS.dateRange === 'ytd') active = false;
      } else if (def.type === 'range') {
        active = isFundingFilterActive();
      } else {
        active = FILTERS[def.key] && FILTERS[def.key].length > 0;
      }
      let val = filterDisplayValue(def.key);
      return '<button type="button" class="fb-filter-chip' + (active ? ' active' : '') + '"' +
        ' data-filter-key="' + def.key + '">' +
        '<span class="fb-filter-chip-name">' + esc(def.label) + '</span>' +
        '<span class="fb-filter-chip-val">' + esc(val) + '</span>' +
        '</button>';
    }).join('');

    grid.querySelectorAll('.fb-filter-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openFilterPopup(btn.getAttribute('data-filter-key'));
      });
    });
  }

  function clearFilterKey(key) {
    if (key === 'dateRange') {
      FILTERS.dateRange = 'ytd';
      FILTERS.customFrom = '';
      FILTERS.customTo = '';
    } else if (key === 'fundingRange') {
      FILTERS.fundingMin = null;
      FILTERS.fundingMax = null;
    } else {
      FILTERS[key] = [];
    }
  }

  function renderActiveTags() {
    let wrap = document.getElementById('plActiveFilters');
    if (!wrap) return;
    let tags = [];

    FILTER_DEFS.forEach(function (def) {
      if (def.key === 'dateRange') {
        if (FILTERS.dateRange !== 'ytd' || FILTERS.customFrom || FILTERS.customTo) {
          tags.push({ key: def.key, label: def.label + ': ' + filterDisplayValue(def.key) });
        }
        return;
      }
      if (def.type === 'range') {
        if (isFundingFilterActive()) {
          tags.push({ key: def.key, label: def.label + ': ' + filterDisplayValue(def.key) });
        }
        return;
      }
      if (FILTERS[def.key] && FILTERS[def.key].length) {
        tags.push({ key: def.key, label: def.label + ': ' + filterDisplayValue(def.key) });
      }
    });

    if (!tags.length) {
      wrap.innerHTML = '';
      return;
    }

    wrap.innerHTML = tags.map(function (t) {
      return '<span class="fb-active-tag">' + esc(t.label) +
        '<button type="button" data-clear-key="' + t.key + '" aria-label="Remove ' + esc(t.label) + '">&times;</button></span>';
    }).join('');

    wrap.querySelectorAll('[data-clear-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearFilterKey(btn.getAttribute('data-clear-key'));
        applyFilteredStats();
      });
    });
  }

  function draftHas(val) {
    return popupDraft.indexOf(val) > -1;
  }

  function findOptInput(container, val) {
    let found = null;
    container.querySelectorAll('input[data-opt]').forEach(function (inp) {
      if (inp.getAttribute('data-opt') === val) found = inp;
    });
    return found;
  }

  function toggleDraftVal(val, children) {
    let idx = popupDraft.indexOf(val);
    if (idx > -1) {
      popupDraft.splice(idx, 1);
      if (children) {
        children.forEach(function (c) {
          let ci = popupDraft.indexOf(c.value);
          if (ci > -1) popupDraft.splice(ci, 1);
        });
      }
    } else {
      popupDraft.push(val);
      if (children) {
        children.forEach(function (c) {
          if (popupDraft.indexOf(c.value) === -1) popupDraft.push(c.value);
        });
      }
    }
  }

  function renderCheckboxOptions(container, def, query) {
    if (!container || !def.field) return;

    let facetRows = rowsForFacetOptions(def.key);
    let facetValues = buildFacetValues(facetRows, def.field);
    if (def.extraOptions) {
      def.extraOptions.forEach(function (v) {
        if (facetValues.indexOf(v) === -1) facetValues.push(v);
      });
    }
    if (def.key === 'productType') {
      facetValues = sortProductTypeFacets(facetValues);
    } else {
      facetValues.sort(function (a, b) { return String(a).localeCompare(String(b)); });
    }

    let tree = def.grouped ? buildGroupedTree(facetRows, def.field) : facetValues.map(function (v) {
      return { type: 'leaf', value: v, label: v };
    });

    let q = normStr(query);
    if (q) {
      tree = tree.filter(function (node) {
        if (node.type === 'parent') {
          node.children = node.children.filter(function (c) { return normStr(c.label).indexOf(q) > -1; });
          return normStr(node.label).indexOf(q) > -1 || node.children.length;
        }
        return normStr(node.label).indexOf(q) > -1;
      });
    }

    let allChecked = !popupDraft.length;
    let html = '<label class="fb-filter-check fb-filter-check-all">' +
      '<input type="checkbox" data-opt-all="1"' + (allChecked ? ' checked' : '') + ' />' +
      '<span>Select all</span></label>';

    tree.slice(0, 250).forEach(function (node) {
      if (node.type === 'parent') {
        let pChecked = draftHas(node.value);
        html += '<label class="fb-filter-check fb-filter-check-parent">' +
          '<input type="checkbox" data-opt="' + esc(node.value) + '"' + (pChecked ? ' checked' : '') + ' />' +
          '<span>' + esc(node.label) + '</span></label>';
        node.children.forEach(function (c) {
          html += '<label class="fb-filter-check fb-filter-check-child">' +
            '<input type="checkbox" data-opt="' + esc(c.value) + '"' + (draftHas(c.value) ? ' checked' : '') + ' />' +
            '<span>' + esc(c.label) + '</span></label>';
        });
      } else {
        html += '<label class="fb-filter-check">' +
          '<input type="checkbox" data-opt="' + esc(node.value) + '"' + (draftHas(node.value) ? ' checked' : '') + ' />' +
          '<span>' + esc(node.label) + '</span></label>';
      }
    });

    container.innerHTML = html;

    container.querySelectorAll('input[data-opt-all]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        popupDraft = [];
        container.querySelectorAll('input[data-opt]').forEach(function (c) { c.checked = false; });
        inp.checked = true;
      });
    });

    container.querySelectorAll('input[data-opt]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        let val = inp.getAttribute('data-opt');
        let parentNode = tree.filter(function (n) { return n.value === val; })[0];
        if (parentNode && parentNode.type === 'parent') {
          toggleDraftVal(val, parentNode.children);
          parentNode.children.forEach(function (c) {
            let childInp = findOptInput(container, c.value);
            if (childInp) childInp.checked = draftHas(c.value);
          });
          inp.checked = draftHas(val);
        } else {
          if (inp.checked) {
            if (popupDraft.indexOf(val) === -1) popupDraft.push(val);
          } else {
            let idx = popupDraft.indexOf(val);
            if (idx > -1) popupDraft.splice(idx, 1);
          }
        }
        let allInp = container.querySelector('input[data-opt-all]');
        if (allInp) allInp.checked = !popupDraft.length;
      });
    });
  }

  function updateFundingRangeFill(minInp, maxInp, fill, bounds) {
    if (!minInp || !maxInp || !fill) return;
    let span = bounds.max - bounds.min || 1;
    let lo = (parseInt(minInp.value, 10) - bounds.min) / span * 100;
    let hi = (parseInt(maxInp.value, 10) - bounds.min) / span * 100;
    fill.style.left = lo + '%';
    fill.style.width = (hi - lo) + '%';
  }

  function renderFundingRangeOptions(container) {
    if (!container) return;
    let bounds = fundingDataBounds('fundingRange');
    let draftMin = popupDraft && popupDraft.min != null ? popupDraft.min : (
      FILTERS.fundingMin != null ? FILTERS.fundingMin : bounds.min
    );
    let draftMax = popupDraft && popupDraft.max != null ? popupDraft.max : (
      FILTERS.fundingMax != null ? FILTERS.fundingMax : bounds.max
    );
    draftMin = Math.max(bounds.min, Math.min(draftMin, bounds.max));
    draftMax = Math.max(bounds.min, Math.min(draftMax, bounds.max));
    if (draftMin > draftMax) draftMin = draftMax;
    popupDraft = { min: draftMin, max: draftMax };

    container.innerHTML =
      '<div class="fb-range-slider">' +
        '<div class="fb-range-values">' +
          '<span class="fb-range-val" id="plFundingMinLbl">' + fmtFundingShort(draftMin) + '</span>' +
          '<span class="fb-range-val" id="plFundingMaxLbl">' + fmtFundingShort(draftMax) + '</span>' +
        '</div>' +
        '<div class="fb-range-track-wrap">' +
          '<div class="fb-range-track"></div>' +
          '<div class="fb-range-fill" id="plFundingFill"></div>' +
          '<input type="range" class="fb-range-input fb-range-input--min" id="plFundingMinInp"' +
            ' min="' + bounds.min + '" max="' + bounds.max + '" step="' + FUNDING_RANGE_STEP + '" value="' + draftMin + '" />' +
          '<input type="range" class="fb-range-input fb-range-input--max" id="plFundingMaxInp"' +
            ' min="' + bounds.min + '" max="' + bounds.max + '" step="' + FUNDING_RANGE_STEP + '" value="' + draftMax + '" />' +
        '</div>' +
        '<div class="fb-range-hint">Total funded per rep · ' + fmtFundingShort(bounds.min) + ' – ' + fmtFundingShort(bounds.max) + '</div>' +
      '</div>';

    let minInp = document.getElementById('plFundingMinInp');
    let maxInp = document.getElementById('plFundingMaxInp');
    let minLbl = document.getElementById('plFundingMinLbl');
    let maxLbl = document.getElementById('plFundingMaxLbl');
    let fill = document.getElementById('plFundingFill');

    function syncFromMin() {
      let minVal = parseInt(minInp.value, 10);
      let maxVal = parseInt(maxInp.value, 10);
      if (minVal > maxVal) {
        minVal = maxVal;
        minInp.value = String(minVal);
      }
      popupDraft = { min: minVal, max: maxVal };
      if (minLbl) minLbl.textContent = fmtFundingShort(minVal);
      updateFundingRangeFill(minInp, maxInp, fill, bounds);
    }

    function syncFromMax() {
      let minVal = parseInt(minInp.value, 10);
      let maxVal = parseInt(maxInp.value, 10);
      if (maxVal < minVal) {
        maxVal = minVal;
        maxInp.value = String(maxVal);
      }
      popupDraft = { min: minVal, max: maxVal };
      if (maxLbl) maxLbl.textContent = fmtFundingShort(maxVal);
      updateFundingRangeFill(minInp, maxInp, fill, bounds);
    }

    if (minInp) minInp.addEventListener('input', syncFromMin);
    if (maxInp) maxInp.addEventListener('input', syncFromMax);
    updateFundingRangeFill(minInp, maxInp, fill, bounds);
  }

  function renderDateOptions(container) {
    if (!container) return;
    let html = '<div class="fb-date-presets">';
    DATE_PRESETS.forEach(function (p) {
      let sel = (popupDraft || FILTERS.dateRange) === p.id ? ' selected' : '';
      html += '<button type="button" class="fb-filter-option' + sel + '" data-date-preset="' + p.id + '">' + esc(p.label) + '</button>';
    });
    html += '</div>';
    html += '<div class="fb-date-custom">' +
      '<label>From<input type="date" id="plCustomFrom" value="' + esc(FILTERS.customFrom) + '" /></label>' +
      '<label>To<input type="date" id="plCustomTo" value="' + esc(FILTERS.customTo) + '" /></label>' +
      '</div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-date-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        popupDraft = btn.getAttribute('data-date-preset');
        container.querySelectorAll('[data-date-preset]').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
      });
    });
  }

  function openFilterPopup(key) {
    let def = FILTER_DEFS.filter(function (d) { return d.key === key; })[0];
    if (!def) return;

    popupKey = key;
    if (key === 'dateRange') {
      popupDraft = FILTERS.dateRange;
    } else if (def.type === 'range') {
      let bounds = fundingDataBounds('fundingRange');
      popupDraft = {
        min: FILTERS.fundingMin != null ? FILTERS.fundingMin : bounds.min,
        max: FILTERS.fundingMax != null ? FILTERS.fundingMax : bounds.max
      };
    } else {
      popupDraft = (FILTERS[key] || []).slice();
    }

    let overlay = document.getElementById('plFilterOverlay');
    let title = document.getElementById('plFilterModalTitle');
    let searchWrap = document.getElementById('plFilterSearchWrap');
    let searchInput = document.getElementById('plFilterSearch');
    let options = document.getElementById('plFilterOptions');

    if (title) title.textContent = def.label;
    if (searchWrap) searchWrap.hidden = def.type === 'date' || def.type === 'range' ? true : !def.searchable;
    if (searchInput) searchInput.value = '';

    if (def.type === 'date') {
      renderDateOptions(options);
    } else if (def.type === 'range') {
      renderFundingRangeOptions(options);
    } else {
      renderCheckboxOptions(options, def, '');
    }

    if (searchInput && def.searchable) {
      searchInput.oninput = function () {
        renderCheckboxOptions(options, def, searchInput.value);
      };
    }

    if (overlay) {
      overlay.hidden = false;
      requestAnimationFrame(function () { overlay.classList.add('open'); });
    }
    document.body.style.overflow = 'hidden';
  }

  function closeFilterPopup() {
    let overlay = document.getElementById('plFilterOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(function () { overlay.hidden = true; }, 200);
    }
    popupKey = null;
    popupDraft = [];
  }

  function applyFilterPopup() {
    if (!popupKey) return;
    if (popupKey === 'dateRange') {
      FILTERS.dateRange = popupDraft || 'ytd';
      let fromEl = document.getElementById('plCustomFrom');
      let toEl = document.getElementById('plCustomTo');
      if (fromEl) FILTERS.customFrom = fromEl.value;
      if (toEl) FILTERS.customTo = toEl.value;
      if (FILTERS.dateRange === 'custom' && !FILTERS.customFrom && !FILTERS.customTo) {
        FILTERS.dateRange = 'ytd';
      }
    } else if (popupKey === 'fundingRange') {
      let bounds = fundingDataBounds('fundingRange');
      let minVal = popupDraft && popupDraft.min != null ? popupDraft.min : bounds.min;
      let maxVal = popupDraft && popupDraft.max != null ? popupDraft.max : bounds.max;
      if (minVal <= bounds.min && maxVal >= bounds.max) {
        FILTERS.fundingMin = null;
        FILTERS.fundingMax = null;
      } else {
        FILTERS.fundingMin = minVal > bounds.min ? minVal : null;
        FILTERS.fundingMax = maxVal < bounds.max ? maxVal : null;
      }
    } else {
      FILTERS[popupKey] = popupDraft.slice();
    }
    closeFilterPopup();
    applyFilteredStats();
  }

  function clearFilterPopup() {
    if (!popupKey) return;
    if (popupKey === 'dateRange') {
      popupDraft = 'ytd';
      FILTERS.dateRange = 'ytd';
      FILTERS.customFrom = '';
      FILTERS.customTo = '';
      renderDateOptions(document.getElementById('plFilterOptions'));
    } else if (popupKey === 'fundingRange') {
      FILTERS.fundingMin = null;
      FILTERS.fundingMax = null;
      let bounds = fundingDataBounds('fundingRange');
      popupDraft = { min: bounds.min, max: bounds.max };
      renderFundingRangeOptions(document.getElementById('plFilterOptions'));
    } else {
      popupDraft = [];
      FILTERS[popupKey] = [];
      let def = FILTER_DEFS.filter(function (d) { return d.key === popupKey; })[0];
      if (def) renderCheckboxOptions(document.getElementById('plFilterOptions'), def, '');
    }
    closeFilterPopup();
    applyFilteredStats();
  }

  function wireFilterModal() {
    let overlay = document.getElementById('plFilterOverlay');
    let closeBtn = document.getElementById('plFilterClose');
    let applyBtn = document.getElementById('plFilterApply');
    let clearBtn = document.getElementById('plFilterClear');

    if (closeBtn) closeBtn.addEventListener('click', closeFilterPopup);
    if (applyBtn) applyBtn.addEventListener('click', applyFilterPopup);
    if (clearBtn) clearBtn.addEventListener('click', clearFilterPopup);
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeFilterPopup();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && popupKey) closeFilterPopup();
    });
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

  function renderHeroContext(appCount, repCount) {
    let el = document.getElementById('plHeroContext');
    if (el) {
      let repPart = (repCount || 0) + ' rep' + ((repCount || 0) === 1 ? '' : 's');
      el.textContent = appCount.toLocaleString('en-US') + ' applications · ' + repPart + ' · ' + dateRangeMetaLabel();
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

    if (meta) {
      meta.textContent = FILTERED_ROW_COUNT.toLocaleString('en-US') + ' records · ' +
        rows.length + ' rep' + (rows.length === 1 ? '' : 's') + ' · ' + dateRangeMetaLabel();
    }

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
    renderHeroContext(t.apps, sorted.length);
    renderHeroSpotlight(sorted);
    renderTable(sorted);
    renderFilterChips();
    renderActiveTags();
  }

  function applyFilteredStats() {
    if (!RAW_ROWS.length) return;
    MAPPED_ROWS = RAW_ROWS.map(mapPipelineRow);
    let filtered = applyFilters(MAPPED_ROWS);
    STATS = computeStats(filtered).filter(repInFundingRange);
    if (isFundingFilterActive()) {
      let keep = {};
      STATS.forEach(function (s) { keep[s.name] = true; });
      FILTERED_ROW_COUNT = filtered.filter(function (m) {
        let r = rowData(m);
        return keep[r['Puller'] || r['Packages in Process Owner'] || ''];
      }).length;
    } else {
      FILTERED_ROW_COUNT = filtered.length;
    }
    render();
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

  function loadRows(rows) {
    if (!rows || !rows.length) return;
    RAW_ROWS = rows;
    applyFilteredStats();
  }

  function load(text) {
    if (!text) return;
    loadRows(parseCSV(text));
  }

  function init() {
    wireFilterModal();
    wireSortHeaders();
    renderFilterChips();

    function onRows(rows) {
      if (!rows || !rows.length) {
        console.warn('[Pipeline] No data loaded');
        return;
      }
      console.log('[Pipeline] Loaded', rows.length, 'pipeline records');
      window._pipelineRows = rows;
      loadRows(rows);
    }

    if (window.CapMuseData) {
      window.CapMuseData.getPipelineRows().then(onRows);
      window.addEventListener('capmuse:pipeline-updated', function (e) {
        if (e.detail && e.detail.length) loadRows(e.detail);
      });
    } else {
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
