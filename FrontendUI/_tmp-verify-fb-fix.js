// Verify funding book scope logic matches Zoho totals
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
    if (!id) continue;
    CSV_LOOKUP[id] = { packageOwner: (cols[idx['Package_Owner.name']] || '').trim() };
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
    let id = String(r.record_id || r.id || '');
    if (CSV_LOOKUP[id] && CSV_LOOKUP[id].packageOwner) return CSV_LOOKUP[id].packageOwner;
    return (r['Package_Owner.name'] || r.package_owner_name || r.package_owner || '').trim();
  }

  let deals = raw.filter(inScope);
  let vol = deals.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0);
  let mat = deals.filter(function (r) { return owner(r) === 'Matthew Birnholz'; });
  let matVol = mat.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0);
  console.log('deals', deals.length, 'vol', vol.toFixed(2));
  console.log('matthew', mat.length, matVol.toFixed(2));
  console.log('expected', 9807, 517551773.67);
})();
