// capmuse-pipeline.js — Load pipeline.csv from S3, compute rep stats, render table
(function () {
  'use strict';
  var BUCKET = 'https://capmuse-data-882611632216.s3.amazonaws.com';
  var CSV_FILE = '/pipeline.csv';

  function parseCSV(text) {
    var lines = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === '\n' && !inQuotes) { lines.push(current.replace(/\r$/, '')); current = ''; }
      else { current += ch; }
    }
    if (current.trim()) lines.push(current.replace(/\r$/, ''));
    if (lines.length < 2) return [];
    var headers = splitRow(lines[0]);
    var rows = [];
    for (var j = 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      var vals = splitRow(lines[j]);
      var obj = {};
      for (var k = 0; k < headers.length; k++) { obj[headers[k]] = vals[k] || ''; }
      rows.push(obj);
    }
    return rows;
  }

  function splitRow(line) {
    var result = [];
    var cur = '';
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    result.push(cur.trim());
    return result;
  }

  function fmt(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
    return '$' + Math.round(n).toLocaleString();
  }

  function pct(num, den) { return den > 0 ? (num / den * 100).toFixed(1) + '%' : '0.0%'; }

  function computeStats(rows) {
    var byRep = {};
    rows.forEach(function (r) {
      var rep = r['Puller'] || r['Packages in Process Owner'] || '';
      if (!rep || rep === 'House .' || rep === 'House') return;
      if (!byRep[rep]) byRep[rep] = { name: rep, calls: 0, apps: 0, approvals: 0, funded: 0, fundedAmt: 0, points: [], amounts: [], revenue: 0 };
      var stage = (r['Stage of Package'] || '').toLowerCase();
      var amt = parseFloat(String(r['Amount'] || '0').replace(/[$,]/g, '')) || 0;
      var touches = parseInt(r['Touches'] || '0') || 0;
      var disp = r['Disposition'] || '';

      // Calls
      byRep[rep].calls += touches || (disp ? 1 : 0);

      // Apps
      if (r['Date Applied'] || stage.indexOf('pack') > -1 || stage.indexOf('review') > -1 || stage.indexOf('approv') > -1 || stage.indexOf('fund') > -1) {
        byRep[rep].apps++;
      }

      // Approvals
      if (stage.indexOf('approv') > -1 || (stage.indexOf('fund') > -1 && stage.indexOf('decline') === -1)) {
        byRep[rep].approvals++;
      }

      // Funded
      if (stage.indexOf('fund') > -1 && stage.indexOf('decline') === -1) {
        byRep[rep].funded++;
        byRep[rep].fundedAmt += amt;
        byRep[rep].amounts.push(amt);
        var pts = parseFloat(r['Paid in Percentage'] || '0') || 0;
        if (pts > 0) {
          byRep[rep].points.push(pts);
          byRep[rep].revenue += amt * (pts / 100);
        }
      }
    });

    var arr = Object.keys(byRep).map(function (k) { return byRep[k]; });
    arr.forEach(function (r) {
      r.callsToApps = pct(r.apps, r.calls);
      r.appsToApprovals = pct(r.approvals, r.apps);
      r.approvalToFunding = pct(r.funded, r.approvals);
      r.avgPoints = r.points.length > 0 ? (r.points.reduce(function (s, v) { return s + v; }, 0) / r.points.length).toFixed(2) + '%' : '—';
      r.avgAmount = r.amounts.length > 0 ? fmt(Math.round(r.amounts.reduce(function (s, v) { return s + v; }, 0) / r.amounts.length)) : '—';
    });

    arr.sort(function (a, b) { return b.fundedAmt - a.fundedAmt; });
    return arr;
  }

  function renderKPIs(stats) {
    var totals = stats.reduce(function (t, r) {
      t.calls += r.calls; t.apps += r.apps; t.approvals += r.approvals;
      t.funded += r.funded; t.fundedAmt += r.fundedAmt; t.revenue += r.revenue;
      return t;
    }, { calls: 0, apps: 0, approvals: 0, funded: 0, fundedAmt: 0, revenue: 0 });

    var el = function (id) { return document.getElementById(id); };
    if (el('kpiCalls')) el('kpiCalls').textContent = totals.calls.toLocaleString();
    if (el('kpiApps')) el('kpiApps').textContent = totals.apps.toLocaleString();
    if (el('kpiApprovals')) el('kpiApprovals').textContent = totals.approvals.toLocaleString();
    if (el('kpiFunded')) el('kpiFunded').textContent = totals.funded.toLocaleString();
    if (el('kpiFundedAmt')) el('kpiFundedAmt').textContent = fmt(totals.fundedAmt);
    if (el('kpiRevenue')) el('kpiRevenue').textContent = fmt(totals.revenue);
    if (el('kpiRecords')) el('kpiRecords').textContent = totals.apps.toLocaleString() + ' records';
  }

  function renderTable(stats) {
    var tbody = document.getElementById('pipelineTableBody');
    if (!tbody) return;
    var html = '';
    stats.forEach(function (r, i) {
      var isTop = i === 0 ? ' class="fb-row-top"' : '';
      html += '<tr' + isTop + '>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><span class="fb-rep-name">' + r.name + '</span></td>' +
        '<td>' + r.calls.toLocaleString() + '</td>' +
        '<td>' + r.apps.toLocaleString() + '</td>' +
        '<td>' + r.callsToApps + '</td>' +
        '<td>' + r.approvals.toLocaleString() + '</td>' +
        '<td>' + r.appsToApprovals + '</td>' +
        '<td>' + r.funded.toLocaleString() + '</td>' +
        '<td>' + r.approvalToFunding + '</td>' +
        '<td><span class="fb-money">' + fmt(r.fundedAmt) + '</span></td>' +
        '<td>' + r.avgPoints + '</td>' +
        '<td>' + r.avgAmount + '</td>' +
        '<td><span class="fb-money" style="color:var(--blue)">' + fmt(r.revenue) + '</span></td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  function init() {
    fetch(BUCKET + CSV_FILE)
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (text) {
        if (!text) { console.warn('[Pipeline] No data'); return; }
        var rows = parseCSV(text);
        console.log('[Pipeline] Loaded ' + rows.length + ' records');
        var stats = computeStats(rows);
        renderKPIs(stats);
        renderTable(stats);
      })
      .catch(function (err) { console.error('[Pipeline] Error:', err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
