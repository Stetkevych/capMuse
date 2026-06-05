const fs = require('fs');

// Start fresh from the original dashboard
let d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', 'utf8');

// Remove ALL previously injected scripts (everything after the theme/sidebar/mobile script)
const lastOrigScript = d.indexOf('/* ─── Mobile sidebar ─── */');
const endOfOrigScript = d.indexOf('</script>', lastOrigScript) + 9;
const beforeBody = d.indexOf('</body>');
d = d.substring(0, endOfOrigScript) + '\n' + d.substring(beforeBody);

// Make sure mainContent id is on the content-grid
if (!d.includes('id="mainContent"')) {
  d = d.replace('class="content-grid">', 'class="content-grid" id="mainContent">');
}

// Add data-page to trending sub items
d = d.replace('>Top Funded</a>', ' data-page="topfunded">Top Funded</a>');
d = d.replace('>Fastest Growing</a>', ' data-page="fastest">Fastest Growing</a>');
d = d.replace('>Most Applications</a>', ' data-page="mostapps">Most Applications</a>');

// Inject the mega script
const megaScript = `
<script>
/* === CAPMUSE DATA ENGINE v3 — DUAL SOURCE === */
(function() {
  const BUCKET = 'https://capmuse-data-882611632216.s3.amazonaws.com';
  let ACCOUNTS = [];
  let DEALS = [];
  let mainContent, originalHTML;

  window.addEventListener('DOMContentLoaded', init);

  function init() {
    mainContent = document.getElementById('mainContent');
    originalHTML = mainContent ? mainContent.innerHTML : '';

    // Load both CSVs
    Promise.all([
      fetchCSV('Accounts.csv'),
      fetchCSV('funding_book.csv')
    ]).then(([accts, deals]) => {
      if (accts && accts.length) {
        ACCOUNTS = accts.map(r => ({
          name: r.Account_Name || r.DBA || r.Business_Legal_Name || '',
          stage: r.Stage_of_Package || '',
          amount: num(r.Amount),
          funded_date: r.Date_Funded || '',
          applied: r.Date_Applied || r.Created_Time || '',
          rep: r.First_Name || '',
          lender: r.Funder_2 || '',
          source: r.Lead_Source || r.Original_Lead_Source || r.Lead_Master || '',
          industry: r.Industry || r.I_Stated_Industry || '',
          state: r.State || r.Business_State || '',
          revenue: num(r.Monthly_Revenue || r.Monthly_Revenue1),
        })).filter(d => d.name && d.name !== 'False');
      }

      if (deals && deals.length) {
        DEALS = deals.map(r => ({
          name: r.Deal_Name || '',
          stage: r.Stage || '',
          amount: num(r.Funded_Amount),
          funded_date: r.Date_Funded || '',
          applied: r.Created_Time || '',
          rep: r['Owner.name'] || r['Package_Owner.name'] || '',
          puller: r['Puller.name'] || '',
          lender: r.Lender || '',
          source: r.Lead_Source2 || '',
          industry: r.Industry || '',
          state: r.State || '',
          buy_rate: num(r.Buy_Rate),
          term: r.Term || '',
          position: r.Position || '',
          daily_payment: num(r.Daily_Payment),
          payback: num(r.Payback_Amount),
          sell_rate: num(r.Sell_Rate),
          pts: num(r.pts),
          deal_type: r.Deal_Type || '',
          paid_out: r.Paid_Out_Date || '',
          paid_in: r.Paid_In_Date || r.Paid_In_Date1 || '',
        })).filter(d => d.name);
      }

      console.log('[CapMuse] Accounts:', ACCOUNTS.length, '| Funding Book:', DEALS.length);
      renderPage('dashboard');
      bindNav();
    });
  }

  // === CSV UTILS ===
  function fetchCSV(file) {
    return fetch(BUCKET + '/' + file)
      .then(r => r.ok ? r.text() : null)
      .then(text => text ? parseCSV(text) : null)
      .catch(() => null);
  }

  function parseCSV(text) {
    const lines = []; let cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '"') { inQ = !inQ; continue; }
      if (text[i] === '\\n' && !inQ) { lines.push(cur); cur = ''; continue; }
      if (text[i] === '\\r') continue;
      cur += text[i];
    }
    if (cur.trim()) lines.push(cur);
    if (lines.length < 2) return [];
    const headers = splitRow(lines[0]);
    return lines.slice(1).filter(l => l.trim()).map(l => {
      const v = splitRow(l); const o = {};
      headers.forEach((h, i) => { o[h] = (v[i] || '').trim(); });
      return o;
    });
  }

  function splitRow(line) {
    const r = []; let c = '', q = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { q = !q; continue; }
      if (line[i] === ',' && !q) { r.push(c); c = ''; continue; }
      c += line[i];
    }
    r.push(c); return r;
  }

  function num(v) { return parseFloat(String(v || '').replace(/[\\$,]/g, '')) || 0; }
  function fmt(n) { if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(0)+'K'; return Math.round(n).toLocaleString(); }
  function initials(name) { return (name||'').split(' ').map(w=>(w[0]||'')).join('').substring(0,2).toUpperCase(); }

  function chip(stage) {
    const s = (stage||'').toLowerCase();
    if (s.includes('won') || (s.includes('fund') && !s.includes('decline'))) return ['chip-green','Funded'];
    if (s.includes('approv') || s.includes('qualified')) return ['chip-blue','Approved'];
    if (s.includes('review') || s.includes('uw') || s.includes('submitted')) return ['chip-blue','Review'];
    if (s.includes('decline') || s.includes('lost')) return ['chip-gray','Declined'];
    return ['chip-gray', stage ? stage.substring(0,12) : 'Pending'];
  }

  // === NAV BINDING ===
  function bindNav() {
    document.querySelectorAll('.nav-sub-item, .nav-item, .nav-box-item, [data-page]').forEach(el => {
      el.addEventListener('click', function(e) {
        e.preventDefault();
        const page = this.getAttribute('data-page') || this.textContent.trim().replace(/[^a-zA-Z]/g,'').toLowerCase();
        document.querySelectorAll('.nav-sub-item, .nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
        this.classList.add('active');
        renderPage(page);
      });
    });
  }

  // === PAGE RENDERER ===
  function renderPage(page) {
    if (!mainContent) return;

    // Funded deals from funding book
    const fundedDeals = DEALS.filter(d => d.stage.toLowerCase().includes('won') || d.stage.toLowerCase().includes('fund'));
    const totalFundedVol = fundedDeals.reduce((s,d) => s + d.amount, 0);

    // Accounts stats
    const acctFunded = ACCOUNTS.filter(d => d.stage.toLowerCase().includes('fund') && !d.stage.toLowerCase().includes('decline'));
    const acctVol = acctFunded.reduce((s,d) => s + d.amount, 0);

    switch(page) {
      case 'dashboard':
        mainContent.innerHTML = originalHTML;
        // Populate featured card
        const fm = document.querySelector('.featured-metric');
        if (fm) fm.textContent = '$' + fmt(totalFundedVol || acctVol);
        const fl = document.querySelector('.featured-label');
        if (fl) fl.textContent = (DEALS.length || ACCOUNTS.length).toLocaleString() + ' Total Deals — Funding Book Portfolio';
        const ft = document.querySelector('.featured-tags');
        if (ft) ft.innerHTML = '<span class="featured-tag">' + fundedDeals.length + ' Funded</span><span class="featured-tag">$' + fmt(totalFundedVol) + ' Volume</span><span class="featured-tag">' + [...new Set(DEALS.map(d=>d.lender).filter(Boolean))].length + ' Lenders</span>';
        // Pipeline table = top funded deals
        updateTable(fundedDeals.sort((a,b)=>b.amount-a.amount).slice(0,10));
        break;

      case 'applications':
        renderTV('Applications Pipeline', ACCOUNTS, ['name','stage','amount','source','applied']);
        break;
      case 'businesses':
        renderTV('All Businesses', ACCOUNTS.filter(d=>d.industry), ['name','industry','state','revenue','stage']);
        break;
      case 'funding':
        renderTV('Funding Book — All Deals', DEALS.sort((a,b)=>b.amount-a.amount), ['name','amount','lender','rep','funded_date','position']);
        break;
      case 'statements':
        renderTV('Deal Financials', DEALS.filter(d=>d.payback>0).sort((a,b)=>b.payback-a.payback), ['name','amount','payback','buy_rate','daily_payment','term']);
        break;
      case 'reports':
        // Rep performance
        const byRep = {};
        DEALS.forEach(d => { if(!d.rep) return; if(!byRep[d.rep]) byRep[d.rep]={name:d.rep,deals:0,volume:0,avg_rate:0,rates:[]}; byRep[d.rep].deals++; byRep[d.rep].volume+=d.amount; if(d.buy_rate)byRep[d.rep].rates.push(d.buy_rate); });
        const repData = Object.values(byRep).sort((a,b)=>b.volume-a.volume).map(r=>({name:r.name,stage:r.deals+' deals',amount:r.volume,rep:'',funded_date:'',lender:'',source:'',industry:'',state:'',buy_rate:r.rates.length?(r.rates.reduce((s,v)=>s+v,0)/r.rates.length).toFixed(2):'',position:'',daily_payment:0,payback:0,term:'',sell_rate:0,pts:0}));
        renderTV('Rep Performance Report', repData, ['name','stage','amount','buy_rate']);
        break;
      case 'topfunded':
        renderTV('Top Funded Deals', DEALS.sort((a,b)=>b.amount-a.amount).slice(0,100), ['name','amount','lender','rep','industry','state']);
        break;
      case 'fastest':
        renderTV('Most Recent Deals', [...DEALS].filter(d=>d.funded_date).sort((a,b)=>b.funded_date.localeCompare(a.funded_date)), ['name','funded_date','amount','lender','rep']);
        break;
      case 'mostapps':
        const byLender = {};
        DEALS.forEach(d => { const l=d.lender||'Unknown'; byLender[l]=(byLender[l]||0)+1; });
        const lenderData = Object.entries(byLender).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,stage:count+' deals',amount:DEALS.filter(x=>x.lender===name).reduce((s,x)=>s+x.amount,0),rep:'',funded_date:'',lender:'',source:'',industry:'',state:'',buy_rate:0,position:'',daily_payment:0,payback:0,term:''}));
        renderTV('Deals by Lender', lenderData, ['name','stage','amount']);
        break;
      case 'alerts':
        renderTV('Declined / Lost Accounts', ACCOUNTS.filter(d=>d.stage.toLowerCase().includes('decline')||d.stage.toLowerCase().includes('lost')), ['name','stage','source','state','applied']);
        break;
      default:
        renderTV('All Data', DEALS.slice(0,50), ['name','amount','lender','rep','stage']);
    }
  }

  function updateTable(rows) {
    const tbody = document.querySelector('.pipeline-table tbody');
    if (!tbody) return;
    tbody.innerHTML = rows.map((d,i) => {
      const [cc,cl] = chip(d.stage);
      return '<tr><td>'+(i+1)+'</td><td><div class="biz-cell"><div class="biz-dot" style="background:linear-gradient(135deg,#2563EB,#10B981)">'+initials(d.name)+'</div><span class="biz-cell-name">'+d.name.substring(0,22)+'</span></div></td><td>$'+fmt(d.amount)+'</td><td>'+(d.lender||d.rep||'—')+'</td><td><span class="status-chip '+cc+'">'+cl+'</span></td></tr>';
    }).join('');
  }

  function renderTV(title, rows, cols) {
    const labels = {name:'Business/Deal',stage:'Stage',amount:'Amount',rep:'Rep',puller:'Puller',applied:'Applied',funded_date:'Funded',lender:'Lender',source:'Source',industry:'Industry',state:'State',revenue:'Revenue',buy_rate:'Rate',term:'Term',position:'Pos',daily_payment:'Daily',payback:'Payback',sell_rate:'Sell',pts:'Pts',deal_type:'Type'};
    const totalAmt = rows.reduce((s,d)=>s+(d.amount||0),0);

    mainContent.innerHTML = '<div style="padding:0"><h2 style="font-size:18px;font-weight:700;margin-bottom:6px;color:var(--text-primary)">' + title + '</h2><p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">' + rows.length.toLocaleString() + ' records' + (totalAmt > 0 ? ' — $' + fmt(totalAmt) + ' total volume' : '') + '</p><div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;max-height:72vh;overflow-y:auto"><table class="pipeline-table" style="width:100%"><thead><tr><th style="text-align:left;padding-left:14px">#</th>' + cols.map(c => '<th style="text-align:' + (['amount','revenue','buy_rate','daily_payment','payback','sell_rate','pts'].includes(c)?'right':'left') + '">' + (labels[c]||c) + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(0,100).map((d,i) => {
      return '<tr><td style="padding-left:14px">'+(i+1)+'</td>' + cols.map(c => {
        if (c==='name') return '<td style="text-align:left"><div class="biz-cell"><div class="biz-dot" style="background:linear-gradient(135deg,#2563EB,#10B981)">'+initials(d.name)+'</div><span class="biz-cell-name">'+(d.name||'').substring(0,28)+'</span></div></td>';
        if (['amount','revenue','payback','daily_payment'].includes(c)) return '<td style="text-align:right">'+(d[c]?'$'+fmt(d[c]):'—')+'</td>';
        if (['buy_rate','sell_rate','pts'].includes(c)) return '<td style="text-align:right">'+(d[c]?d[c]:'—')+'</td>';
        if (c==='stage') { const [cc,cl]=chip(d[c]); return '<td><span class="status-chip '+cc+'">'+cl+'</span></td>'; }
        return '<td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(d[c]||'—').toString().substring(0,25)+'</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table></div></div>';
  }
})();
</script>`;

d = d.replace('</body>', megaScript + '\n</body>');
fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', d);
console.log('Done. Size:', d.length);
