const fs = require('fs');
let js = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/public/capmuse-engine.js', 'utf8');

// Find the spot after featured-tags update and before pipeline table update
const oldLine = "var tb=document.querySelector('.pipeline-table tbody');if(tb)tb.innerHTML=trows(funded.sort(function(a,b){return b.amount-a.amount;}).slice(0,10));";

const newLines = `var repHeroAmt=document.querySelector('.rep-hero-amount');if(repHeroAmt)repHeroAmt.textContent='$'+fmt(vol);
    var repAmts=document.querySelectorAll('.rep-amt');for(var ra=0;ra<repAmts.length;ra++){repAmts[ra].textContent='$'+fmt(vol);}
    var cardBigs=document.querySelectorAll('.card-big-single');if(cardBigs.length>=1)cardBigs[0].textContent='$'+fmt(funded.length>0?vol/funded.length:0);if(cardBigs.length>=2)cardBigs[1].textContent=Math.round(funded.length/Math.max(DEALS.length,1)*100)+'%';
    var tb=document.querySelector('.pipeline-table tbody');if(tb)tb.innerHTML=trows(funded.sort(function(a,b){return b.amount-a.amount;}).slice(0,10));`;

if (js.includes(oldLine)) {
  js = js.replace(oldLine, newLines);
  fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/public/capmuse-engine.js', js);
  fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/capmuse-engine.js', js);
  
  // Validate
  try { require('vm').createScript(js); console.log('✅ Valid'); }
  catch(e) { console.log('❌', e.message); }
} else {
  console.log('Target line not found');
}
