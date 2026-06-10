const fs = require('fs');
let d = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html','utf8');

// Move bindNav() call out of the .then() and into init() directly
// Currently: }).then(([accts, deals]) => { ... bindNav(); });
// Need: init() calls bindNav() immediately, and data loading happens separately

d = d.replace(
  "if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }",
  `if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }

  // Bind nav clicks immediately on script load (don't wait for CSV)
  setTimeout(function() {
    document.querySelectorAll('.nav-sub-item, .nav-item, .nav-box-item, [data-page]').forEach(function(el) {
      el.style.cursor = 'pointer';
      el.onclick = function(e) {
        e.preventDefault();
        let page = this.getAttribute('data-page') || this.textContent.trim().replace(/[^a-zA-Z]/g,'').toLowerCase();
        document.querySelectorAll('.nav-sub-item, .nav-item').forEach(function(n) { n.classList.remove('active'); n.removeAttribute('aria-current'); });
        this.classList.add('active');
        if (typeof renderPage === 'function') renderPage(page);
        console.log('[CapMuse] Nav clicked:', page);
      };
    });
    console.log('[CapMuse] Nav bound:', document.querySelectorAll('.nav-sub-item, .nav-item, .nav-box-item').length, 'items');
  }, 500);`
);

fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/dashboard.html', d);
console.log('Nav binding fixed — runs on script load with setTimeout');
