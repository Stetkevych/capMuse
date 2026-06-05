const fs = require('fs');
let d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', 'utf8');

// Replace literal em-dash (—) with hyphen in the script section only
const ss = d.lastIndexOf('<script>');
const se = d.lastIndexOf('</script>');
let script = d.substring(ss + 8, se);

// Replace all literal em-dashes with a simple dash
script = script.replace(/\u2014/g, '-');

d = d.substring(0, ss + 8) + script + d.substring(se);
fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', d);

// Validate
try { new Function(script); console.log('JS is VALID ✅'); }
catch(e) { console.log('ERROR:', e.message); }
