const fs = require('fs');
let js = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/public/capmuse-engine.js', 'utf8');

// The injection got mangled. Let me find the render dashboard section and add after the featured-tags update
const target = "let tb=document.querySelector('.pipeline-table tbody');if(tb)tb.innerHTML=trows(funded.sort";
const insertBefore = "let tb=document.querySelector('.pipeline-table tbody');";

const statCardUpdate = `// Update stat cards
    let repHeroAmt=document.querySelector('.rep-hero-amount');
    if(repHeroAmt)repHeroAmt.textContent='$'+fmt(vol);
    let repAmts=document.querySelectorAll('.rep-amt');
    for(let ra=0;ra<repAmts.length;ra++){repAmts[ra].textContent='$'+fmt(vol);}
    let cardBigs=document.querySelectorAll('.card-big-single');
    if(cardBigs.length>=1)cardBigs[0].textContent='$'+fmt(funded.length>0?vol/funded.length:0);
    if(cardBigs.length>=2)cardBigs[1].textContent=Math.round(funded.length/Math.max(DEALS.length,1)*100)+'%';
    `;

// First revert the broken injection by getting the original engine
// Actually let's just rewrite the dashboard render section
const dashStart = js.indexOf("if(page==='dashboard'){");
const dashEnd = js.indexOf("if(page==='applications')");
const dashSection = js.substring(dashStart, dashEnd);

const newDash = `if(page==='dashboard'){
    mainContent.innerHTML=originalHTML;
    let fm=document.querySelector('.featured-metric');if(fm)fm.textContent='$'+fmt(vol);
    let fl=document.querySelector('.featured-label');if(fl)fl.textContent=DEALS.length+' Total Deals - Funding Book';
    let ft=document.querySelector('.featured-tags');if(ft)ft.innerHTML='<span class="featured-tag">'+funded.length+' Funded</span><span class="featured-tag">$'+fmt(vol)+' Volume</span><span class="featured-tag">'+[...new Set(DEALS.map(function(d){return d.lender;}))].length+' Lenders</span>';
    let repHeroAmt=document.querySelector('.rep-hero-amount');if(repHeroAmt)repHeroAmt.textContent='$'+fmt(vol);
    let repAmts=document.querySelectorAll('.rep-amt');for(let ra=0;ra<repAmts.length;ra++){repAmts[ra].textContent='$'+fmt(vol);}
    let cardBigs=document.querySelectorAll('.card-big-single');if(cardBigs.length>=1)cardBigs[0].textContent='$'+fmt(funded.length>0?vol/funded.length:0);if(cardBigs.length>=2)cardBigs[1].textContent=Math.round(funded.length/Math.max(DEALS.length,1)*100)+'%';
    let tb=document.querySelector('.pipeline-table tbody');if(tb)tb.innerHTML=trows(funded.sort(function(a,b){return b.amount-a.amount;}).slice(0,10));
    return;
  }
  `;

js = js.substring(0, dashStart) + newDash + js.substring(dashEnd);

fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/public/capmuse-engine.js', js);
fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/capmuse-engine.js', js);

// Validate
try {
  require('vm').createScript(js);
  console.log('JS VALID ✅');
} catch(e) {
  console.log('ERROR:', e.message);
}
