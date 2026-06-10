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

function parseDate(s) {
  if (!s) return null;
  let d = new Date(String(s).length === 10 ? String(s) + 'T12:00:00' : s);
  return isNaN(d.getTime()) ? null : d;
}

let fixes = {
  '3793076000601237337': 'House .',
  '3793076000605384128': 'House .',
  '3793076000606189343': 'House .',
  '3793076000624144182': 'House .',
  '3793076000649034499': 'House .'
};

function po(r) {
  let id = String(r.record_id || '');
  if (fixes[id]) return fixes[id];
  let fromLookup = (r['Package_Owner.name'] || (r.Package_Owner && r.Package_Owner.name) || r.package_owner_name || '').trim();
  if (fromLookup) return fromLookup;
  let flat = (r.package_owner || '').trim();
  let puller = (r.puller || r.Puller || r['Puller.name'] || '').trim();
  let fb = (r.funding_book_owner || r.Funding_Book_Owner || r['Funding_Book_Owner.name'] || r.Owner || r['Owner.name'] || '').trim();
  if (flat && puller && flat.toLowerCase() === puller.toLowerCase() && fb && fb.toLowerCase().replace(/\./g, '').trim() === 'house') return fb;
  return flat;
}

function stage(r) { return (r.Stage || r.stage || r.Stage_of_Package || '').trim(); }

function vol(arr) { return arr.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0); }

(async function () {
  let jsonText = await fetch('https://capmuse-data-882611632216.s3.amazonaws.com/funding_book_live.json');
  let raw = JSON.parse(jsonText);
  let base = raw.filter(function (r) {
    return (r.company || r.Deal_Name) && nn(r.funding || r.Funded_Amount) > 0 && parseDate(r.date_funded || r.Date_Funded);
  });

  let scenarios = [
    ['all funded+date', base],
    ['closed won', base.filter(function (r) { return stage(r) === 'Closed Won'; })],
    ['not qualification', base.filter(function (r) { return stage(r) !== 'Qualification'; })],
    ['closed won + not qual', base.filter(function (r) { return stage(r) === 'Closed Won' || stage(r) === 'Value Proposition'; })],
    ['has owner', base.filter(function (r) { return po(r); })],
    ['has owner not house', base.filter(function (r) { let n = po(r).toLowerCase().replace(/\./g, '').trim(); return n && n !== 'house'; })],
    ['has owner not house not qual', base.filter(function (r) { let n = po(r).toLowerCase().replace(/\./g, '').trim(); return n && n !== 'house' && stage(r) !== 'Qualification'; })],
    ['closed won has owner not house', base.filter(function (r) { let n = po(r).toLowerCase().replace(/\./g, '').trim(); return stage(r) === 'Closed Won' && n && n !== 'house'; })]
  ];

  scenarios.forEach(function (pair) {
    let arr = pair[1].filter(function (r) { return po(r); });
    console.log(pair[0], arr.length, vol(arr).toFixed(2));
  });

  let mat = base.filter(function (r) { return po(r) === 'Matthew Birnholz'; });
  console.log('matthew all', mat.length, vol(mat).toFixed(2));
  console.log('matthew not qual', mat.filter(function (r) { return stage(r) !== 'Qualification'; }).length,
    vol(mat.filter(function (r) { return stage(r) !== 'Qualification'; })).toFixed(2));

  try {
    let csvText = await fetch('https://capmuse-data-882611632216.s3.amazonaws.com/funding_book.csv');
    let lines = csvText.split(/\r?\n/);
    let h = parseCsvLine(lines[0]);
    let idx = {};
    h.forEach(function (x, i) { idx[x] = i; });
    let c = 0, v = 0, matc = 0, matv = 0;
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      let cols = parseCsvLine(lines[i]);
      let f = nn(cols[idx.Funded_Amount] || cols[idx.funding] || cols[idx.Amount]);
      if (f <= 0) continue;
      if (!(cols[idx.Date_Funded] || '')) continue;
      v += f; c++;
      let owner = (cols[idx['Package_Owner.name']] || cols[idx.Package_Owner] || cols[idx.package_owner] || '').trim();
      if (owner === 'Matthew Birnholz') { matv += f; matc++; }
    }
    console.log('csv', c, v.toFixed(2), 'matthew', matc, matv.toFixed(2));
  } catch (e) {
    console.log('csv error', e.message);
  }
})();
