const fs = require('fs');
let d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', 'utf8');

// Find and remove the broken CAPMUSE DATA ENGINE script entirely
const engineStart = d.indexOf('<script>\n/* === CAPMUSE DATA ENGINE');
if (engineStart === -1) {
  console.log('Engine script not found, checking alternate...');
  process.exit(1);
}
const engineEnd = d.indexOf('</script>', engineStart) + 9;
d = d.substring(0, engineStart) + d.substring(engineEnd);

// Now inject clean script before </body>
const cleanScript = `<script>
(function(){
let BUCKET='https://capmuse-data-882611632216.s3.amazonaws.com';
let ACCOUNTS=[],DEALS=[],mainContent,originalHTML;
function start(){
  mainContent=document.getElementById('mainContent');
  originalHTML=mainContent?mainContent.innerHTML:'';
  // Bind nav
  let navEls=document.querySelectorAll('.nav-sub-item,.nav-item,.nav-box-item,[data-page]');
  for(let i=0;i<navEls.length;i++){
    navEls[i].style.cursor='pointer';
    (function(el){
      el.addEventListener('click',function(e){
        e.preventDefault();
        let page=this.getAttribute('data-page')||this.textContent.trim().replace(/[^a-zA-Z]/g,'').toLowerCase();
        let all=document.querySelectorAll('.nav-sub-item,.nav-item');
        for(let j=0;j<all.length;j++){all[j].classList.remove('active');}
        this.classList.add('active');
        render(page);
      });
    })(navEls[i]);
  }
  // Load data
  Promise.all([fx('Accounts.csv'),fx('funding_book.csv')]).then(function(r){
    if(r[0]&&r[0].length){ACCOUNTS=r[0].map(mapAcct).filter(function(d){return d.name&&d.name!=='False';});}
    if(r[1]&&r[1].length){DEALS=r[1].map(mapDeal).filter(function(d){return d.name;});}
    console.log('[CapMuse] Accounts:'+ACCOUNTS.length+' Deals:'+DEALS.length);
    render('dashboard');
  });
}
function mapAcct(r){return{name:r.Account_Name||r.DBA||r.Business_Legal_Name||'',stage:r.Stage_of_Package||'',amount:n(r.Amount),funded_date:r.Date_Funded||'',applied:r.Date_Applied||r.Created_Time||'',rep:r.First_Name||'',lender:r.Funder_2||'',source:r.Lead_Source||r.Original_Lead_Source||'',industry:r.Industry||r.I_Stated_Industry||'',state:r.State||r.Business_State||'',revenue:n(r.Monthly_Revenue||r.Monthly_Revenue1)};}
function mapDeal(r){return{name:r.Deal_Name||'',stage:r.Stage||'',amount:n(r.Funded_Amount),funded_date:r.Date_Funded||'',applied:r.Created_Time||'',rep:r['Owner.name']||r['Package_Owner.name']||'',puller:r['Puller.name']||'',lender:r.Lender||'',source:r.Lead_Source2||'',industry:r.Industry||'',state:r.State||'',buy_rate:n(r.Buy_Rate),term:r.Term||'',position:r.Position||'',daily_payment:n(r.Daily_Payment),payback:n(r.Payback_Amount)};}
function n(v){return parseFloat(String(v||'').replace(/[\\$,]/g,''))||0;}
function fmt(v){if(v>=1e6)return(v/1e6).toFixed(1)+'M';if(v>=1e3)return(v/1e3).toFixed(0)+'K';return Math.round(v).toLocaleString();}
function ini(s){return(s||'').split(' ').map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase();}
function stg(s){let l=(s||'').toLowerCase();if(l.indexOf('won')>-1||l.indexOf('closed')>-1||(l.indexOf('fund')>-1&&l.indexOf('decline')===-1))return['chip-green','Funded'];if(l.indexOf('approv')>-1)return['chip-blue','Approved'];if(l.indexOf('review')>-1||l.indexOf('uw')>-1||l.indexOf('submit')>-1)return['chip-blue','Review'];if(l.indexOf('decline')>-1||l.indexOf('lost')>-1)return['chip-gray','Declined'];return['chip-gray',s?s.substring(0,12):'Pending'];}
function fx(file){return fetch(BUCKET+'/'+file).then(function(r){return r.ok?r.text():null;}).then(function(t){return t?csv(t):null;}).catch(function(){return null;});}
function csv(text){let lines=[],cur='',inQ=false;for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){inQ=!inQ;}else if(c==='\\n'&&!inQ){lines.push(cur);cur='';}else if(c!=='\\r'){cur+=c;}}if(cur.trim())lines.push(cur);if(lines.length<2)return[];let h=spl(lines[0]);let out=[];for(let j=1;j<lines.length;j++){if(!lines[j].trim())continue;let v=spl(lines[j]);let o={};for(let k=0;k<h.length;k++){o[h[k]]=(v[k]||'').trim();}out.push(o);}return out;}
function spl(line){let r=[],c='',q=false;for(let i=0;i<line.length;i++){if(line[i]==='"'){q=!q;}else if(line[i]===','&&!q){r.push(c);c='';}else{c+=line[i];}}r.push(c);return r;}
function render(page){
  if(!mainContent)return;
  let funded=DEALS.filter(function(d){let s=d.stage.toLowerCase();return s.indexOf('won')>-1||s.indexOf('closed')>-1||s.indexOf('fund')>-1;});
  let vol=funded.reduce(function(s,d){return s+d.amount;},0);
  if(page==='dashboard'){
    mainContent.innerHTML=originalHTML;
    let fm=document.querySelector('.featured-metric');if(fm)fm.textContent='$'+fmt(vol);
    let fl=document.querySelector('.featured-label');if(fl)fl.textContent=DEALS.length+' Total Deals — Funding Book';
    let ft=document.querySelector('.featured-tags');if(ft)ft.innerHTML='<span class="featured-tag">'+funded.length+' Funded</span><span class="featured-tag">$'+fmt(vol)+' Volume</span><span class="featured-tag">'+new Set(DEALS.map(function(d){return d.lender;})).size+' Lenders</span>';
    let tb=document.querySelector('.pipeline-table tbody');if(tb)tb.innerHTML=trows(funded.sort(function(a,b){return b.amount-a.amount;}).slice(0,10));
    return;
  }
  if(page==='applications'){tbl('Applications',ACCOUNTS,['name','stage','amount','source','applied']);return;}
  if(page==='businesses'){tbl('Businesses',ACCOUNTS.filter(function(d){return d.industry;}),['name','industry','state','revenue','stage']);return;}
  if(page==='funding'){tbl('Funding Book',DEALS.sort(function(a,b){return b.amount-a.amount;}),['name','amount','lender','rep','funded_date','position']);return;}
  if(page==='statements'){tbl('Financials',DEALS.filter(function(d){return d.payback>0;}).sort(function(a,b){return b.payback-a.payback;}),['name','amount','payback','buy_rate','daily_payment','term']);return;}
  if(page==='reports'){let br={};DEALS.forEach(function(d){if(!d.rep)return;if(!br[d.rep])br[d.rep]={name:d.rep,amount:0,stage:'0 deals'};br[d.rep].amount+=d.amount;br[d.rep].stage=(parseInt(br[d.rep].stage)+1)+' deals';});tbl('Rep Report',Object.values(br).sort(function(a,b){return b.amount-a.amount;}),['name','stage','amount']);return;}
  if(page==='topfunded'){tbl('Top Funded',funded.sort(function(a,b){return b.amount-a.amount;}),['name','amount','lender','rep','industry']);return;}
  if(page==='fastest'){tbl('Recent Deals',DEALS.filter(function(d){return d.funded_date;}).sort(function(a,b){return b.funded_date>a.funded_date?1:-1;}),['name','funded_date','amount','lender','rep']);return;}
  if(page==='mostapps'||page==='mostapplications'){let bl={};DEALS.forEach(function(d){let l=d.lender||'Unknown';bl[l]=(bl[l]||0)+1;});let ld=Object.entries(bl).sort(function(a,b){return b[1]-a[1];}).map(function(e){return{name:e[0],stage:e[1]+' deals',amount:DEALS.filter(function(x){return x.lender===e[0];}).reduce(function(s,x){return s+x.amount;},0)};});tbl('By Lender',ld,['name','stage','amount']);return;}
  if(page==='alerts'){tbl('Declined/Lost',ACCOUNTS.filter(function(d){return d.stage.toLowerCase().indexOf('decline')>-1||d.stage.toLowerCase().indexOf('lost')>-1;}),['name','stage','source','state','applied']);return;}
  tbl('Data',DEALS.slice(0,50),['name','amount','lender','rep','stage']);
}
function trows(rows){return rows.map(function(d,i){let c=stg(d.stage);return'<tr><td>'+(i+1)+'</td><td><div class="biz-cell"><div class="biz-dot" style="background:linear-gradient(135deg,#2563EB,#10B981)">'+ini(d.name)+'</div><span class="biz-cell-name">'+d.name.substring(0,22)+'</span></div></td><td>$'+fmt(d.amount)+'</td><td>'+(d.lender||d.rep||'\\u2014')+'</td><td><span class="status-chip '+c[0]+'">'+c[1]+'</span></td></tr>';}).join('');}
function tbl(title,rows,cols){
  let labels={name:'Business',stage:'Stage',amount:'Amount',rep:'Rep',puller:'Puller',applied:'Applied',funded_date:'Funded',lender:'Lender',source:'Source',industry:'Industry',state:'State',revenue:'Revenue',buy_rate:'Rate',term:'Term',position:'Pos',daily_payment:'Daily',payback:'Payback'};
  let tot=rows.reduce(function(s,d){return s+(d.amount||0);},0);
  let h='<div><h2 style="font-size:18px;font-weight:700;margin-bottom:6px;color:var(--text-primary)">'+title+'</h2><p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">'+rows.length+' records'+(tot>0?' \\u2014 $'+fmt(tot)+' volume':'')+'</p><div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;max-height:72vh;overflow-y:auto"><table class="pipeline-table" style="width:100%"><thead><tr><th style="text-align:left;padding-left:14px">#</th>';
  cols.forEach(function(c){h+='<th style="text-align:'+(['amount','revenue','buy_rate','daily_payment','payback'].indexOf(c)>-1?'right':'left')+'">'+(labels[c]||c)+'</th>';});
  h+='</tr></thead><tbody>';
  rows.slice(0,100).forEach(function(d,i){
    h+='<tr><td style="padding-left:14px">'+(i+1)+'</td>';
    cols.forEach(function(c){
      if(c==='name'){h+='<td style="text-align:left"><div class="biz-cell"><div class="biz-dot" style="background:linear-gradient(135deg,#2563EB,#10B981)">'+ini(d.name)+'</div><span class="biz-cell-name">'+(d.name||'').substring(0,28)+'</span></div></td>';}
      else if(['amount','revenue','payback','daily_payment'].indexOf(c)>-1){h+='<td style="text-align:right">'+(d[c]?'$'+fmt(d[c]):'\\u2014')+'</td>';}
      else if(c==='buy_rate'){h+='<td style="text-align:right">'+(d[c]||'\\u2014')+'</td>';}
      else if(c==='stage'){let ch=stg(d[c]);h+='<td><span class="status-chip '+ch[0]+'">'+ch[1]+'</span></td>';}
      else{h+='<td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(d[c]||'\\u2014').toString().substring(0,25)+'</td>';}
    });
    h+='</tr>';
  });
  h+='</tbody></table></div></div>';
  mainContent.innerHTML=h;
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',start);}else{start();}
})();
</script>`;

d = d.replace('</body>', cleanScript + '\n</body>');
fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', d);

// Validate
const ss = d.lastIndexOf('<script>');
const se = d.lastIndexOf('</script>');
const script = d.substring(ss + 8, se);
try { new Function(script); console.log('JS is VALID ✅'); }
catch(e) { console.log('ERROR:', e.message); }
