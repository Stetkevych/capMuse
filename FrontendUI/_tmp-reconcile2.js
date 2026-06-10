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
    if (id) CSV_LOOKUP[id] = { packageOwner: (cols[idx['Package_Owner.name']] || '').trim(), funding: nn(cols[idx.Funded_Amount]) };
  }

  let extras = raw.filter(function (r) {
    let id = String(r.record_id || '');
    return !CSV_LOOKUP[id] && nn(r.funding) > 0 && (r.date_funded || r.Date_Funded) && (r.Stage || r.stage) === 'Qualification';
  });

  let byYear = {};
  extras.forEach(function (r) {
    let y = String(r.date_funded || '').slice(0, 4);
    if (!byYear[y]) byYear[y] = { c: 0, v: 0 };
    byYear[y].c++;
    byYear[y].v += nn(r.funding);
  });
  console.log('qual extras by funded year', byYear);

  let recent = extras.filter(function (r) {
    let created = r.created_time || '';
    return created.indexOf('2026-06') === 0;
  });
  console.log('qual extras created June 2026', recent.length, recent.reduce(function (s, r) { return s + nn(r.funding); }, 0));

  let old = extras.filter(function (r) {
    let created = r.created_time || '';
    return created.indexOf('2026-06') !== 0;
  });
  console.log('qual extras NOT june 2026 webhook', old.length, old.reduce(function (s, r) { return s + nn(r.funding); }, 0));
  old.slice(0, 8).forEach(function (r) {
    console.log(' old', r.date_funded, nn(r.funding), r.company, r.created_time);
  });
})();
