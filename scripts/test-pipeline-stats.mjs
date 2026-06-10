function splitRow(line) {
  let result = [], cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    let c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  let lines = [], current = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === '\n' && !inQuotes) { lines.push(current.replace(/\r$/, '')); current = ''; }
    else current += ch;
  }
  if (current.trim()) lines.push(current.replace(/\r$/, ''));
  if (lines.length < 2) return [];
  let headers = splitRow(lines[0]), rows = [];
  for (let j = 1; j < lines.length; j++) {
    if (!lines[j].trim()) continue;
    let vals = splitRow(lines[j]);
    let obj = {};
    for (let k = 0; k < headers.length; k++) obj[headers[k]] = vals[k] || '';
    rows.push(obj);
  }
  return rows;
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

function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }

function normalizeLender(name) {
  let raw = String(name || '').trim();
  if (!raw) return '';
  let key = normStr(raw);
  if (key === 'can' || key === 'can capital' || key === 'canacap' || key === 'cancap') return 'Can Capital';
  return raw;
}

function normalizeDealType(type) {
  let raw = String(type || '').trim();
  if (!raw || raw === '-') return '';
  let key = normStr(raw);
  if (key === 'renewal' || key.indexOf('renewal') === 0) return 'Renewal';
  if (key === 'new deal') return 'New Deal';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
    lender: normalizeLender(r['Funder'] || ''),
    productType: normalizeProductType(r['Product Type'] || '', dealTypeRaw),
    dealType: normalizeDealType(dealTypeRaw),
    funded: isFunded,
    funding: amt,
    fundedAmount: isFunded ? amt : 0
  };
}

function matchesMulti(field, dealVal, selected) {
  if (!selected || !selected.length) return true;
  if (!dealVal) return false;
  let dv = field === 'state' ? normState(dealVal) : normStr(dealVal);
  return selected.some(function (v) {
    return field === 'state' ? normState(v) === dv : normStr(v) === dv;
  });
}

function inFundingRange(row, filters) {
  if (filters.fundingMin == null && filters.fundingMax == null) return true;
  if (!row.funded) return false;
  let f = row.fundedAmount || 0;
  if (filters.fundingMin != null && f < filters.fundingMin) return false;
  if (filters.fundingMax != null && f > filters.fundingMax) return false;
  return true;
}

function dateRangeBounds(dateRange, customFrom, customTo) {
  let now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  let start, end;
  switch (dateRange) {
    case 'ytd':
      start = new Date(y, 0, 1);
      end = new Date(y, m, now.getDate(), 23, 59, 59);
      break;
    case 'all_time':
      return null;
    case 'custom':
      start = customFrom ? parseDate(customFrom) : null;
      end = customTo ? parseDate(customTo) : null;
      if (end) end.setHours(23, 59, 59, 999);
      if (!start && !end) return null;
      return { start, end };
    default:
      start = new Date(y, 0, 1);
      end = new Date(y, m, now.getDate(), 23, 59, 59);
  }
  return { start, end };
}

function inDateRange(row, dateRange, customFrom, customTo) {
  let bounds = dateRangeBounds(dateRange, customFrom, customTo);
  if (!bounds) return true;
  if (!row.dateApplied) return false;
  if (bounds.start && row.dateApplied < bounds.start) return false;
  if (bounds.end && row.dateApplied > bounds.end) return false;
  return true;
}

function applyFilters(rows, filters, exceptKey) {
  return rows.filter(function (d) {
    if (!inDateRange(d, filters.dateRange, filters.customFrom, filters.customTo)) return false;
    if (exceptKey !== 'leadSource' && !matchesMulti('leadSource', d.leadSource, filters.leadSource)) return false;
    if (exceptKey !== 'marketingAssist' && !matchesMulti('marketingAssist', d.marketingAssist, filters.marketingAssist)) return false;
    if (exceptKey !== 'state' && !matchesMulti('state', d.state, filters.state)) return false;
    if (exceptKey !== 'lender' && !matchesMulti('lender', d.lender, filters.lender)) return false;
    if (exceptKey !== 'productType' && !matchesMulti('productType', d.productType, filters.productType)) return false;
    if (exceptKey !== 'dealType' && !matchesMulti('dealType', d.dealType, filters.dealType)) return false;
    return true;
  });
}

function repInFundingRange(stat, filters) {
  if (filters.fundingMin == null && filters.fundingMax == null) return true;
  let f = stat.fundedAmt || 0;
  if (filters.fundingMin != null && f < filters.fundingMin) return false;
  if (filters.fundingMax != null && f > filters.fundingMax) return false;
  return true;
}

