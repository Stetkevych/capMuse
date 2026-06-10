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
  let lines = csvText.split(/\r?\n/);
  let h = parseCsvLine(lines[0]);
  let idx = {};
  h.forEach(function (x, i) { idx[x] = i; });
  let csvIds = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    let cols = parseCsvLine(lines[i]);
    let id = (cols[idx.id] || '').trim();
    if (id) csvIds[id] = 1;
  }

  let extras = raw.filter(function (r) {
    let id = String(r.record_id || '');
    return id && !csvIds[id] && nn(r.funding) > 0 && (r.date_funded || r.Date_Funded);
  });
  let qual = extras.filter(function (r) { return (r.Stage || r.stage || '') === 'Qualification'; });
  let cw = extras.filter(function (r) { return (r.Stage || r.stage || '') === 'Closed Won'; });
  console.log('qual extras', qual.length, qual.reduce(function (s, r) { return s + nn(r.funding); }, 0).toFixed(2));
  console.log('cw extras', cw.length, cw.reduce(function (s, r) { return s + nn(r.funding); }, 0).toFixed(2));

  let base = raw.filter(function (r) {
    return csvIds[String(r.record_id || '')] && nn(r.funding) > 0 && (r.date_funded || r.Date_Funded);
  });
  let vol = base.reduce(function (s, r) { return s + nn(r.funding); }, 0) + qual.reduce(function (s, r) { return s + nn(r.funding); }, 0);
  console.log('TARGET total csv+qual extras', base.length + qual.length, vol.toFixed(2));
  console.log('USER TARGET', 9807, 517551773.67);
})();
