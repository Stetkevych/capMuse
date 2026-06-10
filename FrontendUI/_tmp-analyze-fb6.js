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

function packageOwnerLookupOnly(r) {
  return (r['Package_Owner.name'] || (r.Package_Owner && r.Package_Owner.name) || r.package_owner_name || r.package_owner || '').trim();
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
  let csvOwner = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    let cols = parseCsvLine(lines[i]);
    let id = (cols[idx.id] || '').trim();
    if (!id) continue;
    csvIds[id] = 1;
    csvOwner[id] = (cols[idx['Package_Owner.name']] || cols[idx.Package_Owner] || cols[idx.package_owner] || '').trim();
  }

  function isEligible(r) {
    let id = String(r.record_id || r.id || '').trim();
    if (!(r.company || r.Deal_Name)) return false;
    if (nn(r.funding || r.Funded_Amount) <= 0) return false;
    if (!(r.date_funded || r.Date_Funded)) return false;
    if (csvIds[id]) return true;
    return (r.Stage || r.stage || '') === 'Qualification';
  }

  function ownerForRep(r) {
    let id = String(r.record_id || r.id || '').trim();
    if (csvOwner[id]) return csvOwner[id];
    return packageOwnerLookupOnly(r);
  }

  let deals = raw.filter(isEligible);
  let vol = deals.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0);
  console.log('eligible total', deals.length, vol.toFixed(2));

  let mat = deals.filter(function (r) { return ownerForRep(r) === 'Matthew Birnholz'; });
  console.log('matthew csv owner + lookup qual', mat.length, mat.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0).toFixed(2));

  let mat2 = deals.filter(function (r) { return packageOwnerFromRecord(r) === 'Matthew Birnholz'; });
  console.log('matthew full po logic', mat2.length, mat2.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0).toFixed(2));

  // deals where csv owner matthew but json po logic not matthew
  let stolen = deals.filter(function (r) {
    let id = String(r.record_id || '');
    return csvOwner[id] === 'Matthew Birnholz' && packageOwnerFromRecord(r) !== 'Matthew Birnholz';
  });
  console.log('stolen from matthew count', stolen.length, stolen.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0).toFixed(2));
  if (stolen[0]) console.log('sample stolen', stolen[0].record_id, stolen[0].company, packageOwnerFromRecord(stolen[0]), stolen[0]['Package_Owner.name'], stolen[0].package_owner, stolen[0].puller);
})();
