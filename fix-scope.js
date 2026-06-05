const fs = require('fs');
let d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html','utf8');

// Remove the external setTimeout nav binding that can't access renderPage
d = d.replace(
  /\/\/ Bind nav clicks immediately on script load[\s\S]*?console\.log\('\[CapMuse\] Nav bound:'[^;]+;\s*\}\s*,\s*500\s*\);/,
  ''
);

// Now fix the init function to bind nav FIRST, before data loads
// Replace the init function to bind nav immediately
d = d.replace(
  'function init() {\n    mainContent = document.getElementById(\'mainContent\');\n    originalHTML = mainContent ? mainContent.innerHTML : \'\';\n\n    // Load both CSVs\n    Promise.all([',
  `function init() {
    mainContent = document.getElementById('mainContent');
    originalHTML = mainContent ? mainContent.innerHTML : '';

    // Bind nav immediately
    document.querySelectorAll('.nav-sub-item, .nav-item, .nav-box-item, [data-page]').forEach(function(el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function(e) {
        e.preventDefault();
        var page = this.getAttribute('data-page') || this.textContent.trim().replace(/[^a-zA-Z]/g,'').toLowerCase();
        document.querySelectorAll('.nav-sub-item, .nav-item').forEach(function(n) { n.classList.remove('active'); n.removeAttribute('aria-current'); });
        this.classList.add('active');
        renderPage(page);
      });
    });
    console.log('[CapMuse] Nav bound');

    // Load both CSVs
    Promise.all([`
);

// Also remove the bindNav() call inside the .then since we do it in init now
d = d.replace('bindNav();', '');

// Remove the old bindNav function definition if it exists
d = d.replace(/\/\/ === NAV BINDING ===\s*function bindNav\(\)[\s\S]*?}\s*}/m, '');

fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', d);
console.log('Done. Nav binding now inside IIFE init()');
console.log('renderPage accessible:', d.includes('renderPage(page)'));
