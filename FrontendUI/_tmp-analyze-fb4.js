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

let fixes = {
  '3793076000601237337': 'House .',
  '3793076000605384128': 'House .',
  '3793076000606189343': 'House .',
  '3793076000624144182': 'House .',
  '3793076000649034499': 'House .'
};

function packageOwnerFromRecord(r) {
  let recordId = String(r.record_id || r.id || '');
  if (fixes[recordId]) return fixes[recordId];
  let fromLookup = (r['Package_Owner.name'] || (r.Package_Owner && r.Package_Owner.name) || r.package_owner_name || '').trim();
  if (fromLookup) return fromLookup;
  let flat = (r.package_owner || '').trim();
  let puller = (r.puller || r.Puller || r['Puller.name'] || '').trim();
  let fbOwner = (r.funding_book_owner || r.Funding_Book_Owner || r['Funding_Book_Owner.name'] || r.Owner || r['Owner.name'] || '').trim();
  if (flat && puller && flat.toLowerCase() === puller.toLowerCase() && fbOwner && fbOwner.toLowerCase().replace(/\./g, '').trim() === 'house') return fbOwner;
  return flat;
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
    let id = (cols[idx.id] || cols[idx.record_id] || '').trim();
    if (id) csvIds[id] = 1;
  }

  function eligible(r) {
    let id = String(r.record_id || r.id || '').trim();
    if (!csvIds[id]) return false;
    if (!(r.company || r.Deal_Name)) return false;
    if (nn(r.funding || r.Funded_Amount) <= 0) return false;
    if (!(r.date_funded || r.Date_Funded)) return false;
    return true;
  }

  let deals = raw.filter(eligible);
  let vol = deals.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0);
  console.log('csv allowlist eligible', deals.length, vol.toFixed(2));

  let mat = deals.filter(function (r) { return packageOwnerFromRecord(r) === 'Matthew Birnholz'; });
  console.log('matthew full po logic', mat.length, mat.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0).toFixed(2));

  // csv matthew directly
  let matCsv = 0, matCsvC = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    let cols = parseCsvLine(lines[i]);
    let owner = (cols[idx['Package_Owner.name']] || cols[idx.Package_Owner] || cols[idx.package_owner] || '').trim();
    let f = nn(cols[idx.Funded_Amount] || cols[idx.funding] || cols[idx.Amount]);
    let df = cols[idx.Date_Funded] || '';
    if (owner === 'Matthew Birnholz' && f > 0 && df) { matCsv += f; matCsvC++; }
  }
  console.log('matthew csv direct', matCsvC, matCsv.toFixed(2));

  // Try: csv allowlist OR (closed won and not in qual) - no that's wrong

  // Exclude qualification stage from all deals (not just extras)
  let noQual = raw.filter(function (r) {
    if (!(r.company || r.Deal_Name)) return false;
    if (nn(r.funding || r.Funded_Amount) <= 0) return false;
    if (!(r.date_funded || r.Date_Funded)) return false;
    if (!packageOwnerFromRecord(r)) return false;
    let st = (r.Stage || r.stage || r.Stage_of_Package || '').trim();
    if (st === 'Qualification') return false;
    return true;
  });
  console.log('no qual all json', noQual.length, noQual.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0).toFixed(2));

  let mat2 = noQual.filter(function (r) { return packageOwnerFromRecord(r) === 'Matthew Birnholz'; });
  console.log('matthew no qual', mat2.length, mat2.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0).toFixed(2));

  // csv allowlist + exclude qual
  let csvNoQual = deals.filter(function (r) {
    return (r.Stage || r.stage || r.Stage_of_Package || '').trim() !== 'Qualification';
  });
  console.log('csv allowlist no qual', csvNoQual.length, csvNoQual.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0).toFixed(2));

  // intersection: in csv AND (closed won OR stage empty from csv era)
  let csvClosed = deals.filter(function (r) {
    let st = (r.Stage || r.stage || r.Stage_of_Package || '').trim();
    return st === 'Closed Won' || st === 'Value Proposition' || st === '';
  });
  console.log('csv allow closed/value', csvClosed.length, csvClosed.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0).toFixed(2));
})();
