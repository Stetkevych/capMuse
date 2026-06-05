const fs = require('fs');
const text = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capital-infusion-orbit-updated/Accounts.csv','utf8');

function parseCSV(t){const lines=[];let cur='',inQ=false;for(let i=0;i<t.length;i++){if(t[i]==='"')inQ=!inQ;else if(t[i]==='\n'&&!inQ){lines.push(cur.replace(/\r$/,''));cur='';}else cur+=t[i];}if(cur.trim())lines.push(cur.replace(/\r$/,''));const h=splitR(lines[0]);return lines.slice(1).filter(l=>l.trim()).map(l=>{const v=splitR(l);const o={};h.forEach((k,i)=>{o[k]=v[i]||'';});return o;});}
function splitR(line){const r=[];let c='',q=false;for(let i=0;i<line.length;i++){if(line[i]==='"')q=!q;else if(line[i]===','&&!q){r.push(c.trim());c='';}else c+=line[i];}r.push(c.trim());return r;}

const data = parseCSV(text);
console.log('Total rows:', data.length);

// Stages
const stages = {};
data.forEach(r => { const s = r.Stage_of_Package || 'EMPTY'; stages[s] = (stages[s]||0)+1; });
console.log('\n--- Stage_of_Package ---');
Object.entries(stages).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([k,v])=>console.log(' ',v, k));

// Amounts
const withAmount = data.filter(r => {
  const amt = parseFloat(String(r.Amount||'').replace(/[$,]/g,''));
  return amt > 0;
});
console.log('\n--- Amounts ---');
console.log('Rows with Amount > 0:', withAmount.length);
console.log('Top amounts:', withAmount.sort((a,b)=>parseFloat(String(b.Amount||'0').replace(/[$,]/g,''))-parseFloat(String(a.Amount||'0').replace(/[$,]/g,''))).slice(0,5).map(r=>({name:r.Account_Name, amt:r.Amount, stage:r.Stage_of_Package})));

// Funded
const funded = data.filter(r => {
  const s = (r.Stage_of_Package||'').toLowerCase();
  return s.includes('fund') && !s.includes('decline');
});
console.log('\n--- Funded ---');
console.log('Funded count:', funded.length);
const vol = funded.reduce((s,r)=>s+(parseFloat(String(r.Amount||'').replace(/[$,]/g,''))||0),0);
console.log('Funded volume: $' + (vol/1e6).toFixed(2) + 'M');

// Account names
const named = data.filter(r=>r.Account_Name);
console.log('\n--- Named accounts ---');
console.log('With Account_Name:', named.length);
console.log('Sample:', named.slice(0,5).map(r=>r.Account_Name));

// Reps
const reps = {};
data.forEach(r => { if(r.Bizz_Owner_Name) reps[r.Bizz_Owner_Name] = (reps[r.Bizz_Owner_Name]||0)+1; });
console.log('\n--- Top Reps (Bizz_Owner_Name) ---');
Object.entries(reps).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v])=>console.log(' ',v, k));
