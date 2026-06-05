const fs = require('fs');
let d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html','utf8');

// Remove old injected router script if present
const oldRouterIdx = d.indexOf('/* === CAPMUSE ROUTER');
if (oldRouterIdx > -1) {
  const scriptBefore = d.lastIndexOf('<script>', oldRouterIdx);
  const scriptAfter = d.indexOf('</script>', oldRouterIdx) + 9;
  d = d.substring(0, scriptBefore) + d.substring(scriptAfter);
}

// Also remove old S3 load script
const oldS3Idx = d.indexOf('/* ─── Load real data from S3');
if (oldS3Idx > -1) {
  const s3Before = d.lastIndexOf('<script>', oldS3Idx);
  const s3After = d.indexOf('</script>', oldS3Idx) + 9;
  d = d.substring(0, s3Before) + d.substring(s3After);
}

// New comprehensive script
const newScript = `
<script>
/* === CAPMUSE DATA ENGINE v2 === */
(function() {
  const BUCKET = 'https://capmuse-data-882611632216.s3.amazonaws.com';
  let DATA = [];
  const mainContent = document.getElementById('mainContent');
  const originalHTML = mainContent ? mainContent.innerHTML : '';

  // Robust CSV parser
  function parseCSV(text) {
    const lines = []; let cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === '\\n' && !inQ) { lines.push(cur); cur = ''; continue; }
      if (ch === '\\r' && !inQ) continue;
      cur += ch;
    }
    if (cur.trim()) lines.push(cur);
    if (lines.length < 2) return [];

    const headers = splitRow(lines[0]);
    const colMap = {};
    headers.forEach((h, i) => { colMap[h] = i; });

    return lines.slice(1).filter(l => l.trim()).map(line => {
      const vals = splitRow(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    });
  }

  function splitRow(line) {
    const result = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { result.push(cur); cur = ''; continue; }
      cur += ch;
    }
    result.push(cur);
    return result;
  }

  function fmt(n) {
    if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(0) + 'K';
    return Math.round(n).toLocaleString();
  }

  function getInitials(name) {
    return (name||'').split(' ').map(w=>(w[0]||'')).join('').substring(0,2).toUpperCase();
  }

  function getStageChip(stage) {
    const s = (stage||'').toLowerCase();
    if (s.includes('fund') && !s.includes('decline')) return ['chip-green', 'Funded'];
    if (s.includes('approv') || s.includes('qualified')) return ['chip-blue', 'Approved'];
    if (s.includes('submitted') || s.includes('uw') || s.includes('review')) return ['chip-blue', 'In Review'];
    if (s.includes('decline') || s.includes('lost')) return ['chip-gray', 'Declined'];
    if (s.includes('default') || s.includes('fraud')) return ['chip-gray', 'Default'];
    return ['chip-gray', stage ? stage.substring(0,12) : 'Pending'];
  }

  // Load and parse
  fetch(BUCKET + '/Accounts.csv')
    .then(r => r.ok ? r.text() : null)
    .then(text => {
      if (!text) { console.log('[CapMuse] No CSV found'); return; }
      const raw = parseCSV(text);

      DATA = raw.map(r => ({
        name: r.Account_Name || r.DBA || r.Business_Legal_Name || '',
        stage: r.Stage_of_Package || '',
        amount: parseFloat(String(r.Amount || '').replace(/[\\$,]/g, '')) || 0,
        funded_date: r.Date_Funded || '',
        applied: r.Date_Applied || r.Created_Time || '',
        rep: r.First_Name || '',
        lender: r.Funder_2 || '',
        source: r.Lead_Source || r.Original_Lead_Source || '',
        industry: r.Industry || r.I_Stated_Industry || '',
        state: r.State || r.Business_State || '',
        revenue: parseFloat(String(r.Monthly_Revenue || r.Monthly_Revenue1 || '').replace(/[\\$,]/g, '')) || 0,
        credit: r.Credit_Score || '',
      })).filter(d => d.name && d.name !== 'False');

      const funded = DATA.filter(d => {
        const s = d.stage.toLowerCase();
        return (s.includes('fund') || s === 'funded-other' || s === 'future funding') && !s.includes('decline');
      });
      const totalVol = funded.reduce((s, d) => s + d.amount, 0);
      const rate = DATA.length ? Math.round(funded.length / DATA.length * 100) : 0;

      console.log('[CapMuse] Loaded ' + DATA.length + ' accounts | ' + funded.length + ' funded | $' + fmt(totalVol));

      // === UPDATE DASHBOARD STATS ===

      // Update featured metric card
      const featuredMetric = document.querySelector('.featured-metric');
      if (featuredMetric) {
        featuredMetric.textContent = '$' + fmt(totalVol);
      }
      const featuredLabel = document.querySelector('.featured-label');
      if (featuredLabel) {
        featuredLabel.textContent = funded.length.toLocaleString() + ' Funded Deals — Total Portfolio Volume';
      }
      const featuredTags = document.querySelector('.featured-tags');
      if (featuredTags) {
        featuredTags.innerHTML = '<span class="featured-tag">' + DATA.length.toLocaleString() + ' Total Accounts</span><span class="featured-tag">' + rate + '% Fund Rate</span><span class="featured-tag">' + funded.length + ' Funded</span>';
      }

      // Update pipeline table with real top deals
      const tbody = document.querySelector('.pipeline-table tbody');
      if (tbody) {
        const topDeals = funded.filter(d=>d.amount>0).sort((a,b)=>b.amount-a.amount).slice(0, 10);
        tbody.innerHTML = topDeals.map((d, i) => {
          const [chipClass, chipLabel] = getStageChip(d.stage);
          return '<tr><td>' + (i+1) + '</td><td><div class="biz-cell"><div class="biz-dot" style="background:linear-gradient(135deg,#2563EB,#10B981)">' + getInitials(d.name) + '</div><span class="biz-cell-name">' + d.name.substring(0,22) + '</span></div></td><td>$' + fmt(d.amount) + '</td><td>' + (d.rep || '—') + '</td><td><span class="status-chip ' + chipClass + '">' + chipLabel + '</span></td></tr>';
        }).join('');
      }

      // Update stat cards - find all elements with dollar amounts and percentages
      const allElements = document.querySelectorAll('.stat-card, .card-headline, .card-value, .card-stat');

      // Update the rep leaderboard values if they exist
      const repStats = document.querySelectorAll('.rep-stat-value');
      if (repStats.length >= 2) {
        repStats[0].textContent = '$' + fmt(totalVol / Math.max(funded.length, 1));
        repStats[1].textContent = rate + '%';
      }

      // Render initial page
      renderPage('dashboard');
    })
    .catch(e => { console.log('[CapMuse] Fetch error:', e.message); });

  // === NAV ROUTING ===
  document.querySelectorAll('.nav-sub-item, .nav-item, .nav-box-item, [data-page]').forEach(el => {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      const page = this.getAttribute('data-page') || this.textContent.trim().split('\\n')[0].trim().toLowerCase().replace(/[^a-z]/g, '');
      document.querySelectorAll('.nav-sub-item, .nav-item').forEach(n => n.classList.remove('active'));
      this.classList.add('active');
      renderPage(page);
    });
  });

  function renderPage(page) {
    if (!DATA.length || !mainContent) return;

    const funded = DATA.filter(d => {
      const s = d.stage.toLowerCase();
      return (s.includes('fund') || s === 'funded-other') && !s.includes('decline');
    });

    if (page === 'dashboard') {
      mainContent.innerHTML = originalHTML;
      // Re-run stat updates on restored HTML
      const tbody2 = document.querySelector('.pipeline-table tbody');
      if (tbody2) {
        const topDeals = funded.filter(d=>d.amount>0).sort((a,b)=>b.amount-a.amount).slice(0,10);
        tbody2.innerHTML = topDeals.map((d,i) => {
          const [cc,cl] = getStageChip(d.stage);
          return '<tr><td>'+(i+1)+'</td><td><div class="biz-cell"><div class="biz-dot" style="background:linear-gradient(135deg,#2563EB,#10B981)">'+getInitials(d.name)+'</div><span class="biz-cell-name">'+d.name.substring(0,22)+'</span></div></td><td>$'+fmt(d.amount)+'</td><td>'+(d.rep||'—')+'</td><td><span class="status-chip '+cc+'">'+cl+'</span></td></tr>';
        }).join('');
      }
      const fm = document.querySelector('.featured-metric');
      if(fm) fm.textContent = '$' + fmt(funded.reduce((s,d)=>s+d.amount,0));
      const fl = document.querySelector('.featured-label');
      if(fl) fl.textContent = funded.length.toLocaleString() + ' Funded Deals — Total Portfolio Volume';
      const ft = document.querySelector('.featured-tags');
      if(ft) ft.innerHTML = '<span class="featured-tag">'+DATA.length.toLocaleString()+' Accounts</span><span class="featured-tag">'+Math.round(funded.length/DATA.length*100)+'% Rate</span><span class="featured-tag">'+funded.length+' Funded</span>';
      return;
    }

    if (page === 'applications') { renderTableView('Applications Pipeline', DATA, ['name','stage','amount','rep','applied']); return; }
    if (page === 'businesses') { renderTableView('All Businesses', DATA.filter(d=>d.name!=='False'), ['name','industry','state','revenue','stage']); return; }
    if (page === 'funding') { renderTableView('Funded Deals', funded.sort((a,b)=>b.amount-a.amount), ['name','amount','lender','rep','funded_date']); return; }
    if (page === 'statements' || page === 'reports') { renderTableView('Revenue Report', DATA.filter(d=>d.revenue>0).sort((a,b)=>b.revenue-a.revenue), ['name','revenue','industry','state','stage']); return; }
    if (page === 'topfunded') { renderTableView('Top Funded Deals', funded.sort((a,b)=>b.amount-a.amount), ['name','amount','lender','rep','funded_date']); return; }
    if (page === 'fastestgrowing' || page === 'fastest') { renderTableView('Recently Applied', [...DATA].filter(d=>d.applied).sort((a,b)=>new Date(b.applied)-new Date(a.applied)), ['name','applied','stage','rep','source']); return; }
    if (page === 'mostapplications' || page === 'mostapps') {
      const bySource = {};
      DATA.forEach(d => { const s=d.source||'Unknown'; bySource[s]=(bySource[s]||0)+1; });
      const sources = Object.entries(bySource).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,stage:count+' apps',amount:0,rep:'',applied:'',funded_date:'',lender:'',source:'',industry:'',state:'',revenue:0}));
      renderTableView('Applications by Source', sources, ['name','stage']);
      return;
    }
    if (page === 'alerts') { renderTableView('Declined / Lost', DATA.filter(d=>d.stage.toLowerCase().includes('decline')||d.stage.toLowerCase().includes('lost')), ['name','stage','rep','applied','source']); return; }

    renderTableView(page, DATA.slice(0,30), ['name','stage','amount','rep']);
  }

  function renderTableView(title, rows, cols) {
    const labels = {name:'Business',stage:'Stage',amount:'Amount',rep:'Rep',applied:'Applied',funded_date:'Funded',lender:'Lender',source:'Source',industry:'Industry',state:'State',revenue:'Revenue'};
    const totalAmt = rows.reduce((s,d)=>s+(d.amount||0),0);
    const summary = totalAmt > 0 ? ' — $' + fmt(totalAmt) + ' total' : '';

    mainContent.innerHTML = '<div style="padding:0"><h2 style="font-size:18px;font-weight:700;margin-bottom:6px;color:var(--text-primary)">' + title + '</h2><p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">' + rows.length.toLocaleString() + ' records' + summary + '</p><div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;max-height:70vh;overflow-y:auto"><table class="pipeline-table" style="width:100%"><thead><tr><th style="text-align:left;padding-left:14px">#</th>' + cols.map(c=>'<th style="text-align:'+(c==='amount'||c==='revenue'?'right':'left')+'">'+labels[c]+'</th>').join('') + '</tr></thead><tbody>' + rows.slice(0,100).map((d,i) => {
      return '<tr><td style="padding-left:14px">'+(i+1)+'</td>' + cols.map(c => {
        if (c==='name') return '<td style="text-align:left"><div class="biz-cell"><div class="biz-dot" style="background:linear-gradient(135deg,#2563EB,#10B981)">'+getInitials(d.name)+'</div><span class="biz-cell-name">'+(d.name||'').substring(0,28)+'</span></div></td>';
        if (c==='amount') return '<td style="text-align:right">'+(d.amount?'$'+fmt(d.amount):'—')+'</td>';
        if (c==='revenue') return '<td style="text-align:right">'+(d.revenue?'$'+fmt(d.revenue):'—')+'</td>';
        if (c==='stage') { const [cc,cl]=getStageChip(d.stage); return '<td><span class="status-chip '+cc+'">'+cl+'</span></td>'; }
        return '<td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(d[c]||'—').toString().substring(0,25)+'</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table></div></div>';
  }
})();
</script>`;

// Insert before </body>
d = d.replace('</body>', newScript + '\n</body>');
fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', d);
console.log('Done. File size:', d.length);
