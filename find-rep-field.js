const fs = require('fs');
const text = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capital-infusion-orbit-updated/Accounts.csv','utf8');
function parseCSV(t){const lines=[];let cur='',inQ=false;for(let i=0;i<t.length;i++){if(t[i]==='"')inQ=!inQ;else if(t[i]==='\n'&&!inQ){lines.push(cur.replace(/\r$/,''));cur='';}else cur+=t[i];}if(cur.trim())lines.push(cur.replace(/\r$/,''));const h=splitR(lines[0]);return lines.slice(1,500).filter(l=>l.trim()).map(l=>{const v=splitR(l);const o={};h.forEach((k,i)=>{o[k]=v[i]||'';});return o;});}
function splitR(line){const r=[];let c='',q=false;for(let i=0;i<line.length;i++){if(line[i]==='"')q=!q;else if(line[i]===','&&!q){r.push(c.trim());c='';}else c+=line[i];}r.push(c.trim());return r;}

const data = parseCSV(text);

// Check Puller field
const pullers = {};
data.forEach(r => { if(r.Puller) pullers[r.Puller] = (pullers[r.Puller]||0)+1; });
console.log('--- Puller field ---');
Object.entries(pullers).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,v])=>console.log(' ',v, k));

// Check Bizz_Owner_Name field  
const biz = {};
data.forEach(r => { if(r.Bizz_Owner_Name) biz[r.Bizz_Owner_Name] = (biz[r.Bizz_Owner_Name]||0)+1; });
console.log('\n--- Bizz_Owner_Name ---');
Object.entries(biz).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,v])=>console.log(' ',v, k));

// Check First_Name + Last_Name
const names = {};
data.forEach(r => { const n = (r.First_Name||'')+ ' ' + (r.Last_Name||''); if(n.trim()) names[n.trim()] = (names[n.trim()]||0)+1; });
console.log('\n--- First_Name + Last_Name ---');
Object.entries(names).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v])=>console.log(' ',v, k));

// Check Owner.id
const owners = {};
data.forEach(r => { if(r['Owner.id']) owners[r['Owner.id']] = (owners[r['Owner.id']]||0)+1; });
console.log('\n--- Owner.id ---');
Object.entries(owners).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v])=>console.log(' ',v, k));