function rowData(m) { return m.raw || m; }

function computeStats(rows) {
  let byRep = {};
  rows.forEach(function (m) {
    let r = rowData(m);
    let rep = r['Puller'] || r['Packages in Process Owner'] || '';
    if (!rep || rep === 'House .' || rep === 'House') return;
    if (!byRep[rep]) byRep[rep] = { name: rep, apps: 0, approvals: 0, funded: 0, fundedAmt: 0, revenue: 0 };
    let stage = (r['Stage of Package'] || '').toLowerCase();
    let amt = parseFloat(String(r['Amount'] || '0').replace(/[$,]/g, '')) || 0;
    if (r['Date Applied'] || stage.indexOf('pack') > -1 || stage.indexOf('review') > -1 ||
        stage.indexOf('approv') > -1 || stage.indexOf('fund') > -1) byRep[rep].apps++;
    if (stage.indexOf('approv') > -1 || (stage.indexOf('fund') > -1 && stage.indexOf('decline') === -1)) byRep[rep].approvals++;
    if (stage.indexOf('fund') > -1 && stage.indexOf('decline') === -1) {
      byRep[rep].funded++;
      byRep[rep].fundedAmt += amt;
      let pts = parseFloat(r['Paid in Percentage'] || '0') || 0;
      if (pts > 0) byRep[rep].revenue += amt * (pts / 100);
    }
  });
  return Object.values(byRep);
}

function sumTotals(stats) {
  return stats.reduce((t, r) => ({
    apps: t.apps + r.apps, approvals: t.approvals + r.approvals,
    funded: t.funded + r.funded, fundedAmt: t.fundedAmt + r.fundedAmt, revenue: t.revenue + r.revenue
  }), { apps: 0, approvals: 0, funded: 0, fundedAmt: 0, revenue: 0 });
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
}

let baseFilters = {
  dateRange: 'all_time', customFrom: '', customTo: '',
  leadSource: [], marketingAssist: [], state: [],
  lender: [], productType: [], dealType: [],
  fundingMin: null, fundingMax: null
};

let text = await fetch('https://capmuse-data-882611632216.s3.amazonaws.com/pipeline.csv').then(r => r.text());
let rawRows = parseCSV(text);
let mapped = rawRows.map(mapPipelineRow);

let allTimeRows = applyFilters(mapped, baseFilters);
let ytdRows = applyFilters(mapped, { ...baseFilters, dateRange: 'ytd' });

console.log('raw rows', rawRows.length, 'all_time filtered', allTimeRows.length, 'ytd filtered', ytdRows.length);

assert(allTimeRows.length === mapped.length, 'all_time should include all mapped rows');
assert(ytdRows.length <= allTimeRows.length, 'YTD row count should be <= all_time');

let states = [...new Set(mapped.map(r => r.state).filter(Boolean))].sort();
if (states.length) {
  let testState = states[0];
  let stateRows = applyFilters(mapped, { ...baseFilters, state: [testState] });
  assert(stateRows.every(r => normState(r.state) === normState(testState)), 'state filter returns only matching state');
}

let allRepStats = computeStats(allTimeRows);
let fundedReps = allRepStats.filter(s => s.fundedAmt > 0);
let fundingFilters = { ...baseFilters, fundingMin: 100000, fundingMax: 500000 };
let fundingReps = computeStats(applyFilters(mapped, fundingFilters)).filter(s => repInFundingRange(s, fundingFilters));
assert(fundingReps.every(s => s.fundedAmt >= 100000 && s.fundedAmt <= 500000), 'rep total funded range 100k-500k');
assert(fundingReps.length < fundedReps.length, 'funded-total range should be a subset of funded reps');

let lenders = [...new Set(mapped.map(r => r.lender).filter(Boolean))];
if (lenders.length) {
  let lenderRows = applyFilters(mapped, { ...baseFilters, lender: [lenders[0]] });
  assert(lenderRows.every(r => normStr(r.lender) === normStr(lenders[0])), 'lender filter matches');
}

assert(applyFilters(mapped, { ...baseFilters, leadSource: [] }).length === allTimeRows.length, 'empty leadSource behaves as All');

let stats = computeStats(ytdRows);
stats.sort((a, b) => b.fundedAmt - a.fundedAmt);
let t = sumTotals(stats);

console.log('filter tests passed');
console.log('ytd totals', t);
console.log('top5 ytd', stats.slice(0, 5).map(r => ({ name: r.name, apps: r.apps, funded: r.funded, fundedAmt: Math.round(r.fundedAmt) })));
