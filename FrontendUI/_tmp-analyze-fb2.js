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
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
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
  let csvVol = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    let cols = parseCsvLine(lines[i]);
    let id = (cols[idx.id] || cols[idx.record_id] || '').trim();
    let f = nn(cols[idx.Funded_Amount] || cols[idx.funding] || cols[idx.Amount]);
    let df = cols[idx.Date_Funded] || '';
    if (!id || f <= 0 || !df) continue;
    csvIds[id] = f;
    csvVol += f;
  }

  let jsonIds = {};
  let jsonVol = 0;
  let jsonVolCsvIds = 0;
  let onlyJson = 0;
  let onlyJsonVol = 0;
  let inBoth = 0;
  let diffAmt = 0;

  raw.forEach(function (r) {
    let id = String(r.record_id || r.id || '').trim();
    let f = nn(r.funding || r.Funded_Amount);
    if (!id || f <= 0) return;
    jsonIds[id] = f;
    jsonVol += f;
    if (csvIds[id]) {
      inBoth++;
      jsonVolCsvIds += f;
      diffAmt += Math.abs(f - csvIds[id]);
    } else {
      onlyJson++;
      onlyJsonVol += f;
    }
  });

  let onlyCsv = 0;
  let onlyCsvVol = 0;
  Object.keys(csvIds).forEach(function (id) {
    if (!jsonIds[id]) { onlyCsv++; onlyCsvVol += csvIds[id]; }
  });

  console.log('csv funded ids', Object.keys(csvIds).length, csvVol.toFixed(2));
  console.log('json funded ids', Object.keys(jsonIds).length, jsonVol.toFixed(2));
  console.log('in both', inBoth, 'json vol on csv ids', jsonVolCsvIds.toFixed(2), 'amt diff sum', diffAmt.toFixed(2));
  console.log('only json', onlyJson, onlyJsonVol.toFixed(2));
  console.log('only csv', onlyCsv, onlyCsvVol.toFixed(2));

  // json records matching csv inclusion: funded>0, date, in csv
  let matchCsvRules = raw.filter(function (r) {
    let id = String(r.record_id || r.id || '').trim();
    return id && csvIds[id];
  });
  console.log('json rows in csv', matchCsvRules.length, matchCsvRules.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0).toFixed(2));

  // stage for only-json records
  let stages = {};
  raw.forEach(function (r) {
    let id = String(r.record_id || r.id || '').trim();
    let f = nn(r.funding || r.Funded_Amount);
    if (!id || f <= 0 || csvIds[id]) return;
    let st = (r.Stage || r.stage || r.Stage_of_Package || '(empty)').trim();
    if (!stages[st]) stages[st] = { c: 0, v: 0 };
    stages[st].c++;
    stages[st].v += f;
  });
  console.log('only-json stages', stages);
})();
