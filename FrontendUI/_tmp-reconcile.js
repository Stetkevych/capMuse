const https = require('https');

function fetch(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, function (r) {
      let d = '';
      r.on('data', function (c) { d += c; });
      r.on('end', function () { resolve(d); });
    }).on('error', reject);
  });
}

function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }

function parseCsvLine(line) {
  let out = [], cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    let ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const ZOHO = {
  'Ken Pflug': { vol: 98283872.50, count: 794 },
  'Matthew Birnholz': { vol: 95066102.90, count: 892 },
  'Michael Cifuentes': { vol: 43431900.21, count: 518 },
  'Kip Langat': { vol: 36890920.64, count: 781 },
  'Ivan Ortega': { vol: 32009736.07, count: 543 },
  'Careem Roberts': { vol: 24333873.63, count: 488 },
  'Erik Anderson': { vol: 20688425.01, count: 326 },
  _total: { vol: 517551773.67, count: 9807 }
};

(async function () {
  let [jsonText, csvText] = await Promise.all([
    fetch('https://capmuse-data-882611632216.s3.amazonaws.com/funding_book_live.json'),
    fetch('https://capmuse-data-882611632216.s3.amazonaws.com/funding_book.csv')
  ]);

  let raw = JSON.parse(jsonText);
  let CSV_LOOKUP = {};
  let lines = csvText.split(/\r?\n/);
  let h = parseCsvLine(lines[0]);
  let idx = {};
  h.forEach(function (x, i) { idx[x] = i; });

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    let cols = parseCsvLine(lines[i]);
    let id = (cols[idx.id] || '').trim();
    if (!id) continue;
    let f = nn(cols[idx.Funded_Amount]);
    let df = cols[idx.Date_Funded] || '';
    CSV_LOOKUP[id] = {
      packageOwner: (cols[idx['Package_Owner.name']] || '').trim(),
      funding: f,
      hasFunded: f > 0 && !!df
    };
  }

  function inScope(r) {
    if (!(r.company || r.Deal_Name)) return false;
    if (nn(r.funding || r.Funded_Amount) <= 0) return false;
    if (!(r.date_funded || r.Date_Funded)) return false;
    let id = String(r.record_id || r.id || '').trim();
    if (id && CSV_LOOKUP[id]) return true;
    return (r.Stage || r.stage || r.Stage_of_Package || '').trim() === 'Qualification';
  }

  function owner(r) {
    let id = String(r.record_id || r.id || '').trim();
    if (CSV_LOOKUP[id] && CSV_LOOKUP[id].packageOwner) return CSV_LOOKUP[id].packageOwner;
    return (r['Package_Owner.name'] || r.package_owner_name || r.package_owner || '').trim();
  }

  let deals = raw.filter(inScope);
  let byRep = {};
  deals.forEach(function (r) {
    let o = owner(r);
    if (!o) return;
    if (!byRep[o]) byRep[o] = { vol: 0, count: 0, jsonVol: 0, csvVol: 0, qualExtras: 0, amtDrift: 0 };
    let id = String(r.record_id || r.id || '').trim();
    let jf = nn(r.funding || r.Funded_Amount);
    let cf = CSV_LOOKUP[id] ? CSV_LOOKUP[id].funding : 0;
    byRep[o].vol += jf;
    byRep[o].jsonVol += jf;
    byRep[o].csvVol += cf;
    byRep[o].count += 1;
    if (!CSV_LOOKUP[id]) byRep[o].qualExtras += 1;
    else if (Math.abs(jf - cf) > 0.01) byRep[o].amtDrift += (jf - cf);
  });

  let totalVol = deals.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0);
  console.log('=== TOTALS ===');
  console.log('CapMuse logic:', deals.length, totalVol.toFixed(2));
  console.log('Zoho target:  ', ZOHO._total.count, ZOHO._total.vol.toFixed(2));
  console.log('Gap:', deals.length - ZOHO._total.count, 'deals,', (totalVol - ZOHO._total.vol).toFixed(2), 'USD');

  console.log('\n=== REP DIFFS (CapMuse vs Zoho) ===');
  Object.keys(ZOHO).forEach(function (name) {
    if (name === '_total') return;
    let z = ZOHO[name];
    let c = byRep[name] || { vol: 0, count: 0, qualExtras: 0, amtDrift: 0 };
    let dVol = c.vol - z.vol;
    let dCnt = c.count - z.count;
    if (Math.abs(dVol) > 1 || dCnt !== 0) {
      console.log(name + ':', 'vol diff', dVol.toFixed(2), 'count diff', dCnt,
        '| qual extras', c.qualExtras, '| json-csv drift on csv ids', c.amtDrift.toFixed(2));
    }
  });

  // Qual extras detail
  let qualExtras = deals.filter(function (r) {
    let id = String(r.record_id || r.id || '').trim();
    return !CSV_LOOKUP[id];
  });
  console.log('\n=== QUAL EXTRAS (not in CSV) ===', qualExtras.length, 'deals,',
    qualExtras.reduce(function (s, r) { return s + nn(r.funding); }, 0).toFixed(2));
  qualExtras.forEach(function (r) {
    console.log(' ', owner(r), nn(r.funding), r.company, r.date_funded, r.record_id);
  });

  // Amount drift on CSV records (json funding != csv funding)
  let driftDeals = [];
  deals.forEach(function (r) {
    let id = String(r.record_id || r.id || '').trim();
    if (!CSV_LOOKUP[id]) return;
    let jf = nn(r.funding || r.Funded_Amount);
    let cf = CSV_LOOKUP[id].funding;
    if (Math.abs(jf - cf) > 0.01) driftDeals.push({ id: id, owner: owner(r), jf: jf, cf: cf, diff: jf - cf, company: r.company });
  });
  console.log('\n=== JSON vs CSV AMOUNT DRIFT ===', driftDeals.length, 'records, sum diff',
    driftDeals.reduce(function (s, d) { return s + d.diff; }, 0).toFixed(2));
  driftDeals.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });
  driftDeals.slice(0, 15).forEach(function (d) {
    console.log(' ', d.owner, d.diff.toFixed(2), 'json', d.jf, 'csv', d.cf, d.company.substring(0, 40));
  });

  // Pure CSV totals (what CSV alone would give for zoho-eligible rows)
  let csvOnlyVol = 0, csvOnlyCount = 0;
  Object.keys(CSV_LOOKUP).forEach(function (id) {
    if (!CSV_LOOKUP[id].hasFunded) return;
    csvOnlyVol += CSV_LOOKUP[id].funding;
    csvOnlyCount++;
  });
  console.log('\n=== CSV ONLY (funded+date) ===', csvOnlyCount, csvOnlyVol.toFixed(2));
})();
