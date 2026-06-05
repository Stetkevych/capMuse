const fs = require('fs');
let d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html','utf8');

// Fix: "Closed Won" stage detection in chip function
d = d.replace(
  "if (s.includes('won') || (s.includes('fund') && !s.includes('decline'))) return ['chip-green','Funded'];",
  "if (s.includes('won') || s.includes('closed') || (s.includes('fund') && !s.includes('decline'))) return ['chip-green','Funded'];"
);

// Fix: funded deals filter to include "Closed Won"
d = d.replace(
  "const fundedDeals = DEALS.filter(d => d.stage.toLowerCase().includes('won') || d.stage.toLowerCase().includes('fund'));",
  "const fundedDeals = DEALS.filter(d => { const s=d.stage.toLowerCase(); return s.includes('won') || s.includes('closed') || s.includes('fund'); });"
);

// Fix: DOMContentLoaded might already have fired since script is at bottom
d = d.replace(
  "window.addEventListener('DOMContentLoaded', init);",
  "if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }"
);

// Also fix the originalHTML capture - save it BEFORE the script runs
// And make sure the featured-metric selector works
d = d.replace(
  "const fm = document.querySelector('.featured-metric');",
  "const fm = document.querySelector('.featured-metric'); console.log('[CapMuse] featured-metric found:', !!fm);"
);

fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', d);
console.log('Fixed. Checking...');
console.log('Has "closed":', d.includes("s.includes('closed')"));
console.log('Has init timing fix:', d.includes("readyState"));
