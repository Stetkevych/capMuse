const fs = require('fs');
let d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', 'utf8');

// Fix: "</td><td>$+fmt" should be "</td><td>$'+fmt"
d = d.replace(
  "</td><td>$+fmt(d.amount)+'</td>",
  "</td><td>$'+fmt(d.amount)+'</td>"
);

fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', d);

// Validate
const scriptStart = d.lastIndexOf('<script>');
const scriptEnd = d.lastIndexOf('</script>');
const script = d.substring(scriptStart + 8, scriptEnd);
try {
  new Function(script);
  console.log('JS is VALID ✅');
} catch(e) {
  console.log('ERROR ❌:', e.message);
}
