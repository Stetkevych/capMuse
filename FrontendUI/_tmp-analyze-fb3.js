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
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    let cols = parseCsvLine(lines[i]);
    let id = (cols[idx.id] || cols[idx.record_id] || '').trim();
    if (id) csvIds[id] = 1;
  }

  let extras = raw.filter(function (r) {
    let id = String(r.record_id || r.id || '').trim();
    return id && !csvIds[id] && nn(r.funding || r.Funded_Amount) > 0;
  });

  console.log('extra funded records', extras.length);
  console.log('sample', extras.slice(0, 5).map(function (r) {
    return {
      id: r.record_id,
      company: r.company,
      funding: r.funding,
      stage: r.Stage || r.stage,
      owner: r['Package_Owner.name'] || r.package_owner,
      date: r.date_funded,
      created: r.created_time
    };
  }));

  // Try filter: must have date_funded AND package owner AND not qualification
  function po(r) {
    return (r['Package_Owner.name'] || r.package_owner_name || r.package_owner || '').trim();
  }
  function stage(r) { return (r.Stage || r.stage || r.Stage_of_Package || '').trim(); }

  let filtered = raw.filter(function (r) {
    if (!(r.company || r.Deal_Name)) return false;
    let f = nn(r.funding || r.Funded_Amount);
    if (f <= 0) return false;
    if (!(r.date_funded || r.Date_Funded)) return false;
    if (!po(r)) return false;
    if (stage(r) === 'Qualification') return false;
    if (csvIds[String(r.record_id || r.id || '')]) return true;
    return false;
  });
  let fv = filtered.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0);
  console.log('csv allowlist only', filtered.length, fv.toFixed(2));

  // csv allowlist + json updates for amounts on same ids
  // What if zoho uses Funded_Amount from a different field - check Total_rev confusion

  // Exclude extras: not in csv
  let noExtras = raw.filter(function (r) {
    let id = String(r.record_id || r.id || '').trim();
    return (r.company || r.Deal_Name) && nn(r.funding || r.Funded_Amount) > 0 && (r.date_funded || r.Date_Funded) && csvIds[id];
  });
  console.log('no extras', noExtras.length, noExtras.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0).toFixed(2));

  // matthew no extras
  let mat = noExtras.filter(function (r) { return po(r) === 'Matthew Birnholz'; });
  console.log('matthew no extras', mat.length, mat.reduce(function (s, r) { return s + nn(r.funding || r.Funded_Amount); }, 0).toFixed(2));
})();
