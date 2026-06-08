/**
 * Clears hardcoded numeric placeholder values from card metric elements.
 * Keeps labels, names, and headlines intact.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML_DIRS = [
  path.join(ROOT, 'FrontendUI'),
  path.join(ROOT, 'public'),
];

const HTML_FILES = [
  'dashboard.html',
  'dashboard-clean.html',
  'funding_book.html',
  'pipeline.html',
  'lead.html',
  'lender_recommendation.html',
  'convoso.html',
];

function clearInnerText(html, pattern) {
  return html.replace(pattern, '$1$2');
}

function processHtml(html) {
  let out = html;

  // Simple text-only elements
  const simple = [
    ['div', 'kpi-value'],
    ['div', 'rep-hero-amount'],
    ['span', 'rep-amt'],
    ['span', 'card-big-single'],
    ['div', 'featured-metric'],
    ['span', 'vs-count'],
    ['div', 'funnel-step-count'],
    ['div', 'funnel-step-amt'],
    ['span', 'match-pct'],
    ['div', 'lender-stat-value'],
    ['span', 'lender-bar-amt'],
    ['span', 'lender-bar-pct'],
    ['span', 'tab-count'],
    ['span', 'card-big-num'],
    ['span', 'bar-amt'],
    ['span', 'bar-pct'],
    ['span', 'amount-cell'],
    ['span', 'factor-rate'],
  ];

  simple.forEach(function (pair) {
    const tag = pair[0];
    const cls = pair[1];
    const re = new RegExp(
      '(<' + tag + '(?:\\s[^>]*)?\\sclass="' + cls + '"[^>]*>)[^<]*(</' + tag + '>)',
      'gi'
    );
    out = out.replace(re, '$1$2');

    // class may appear among others
    const re2 = new RegExp(
      '(<' + tag + '(?:\\s[^>]*)?\\sclass="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>)[^<]*(</' + tag + '>)',
      'gi'
    );
    out = out.replace(re2, '$1$2');
  });

  // rep-pos rank numbers (not medals)
  out = out.replace(
    /(<span class="rep-pos num">)[^<]*(<\/span>)/gi,
    '$1$2'
  );

  // kpi-delta: keep svg, strip trailing text
  out = out.replace(
    /(<div class="kpi-delta[^"]*"[^>]*>\s*<svg[\s\S]*?<\/svg>)[^<]*/gi,
    '$1'
  );
  out = out.replace(
    /(<div class="kpi-delta neu">)[^<]*/gi,
    '$1'
  );

  // card footer numeric lines
  out = out.replace(
    /(<p class="card-footer-text"[^>]*>)[^<]*(<\/p>)/gi,
    '$1$2'
  );

  // pipeline / funding table amount cells
  out = out.replace(/<td>\$[^<]*<\/td>/gi, '<td></td>');

  // navy stat card headline with embedded placeholder numbers
  out = out.replace(
    /Only 2 businesses funded<br \/>over \$7M with A\+ credit:/gi,
    'Businesses funded<br />with A+ credit:'
  );

  // Ticker messages — remove numeric placeholders, keep descriptive text
  out = out.replace(
    /<span class="ticker-msg">[^<]*<\/span>/gi,
    function (match) {
      if (match.includes('No new applications')) return match;
      if (match.includes('active lender relationships')) {
        return '<span class="ticker-msg">Active lender relationships &nbsp;·&nbsp; Profiles updated daily from Zoho &nbsp;·&nbsp; Avg approval time tracked live</span>';
      }
      if (match.includes('new leads')) {
        return '<span class="ticker-msg">New leads this week &nbsp;·&nbsp; Awaiting follow-up &nbsp;·&nbsp; Conversion rate vs last month</span>';
      }
      if (match.includes('deals awaiting')) {
        return '<span class="ticker-msg">Deals awaiting review &nbsp;·&nbsp; Active pipeline &nbsp;·&nbsp; Approvals expected this week</span>';
      }
      if (match.includes('YTD Funded')) {
        return '<span class="ticker-msg">YTD Funded &nbsp;·&nbsp; Deals closed &nbsp;·&nbsp; Best month &nbsp;·&nbsp; Avg factor rate</span>';
      }
      return match;
    }
  );

  return out;
}

let changed = 0;
HTML_DIRS.forEach(function (dir) {
  HTML_FILES.forEach(function (file) {
    const fp = path.join(dir, file);
    if (!fs.existsSync(fp)) return;
    const before = fs.readFileSync(fp, 'utf8');
    const after = processHtml(before);
    if (after !== before) {
      fs.writeFileSync(fp, after, 'utf8');
      changed++;
      console.log('Updated:', path.relative(ROOT, fp));
    }
  });
});

console.log('Done. Files updated:', changed);
