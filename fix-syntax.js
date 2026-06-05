const fs = require('fs');
let d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', 'utf8');

// The problem: a </html> tag got inserted inside a JS string on line with updateTable
// Find the broken pattern and fix it
const broken = `</span></div></td><td>\n</html>\n`;
const fixed = `</span></div></td><td>$`;

if (d.includes(broken)) {
  d = d.replace(broken, fixed);
  console.log('Fixed stray </html> in JS string');
} else {
  // Try alternate pattern with \r\n
  const broken2 = `</span></div></td><td>\r\n</html>\r\n`;
  if (d.includes(broken2)) {
    d = d.replace(broken2, fixed);
    console.log('Fixed stray </html> (CRLF) in JS string');
  } else {
    // Search more broadly
    const idx = d.indexOf('+fmt(d.amount)');
    const chunk = d.substring(idx - 100, idx);
    console.log('Chunk before +fmt:', JSON.stringify(chunk));
    
    // Replace whatever is between </td><td> and +fmt
    const match = d.match(/<\/span><\/div><\/td><td>[\s\S]{1,30}\+fmt\(d\.amount\)/);
    if (match) {
      console.log('Found match:', JSON.stringify(match[0].substring(0, 80)));
      d = d.replace(match[0], `</span></div></td><td>'+fmt(d.amount)`);
      console.log('Fixed via regex');
    }
  }
}

fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', d);

// Validate
const scriptStart = d.lastIndexOf('<script>');
const scriptEnd = d.lastIndexOf('</script>');
const script = d.substring(scriptStart + 8, scriptEnd);
try {
  new Function(script);
  console.log('JS is VALID ✅');
} catch(e) {
  console.log('Still broken ❌:', e.message);
  // Find the line
  const lines = script.split('\n');
  for (let i = 0; i < lines.length; i++) {
    try { new Function(lines.slice(0, i+1).join('\n') + '}'.repeat(30)); }
    catch(e2) {
      if (e2.message.includes('Invalid') || e2.message.includes('Unexpected')) {
        console.log('Error at line', i+1, ':', lines[i].substring(0, 100));
        break;
      }
    }
  }
}
