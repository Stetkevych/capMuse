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
  for (let i = 0; i < line.length; i++) { let ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; } else cur += ch;
  } out.push(cur); return out;
}
const ZOHO = { 'Careem Roberts': 24333873.63, 'Ken Pflug': 98283872.50, 'Michael Cifuentes': 43431900.21 };

(async function () {
  let csvText = await fetch('https://capmuse-data-882611632216.s3.amazonaws.com/funding_book.csv');
  let lines = csvText.split(/\r?\n/);
  let h = parseCsvLine(lines[0]);
  let idx = {};
  h.forEach(function (x, i) { idx[x] = i; });
  Object.keys(ZOHO).forEach(function (rep) {
    let vol = 0, c = 0;
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      let cols = parseCsvLine(lines[i]);
      if ((cols[idx['Package_Owner.name']] || '') !== rep) continue;
      let f = nn(cols[idx.Funded_Amount]);
      if (f <= 0 || !(cols[idx.Date_Funded] || '')) continue;
      vol += f; c++;
    }
    console.log(rep, 'csv direct', c, vol.toFixed(2), 'zoho', ZOHO[rep].toFixed(2), 'diff', (vol - ZOHO[rep]).toFixed(2));
  });
})();
