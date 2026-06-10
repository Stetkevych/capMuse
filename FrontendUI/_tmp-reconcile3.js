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

(async function () {
  let [jsonText, csvText] = await Promise.all([
    fetch('https://capmuse-data-882611632216.s3.amazonaws.com/funding_book_live.json'),
    fetch('https://capmuse-data-882611632216.s3.amazonaws.com/funding_book.csv')
  ]);
  let raw = JSON.parse(jsonText);
  let CSV = {};
  let lines = csvText.split(/\r?\n/);
  let h = parseCsvLine(lines[0]);
  let idx = {};
  h.forEach(function (x, i) { idx[x] = i; });
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    let cols = parseCsvLine(lines[i]);
    let id = (cols[idx.id] || '').trim();
    if (!id) continue;
    CSV[id] = { owner: (cols[idx['Package_Owner.name']] || '').trim(), funding: nn(cols[idx.Funded_Amount]) };
  }

  function inScope(r) {
    if (!(r.company || r.Deal_Name) || nn(r.funding) <= 0 || !(r.date_funded || r.Date_Funded)) return false;
    let id = String(r.record_id || '');
    if (CSV[id]) return true;
    return (r.Stage || r.stage) === 'Qualification';
  }
  function owner(r) {
    let id = String(r.record_id || '');
    return (CSV[id] && CSV[id].owner) || (r['Package_Owner.name'] || r.package_owner || '').trim();
  }

  ['Careem Roberts', 'Ken Pflug', 'Michael Cifuentes'].forEach(function (rep) {
    let deals = raw.filter(function (r) { return inScope(r) && owner(r) === rep; });
    let jsonVol = 0, csvVol = 0, qualVol = 0, qualC = 0;
    deals.forEach(function (r) {
      let id = String(r.record_id || '');
      let jf = nn(r.funding);
      jsonVol += jf;
      if (!CSV[id]) { qualVol += jf; qualC++; }
      else csvVol += CSV[id].funding;
    });
    console.log(rep, 'deals', deals.length, 'jsonVol', jsonVol.toFixed(2), 'csvVol', csvVol.toFixed(2), 'qual', qualC, qualVol.toFixed(2), 'json-csv on csv ids', (jsonVol - qualVol - csvVol).toFixed(2));
  });
})();
