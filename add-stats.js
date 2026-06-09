const fs = require('fs');
let d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/public/dashboard.html', 'utf8');
if (!d.includes('capmuse-stats.js')) {
  d = d.replace(
    '<script src="capmuse-engine.js"></script>',
    '<script src="capmuse-engine.js"></script>\n<script src="capmuse-stats.js"></script>'
  );
}
fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/public/dashboard.html', d);
fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', d);
fs.copyFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/public/capmuse-stats.js', 'c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/capmuse-stats.js');
console.log('Done');
