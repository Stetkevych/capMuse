function splitRow(line) {
  let result = [], cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    let c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  let lines = [], current = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === '\n' && !inQuotes) { lines.push(current.replace(/\r$/, '')); current = ''; }
    else current += ch;
  }
  if (current.trim()) lines.push(current.replace(/\r$/, ''));
  if (lines.length < 2) return [];
  let headers = splitRow(lines[0]), rows = [];
  for (let j = 1; j < lines.length; j++) {
    if (!lines[j].trim()) continue;
    let vals = splitRow(lines[j]);
    let obj = {};
    for (let k = 0; k < headers.length; k++) obj[headers[k]] = vals[k] || '';
    rows.push(obj);
  }
  return rows;
}

function computeStats(rows) {
  let byRep = {};
  rows.forEach(function (r) {
    let rep = r['Puller'] || r['Packages in Process Owner'] || '';
    if (!rep || rep === 'House .' || rep === 'House') return;
    if (!byRep[rep]) byRep[rep] = { name: rep, apps: 0, approvals: 0, funded: 0, fundedAmt: 0, revenue: 0 };
    let stage = (r['Stage of Package'] || '').toLowerCase();
    let amt = parseFloat(String(r['Amount'] || '0').replace(/[$,]/g, '')) || 0;
    if (r['Date Applied'] || stage.indexOf('pack') > -1 || stage.indexOf('review') > -1 ||
        stage.indexOf('approv') > -1 || stage.indexOf('fund') > -1) byRep[rep].apps++;
    if (stage.indexOf('approv') > -1 || (stage.indexOf('fund') > -1 && stage.indexOf('decline') === -1)) byRep[rep].approvals++;
    if (stage.indexOf('fund') > -1 && stage.indexOf('decline') === -1) {
      byRep[rep].funded++;
      byRep[rep].fundedAmt += amt;
      let pts = parseFloat(r['Paid in Percentage'] || '0') || 0;
      if (pts > 0) byRep[rep].revenue += amt * (pts / 100);
    }
  });
  return Object.values(byRep);
}

let text = await fetch('https://capmuse-data-882611632216.s3.amazonaws.com/pipeline.csv').then(r => r.text());
let rows = parseCSV(text);
let stats = computeStats(rows);
stats.sort((a, b) => b.fundedAmt - a.fundedAmt);
let t = stats.reduce((t, r) => ({
  apps: t.apps + r.apps, approvals: t.approvals + r.approvals,
  funded: t.funded + r.funded, fundedAmt: t.fundedAmt + r.fundedAmt, revenue: t.revenue + r.revenue
}), { apps: 0, approvals: 0, funded: 0, fundedAmt: 0, revenue: 0 });

console.log('raw rows', rows.length, 'reps', stats.length);
console.log('totals', t);
console.log('top5', stats.slice(0, 5).map(r => ({ name: r.name, apps: r.apps, funded: r.funded, fundedAmt: Math.round(r.fundedAmt) })));
