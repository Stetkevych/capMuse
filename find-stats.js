const fs = require('fs');
const d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html','utf8');

// All IDs
const ids = [...d.matchAll(/id="([^"]+)"/g)];
console.log('IDs:', ids.map(m=>m[1]).join(', '));

// Find stat card content - look for the rep leaderboard and stat values
const repHeroIdx = d.indexOf('rep-hero');
if (repHeroIdx > -1) {
  console.log('\n--- Rep Hero Card ---');
  console.log(d.substring(repHeroIdx, repHeroIdx + 800));
}

// Find the right column content (quick stats)
const rightColIdx = d.indexOf('right-col');
if (rightColIdx > -1) {
  const rightArea = d.substring(d.indexOf('right-col', 40000), d.indexOf('right-col', 40000) + 2000);
  console.log('\n--- Right Col ---');
  console.log(rightArea);
}
