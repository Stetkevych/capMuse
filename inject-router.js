const fs = require('fs');
let d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html','utf8');

const routingScript = `
<script>
/* === CAPMUSE ROUTER + DATA ENGINE === */
(function() {
  const BUCKET = 'https://capmuse-data-882611632216.s3.amazonaws.com';
  let DATA = [];
  const mainContent = document.getElementById('mainContent');
  const originalHTML = mainContent ? mainContent.innerHTML : '';

  function parseCSV(text) {
    const lines = []; let cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '"') inQ = !inQ;
      else if (text[i] === '\\n' && !inQ) { lines.push(cur.replace(/\\r$/,'')); cur = ''; }
      else cur += text[i];
    }
    if (cur.trim()) lines.push(cur.replace(/\\r$/,''));
    if (lines.length < 2) return [];
    const h = splitR(lines[0]);
    return lines.slice(1).filter(l=>l.trim()).map(l => { const v=splitR(l); const o={}; h.forEach((k,i)=>{o[k]=v[i]||'';}); return o; });
  }
  function splitR(line) { const r=[]; let c='',q=false; for(let i=0;i<line.length;i++){if(line[i]==='"')q=!q; else if(line[i]===','&&!q){r.push(c.trim());c='';}else c+=line[i];} r.push(c.trim()); return r; }
  function fmt(n){if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(0)+'K';return n.toString();}
  function getInitials(name){return (name||'').split(' ').map(w=>(w[0]||'')).join('').substring(0,2).toUpperCase();}

  fetch(BUCKET+'/Accounts.csv').then(r=>r.ok?r.text():null).then(text=>{
    if(!text)return;
    DATA=parseCSV(text).map(r=>({
      name:r.Account_Name||r.DBA||r.Business_Legal_Name||'',
      stage:r.Stage_of_Package||'',
      amount:parseFloat(String(r.Amount||'').replace(/[\\$,]/g,''))||0,
      funded_date:r.Date_Funded||'',
      applied:r.Date_Applied||r.Created_Time||'',
      rep:r.Bizz_Owner_Name||'',
      lender:r.Funder_2||'',
      source:r.Lead_Source||r.Original_Lead_Source||'',
      industry:r.Industry||r.I_Stated_Industry||'',
      state:r.State||r.Business_State||'',
      revenue:parseFloat(String(r.Monthly_Revenue||r.Monthly_Revenue1||'').replace(/[\\$,]/g,''))||0,
      credit:r.Credit_Score||'',
    })).filter(d=>d.name);
    renderPage('dashboard');
    console.log('[CapMuse] Loaded '+DATA.length+' records');
  }).catch(()=>{});

  // Nav clicks
  document.querySelectorAll('.nav-sub-item, .nav-item, .nav-box-item, [data-page]').forEach(el=>{
    el.addEventListener('click', function(e){
      e.preventDefault();
      const page = this.getAttribute('data-page') || this.textContent.trim().split('\\n')[0].trim().toLowerCase().replace(/\\s+/g,'');
      document.querySelectorAll('.nav-sub-item, .nav-item').forEach(n=>n.classList.remove('active'));
      this.classList.add('active');
      renderPage(page);
    });
  });

  function renderPage(page) {
    if(!DATA.length || !mainContent) return;
    const funded = DATA.filter(d=>d.stage.toLowerCase().includes('fund')&&!d.stage.toLowerCase().includes('decline'));
    const totalVol = funded.reduce((s,d)=>s+d.amount,0);

    if(page==='dashboard') {
      mainContent.innerHTML = originalHTML;
      const tickers = document.querySelectorAll('.ticker-value');
      if(tickers.length>=3){tickers[0].textContent='$'+fmt(totalVol);tickers[1].textContent=DATA.length.toLocaleString();tickers[2].textContent=Math.round(funded.length/DATA.length*100)+'%';}
      updateTable(DATA.slice(0,10));
      return;
    }
    if(page==='applications') { renderTable('Applications Pipeline', DATA, ['name','stage','amount','rep','applied']); return; }
    if(page==='businesses') { renderTable('All Businesses', DATA, ['name','industry','state','revenue','stage']); return; }
    if(page==='funding') { renderTable('Funded Deals', funded.sort((a,b)=>b.amount-a.amount), ['name','amount','lender','rep','funded_date']); return; }
    if(page==='statements'||page==='reports') { renderTable('Financial Overview', DATA.filter(d=>d.revenue>0).sort((a,b)=>b.revenue-a.revenue), ['name','revenue','amount','industry','state']); return; }
    if(page==='topfunded') { renderTable('Top Funded Deals', funded.sort((a,b)=>b.amount-a.amount), ['name','amount','lender','rep','funded_date']); return; }
    if(page==='fastest'||page==='fastestgrowing') { renderTable('Recently Applied', [...DATA].sort((a,b)=>new Date(b.applied)-new Date(a.applied)), ['name','applied','stage','rep','source']); return; }
    if(page==='mostapps'||page==='mostapplications') { const byRep={}; DATA.forEach(d=>{if(d.rep)byRep[d.rep]=(byRep[d.rep]||0)+1;}); const reps=Object.entries(byRep).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,stage:count+' deals',amount:0,rep:'',applied:'',funded_date:'',lender:'',source:'',industry:'',state:'',revenue:0,credit:''})); renderTable('Most Applications by Rep', reps, ['name','stage']); return; }
    if(page==='alerts') { renderTable('Pending / Under Review', DATA.filter(d=>!d.stage||d.stage.toLowerCase().includes('pend')||d.stage.toLowerCase().includes('review')||d.stage.toLowerCase().includes('underw')), ['name','stage','rep','applied','source']); return; }
    renderTable(page.charAt(0).toUpperCase()+page.slice(1), DATA.slice(0,30), ['name','stage','amount','rep']);
  }

  function renderTable(title, rows, cols) {
    const labels = {name:'Business',stage:'Stage',amount:'Amount',rep:'Rep',applied:'Applied',funded_date:'Funded',lender:'Lender',source:'Source',industry:'Industry',state:'State',revenue:'Revenue',credit:'Credit'};
    mainContent.innerHTML = '<div style="padding:0"><h2 style="font-size:18px;font-weight:700;margin-bottom:16px;color:var(--text-primary)">'+title+' <span style="font-size:13px;font-weight:400;color:var(--text-muted)">('+rows.length+' records)</span></h2><div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden"><table class="pipeline-table" style="width:100%"><thead><tr><th style="text-align:left;padding-left:14px">#</th>'+cols.map(c=>'<th style="text-align:'+(c==='amount'||c==='revenue'?'right':'left')+'">'+labels[c]+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(0,50).map((d,i)=>'<tr><td style="padding-left:14px">'+(i+1)+'</td>'+cols.map(c=>{
      if(c==='name') return '<td style="text-align:left"><div class="biz-cell"><div class="biz-dot" style="background:linear-gradient(135deg,#2563EB,#10B981)">'+getInitials(d.name)+'</div><span class="biz-cell-name">'+(d.name||'').substring(0,25)+'</span></div></td>';
      if(c==='amount') return '<td style="text-align:right">'+(d.amount?'$'+fmt(d.amount):'\\u2014')+'</td>';
      if(c==='revenue') return '<td style="text-align:right">'+(d.revenue?'$'+fmt(d.revenue):'\\u2014')+'</td>';
      if(c==='stage'){const s=d.stage||'Pending';const chip=s.toLowerCase().includes('fund')?'chip-green':s.toLowerCase().includes('approv')||s.toLowerCase().includes('review')?'chip-blue':'chip-gray';return '<td><span class="status-chip '+chip+'">'+s.substring(0,15)+'</span></td>';}
      return '<td>'+(d[c]||'\\u2014').toString().substring(0,22)+'</td>';
    }).join('')+'</tr>').join('')+'</tbody></table></div></div>';
  }

  function updateTable(rows) {
    const tbody = document.querySelector('.pipeline-table tbody');
    if(!tbody) return;
    tbody.innerHTML = rows.map((d,i)=>{
      const chip = d.stage.toLowerCase().includes('fund')?'chip-green':d.stage.toLowerCase().includes('approv')||d.stage.toLowerCase().includes('review')?'chip-blue':'chip-gray';
      return '<tr><td>'+(i+1)+'</td><td><div class="biz-cell"><div class="biz-dot" style="background:linear-gradient(135deg,#2563EB,#10B981)">'+getInitials(d.name)+'</div><span class="biz-cell-name">'+d.name.substring(0,20)+'</span></div></td><td>'+(d.amount?'$'+fmt(d.amount):'\\u2014')+'</td><td>'+(d.rep?d.rep.split(' ')[0]:'\\u2014')+'</td><td><span class="status-chip '+chip+'">'+(d.stage||'Pending').substring(0,15)+'</span></td></tr>';
    }).join('');
  }
})();
<\/script>`;

d = d.replace('</body>', routingScript + '\n</body>');
fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', d);
console.log('Done. New size:', d.length);
