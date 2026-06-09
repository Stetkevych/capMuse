// Funding Book — filterable rep leaderboard from funding_book_live.json
(function () {
  if (!document.body.classList.contains('funding-book-page')) return;

  var DEALS = [];
  var CSV_LOOKUP = {};
  var SORT_KEY = 'volume';
  var SORT_DIR = 'desc';

  var FILTERS = {
    leadSource: [],
    marketingAssist: [],
    state: [],
    dateRange: 'ytd',
    customFrom: '',
    customTo: '',
    lender: [],
    productType: [],
    dealType: []
  };

  var FILTER_DEFS = [
    { key: 'leadSource', label: 'Lead Source', field: 'leadSource', searchable: true, grouped: true },
    { key: 'marketingAssist', label: 'Marketing Assist', field: 'marketingAssist', searchable: true },
    { key: 'state', label: 'State', field: 'state', searchable: true },
    { key: 'dateRange', label: 'Date Range', type: 'date' },
    { key: 'lender', label: 'Lender', field: 'lender', searchable: true },
    { key: 'productType', label: 'Product Type', field: 'productType', searchable: true },
    { key: 'dealType', label: 'Deal Type', field: 'dealType', searchable: true, grouped: true }
  ];

  var DATE_PRESETS = [
    { id: 'today', label: 'Today' },
    { id: 'ytd', label: 'Year to date' },
    { id: 'last_month', label: 'Last month' },
    { id: 'last_3_months', label: 'Last 3 months' },
    { id: 'last_6_months', label: 'Last 6 months' },
    { id: 'this_month', label: 'This month' },
    { id: 'all_time', label: 'All time' },
    { id: 'custom', label: 'Custom range' }
  ];

  var popupKey = null;
  var popupDraft = [];

  var PACKAGE_OWNER_RECORD_FIXES = {
    '3793076000601237337': 'House .',
    '3793076000605384128': 'House .',
    '3793076000606189343': 'House .',
    '3793076000624144182': 'House .',
    '3793076000649034499': 'House .'
  };

  var LENDER_ALIASES = {
    'can': 'Can Capital',
    'can capital': 'Can Capital',
    'canacap': 'Can Capital',
    'cancap': 'Can Capital',
    'can equipment': 'CAN Equipment',
    'ondeck (loc)': 'OnDeck (LOC)',
    'ondeck (canada)': 'OnDeck (Canada)',
    'ondeck (canda)': 'OnDeck (Canada)'
  };

  var LEAD_SOURCE_GROUP_FACEBOOK = '__group:facebook';
  var LEAD_SOURCE_GROUP_FB_SPO = '__group:facebook-spo';

  function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }

  function fmtFull(v) {
    return '$' + Math.round(v || 0).toLocaleString('en-US');
  }

  function fmtPts(v) {
    return (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function parseDate(s) {
    if (!s) return null;
    var d = new Date(String(s).length === 10 ? String(s) + 'T12:00:00' : s);
    return isNaN(d.getTime()) ? null : d;
  }

  function normState(s) { return String(s || '').trim().toUpperCase(); }
  function normStr(s) { return String(s || '').trim().toLowerCase(); }

  function normLeadKey(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function normalizeLender(name) {
    var raw = String(name || '').trim();
    if (!raw) return '';
    var key = normStr(raw);
    if (LENDER_ALIASES[key]) return LENDER_ALIASES[key];
    if (key === 'can') return 'Can Capital';
    if (/^can\s+equipment$/i.test(raw)) return 'CAN Equipment';
    if (/^canacap$/i.test(raw) || /^cancap$/i.test(raw)) return 'Can Capital';
    if (/^ondeck\s*\(loc\)$/i.test(raw)) return 'OnDeck (LOC)';
    if (/^ondeck\s*\(canada\)$/i.test(raw) || /^ondeck\s*\(canda\)$/i.test(raw)) return 'OnDeck (Canada)';
    return raw;
  }

  function normalizeDealType(type) {
    var raw = String(type || '').trim();
    if (!raw || raw === '-') return '';
    var key = normStr(raw);
    if (key === 'renewal' || key.indexOf('renewal') === 0) return 'Renewal';
    if (key === 'new deal') return 'New Deal';
    if (key === 'stack') return 'Stack';
    if (key === 'loc') return 'LOC';
    if (key === 'reverse' || key === 'reversal') return 'Reverse';
    if (/add\s*[- ]?\s*on/i.test(raw)) return 'Add-on';
    if (key === 'bizdev') return 'Bizdev';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function looksLikeFacebook(leadSource) {
    var n = normLeadKey(leadSource);
    return n.indexOf('facebook') > -1 || n.indexOf('faceboook') > -1;
  }

  function isFacebookSpo(leadSource) {
    return looksLikeFacebook(leadSource) && normLeadKey(leadSource).indexOf('spo') > -1;
  }

  function isFacebookNonSpo(leadSource) {
    return looksLikeFacebook(leadSource) && !isFacebookSpo(leadSource);
  }

  function isHouseName(name) {
    return normStr(name).replace(/\./g, '').trim() === 'house';
  }

  function fundingBookOwnerFromRecord(r) {
    return (r.funding_book_owner || r.Funding_Book_Owner || r['Funding_Book_Owner.name'] || r.Owner || r['Owner.name'] || '').trim();
  }

  function packageOwnerFromRecord(r) {
    var recordId = String(r.record_id || r.id || '');
    if (PACKAGE_OWNER_RECORD_FIXES[recordId]) return PACKAGE_OWNER_RECORD_FIXES[recordId];

    var fromLookup = (r['Package_Owner.name'] || (r.Package_Owner && r.Package_Owner.name) || r.package_owner_name || '').trim();
    if (fromLookup) return fromLookup;

    var flat = (r.package_owner || '').trim();
    var puller = (r.puller || r.Puller || r['Puller.name'] || '').trim();
    var fbOwner = fundingBookOwnerFromRecord(r);

    if (flat && puller && normStr(flat) === normStr(puller) && fbOwner && isHouseName(fbOwner)) {
      return fbOwner;
    }
    return flat;
  }

  function csvEnrich(r) {
    var id = String(r.record_id || r.id || '');
    var row = CSV_LOOKUP[id];
    if (!row) return { productType: '', marketingAssist: '' };
    return {
      productType: (row.productType || '').trim(),
      marketingAssist: (row.marketingAssist || '').trim()
    };
  }

  function mapRecord(r) {
    var extra = csvEnrich(r);
    var leadSource = (r.lead_source || r.Lead_Source2 || '').trim();
    return {
      recordId: String(r.record_id || r.id || ''),
      company: r.company || r.Deal_Name || '',
      funding: nn(r.funding || r.Funded_Amount),
      revenue: nn(r.revenue || r.Total_rev),
      points: nn(r.points || r.pts),
      leadSource: leadSource,
      state: (r.state || r.State || '').trim(),
      lender: normalizeLender(r.lender || r.Lender || ''),
      packageOwner: packageOwnerFromRecord(r),
      dealType: normalizeDealType(r.deal_type || r.Deal_Type || ''),
      productType: extra.productType || normalizeDealType(r.product_type || r.Product_Type || ''),
      marketingAssist: extra.marketingAssist || (r.marketing_assist || r.Marketing_Master || '').trim(),
      date: parseDate(r.date_funded || r.Date_Funded || '')
    };
  }

  function parseCsvLine(line) {
    var out = [];
    var cur = '';
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function loadCsvLookup() {
    return fetch('../funding_book.csv')
      .then(function (res) { return res.ok ? res.text() : ''; })
      .catch(function () { return ''; })
      .then(function (text) {
        if (!text) return;
        var lines = text.split(/\r?\n/);
        if (!lines.length) return;
        var headers = parseCsvLine(lines[0]);
        var idIdx = headers.indexOf('id');
        var ptIdx = headers.indexOf('Product_Type');
        var mmIdx = headers.indexOf('Marketing_Master');
        if (idIdx < 0) return;
        for (var i = 1; i < lines.length; i++) {
          if (!lines[i]) continue;
          var cols = parseCsvLine(lines[i]);
          var id = (cols[idIdx] || '').trim();
          if (!id) continue;
          var mm = mmIdx >= 0 ? (cols[mmIdx] || '').trim() : '';
          if (mm === '-' || mm === '0.0%') mm = '';
          CSV_LOOKUP[id] = {
            productType: ptIdx >= 0 ? (cols[ptIdx] || '').trim() : '',
            marketingAssist: mm
          };
        }
      });
  }

  function expandFilterValues(field, selected) {
    if (!selected || !selected.length) return null;
    var expanded = {};
    selected.forEach(function (val) {
      if (val === LEAD_SOURCE_GROUP_FACEBOOK) {
        DEALS.forEach(function (d) {
          if (isFacebookNonSpo(d.leadSource)) expanded['__fb:' + d.leadSource] = d.leadSource;
        });
        return;
      }
      if (val === LEAD_SOURCE_GROUP_FB_SPO) {
        DEALS.forEach(function (d) {
          if (isFacebookSpo(d.leadSource)) expanded['__fbspo:' + d.leadSource] = d.leadSource;
        });
        return;
      }
      if (val.indexOf('__parent:') === 0) {
        var parent = val.slice(9);
        DEALS.forEach(function (d) {
          var v = d[field];
          if (!v) return;
          if (normStr(v) === normStr(parent) || normStr(v).indexOf(normStr(parent) + ' -') === 0 || normStr(v).indexOf(normStr(parent) + '-') === 0) {
            expanded[v] = v;
          }
        });
        return;
      }
      expanded[val] = val;
    });
    return Object.keys(expanded);
  }

  function matchesMulti(field, dealVal, selected) {
    var expanded = expandFilterValues(field, selected);
    if (!expanded) return true;
    if (!dealVal) return false;
    var dv = field === 'state' ? normState(dealVal) : normStr(dealVal);
    return expanded.some(function (v) {
      return field === 'state' ? normState(v) === dv : normStr(v) === dv;
    });
  }

  function dateRangeBounds() {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth();
    var start, end;

    switch (FILTERS.dateRange) {
      case 'today':
        start = new Date(y, m, now.getDate(), 0, 0, 0);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
        break;
      case 'ytd':
        start = new Date(y, 0, 1);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
        break;
      case 'last_month':
        start = new Date(y, m - 1, 1);
        end = new Date(y, m, 0, 23, 59, 59);
        break;
      case 'last_3_months':
        start = new Date(y, m - 2, 1);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
        break;
      case 'last_6_months':
        start = new Date(y, m - 5, 1);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
        break;
      case 'this_month':
        start = new Date(y, m, 1);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
        break;
      case 'all_time':
        return null;
      case 'custom':
        start = FILTERS.customFrom ? parseDate(FILTERS.customFrom) : null;
        end = FILTERS.customTo ? parseDate(FILTERS.customTo) : null;
        if (end) end.setHours(23, 59, 59, 999);
        if (!start && !end) return null;
        return { start: start, end: end };
      default:
        start = new Date(y, 0, 1);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
    }
    return { start: start, end: end };
  }

  function inDateRange(d) {
    if (!d.date) return false;
    var bounds = dateRangeBounds();
    if (!bounds) return true;
    if (bounds.start && d.date < bounds.start) return false;
    if (bounds.end && d.date > bounds.end) return false;
    return true;
  }

  function applyFilters(deals) {
    return deals.filter(function (d) {
      if (!inDateRange(d)) return false;
      if (!matchesMulti('leadSource', d.leadSource, FILTERS.leadSource)) return false;
      if (!matchesMulti('marketingAssist', d.marketingAssist, FILTERS.marketingAssist)) return false;
      if (!matchesMulti('state', d.state, FILTERS.state)) return false;
      if (!matchesMulti('lender', d.lender, FILTERS.lender)) return false;
      if (!matchesMulti('productType', d.productType, FILTERS.productType)) return false;
      if (!matchesMulti('dealType', d.dealType, FILTERS.dealType)) return false;
      return true;
    });
  }

  function aggregateByRep(deals) {
    var by = {};
    deals.forEach(function (d) {
      var name = d.packageOwner;
      if (!name) return;
      if (!by[name]) {
        by[name] = { name: name, volume: 0, revenue: 0, points: 0, count: 0 };
      }
      by[name].volume += d.funding;
      by[name].revenue += d.revenue;
      by[name].points += d.points;
      by[name].count += 1;
    });
    return Object.values(by).map(function (r) {
      r.avg = r.count ? r.volume / r.count : 0;
      r.avgRev = r.count ? r.revenue / r.count : 0;
      r.avgPts = r.count ? r.points / r.count : 0;
      return r;
    });
  }

  function sortRows(rows) {
    var key = SORT_KEY;
    var dir = SORT_DIR === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (key === 'name') {
        return dir * String(av || '').localeCompare(String(bv || ''));
      }
      av = av || 0;
      bv = bv || 0;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function repPersonId(name) {
    if (!window.REPS || !name) return null;
    var n = name.toLowerCase();
    var keys = Object.keys(window.REPS);
    for (var i = 0; i < keys.length; i++) {
      var rep = window.REPS[keys[i]];
      if (!rep) continue;
      var book = (rep.bookName || rep.name || '').toLowerCase();
      if (book && n.indexOf(book) > -1) return keys[i];
      if (n.indexOf(keys[i]) > -1) return keys[i];
      var first = (rep.name || '').split(' ')[0].toLowerCase();
      if (first && first.length > 2 && n.indexOf(first) > -1) return keys[i];
    }
    return null;
  }

  function repTeam(name) {
    var id = repPersonId(name);
    if (id && window.REPS[id] && window.REPS[id].company) return window.REPS[id].company;
    return 'Capital Infusion';
  }

  function multiFilterLabel(key) {
    var arr = FILTERS[key];
    if (!arr || !arr.length) return 'All';
    if (key === 'leadSource') {
      if (arr.length === 1 && arr[0].indexOf('__') === 0) {
        if (arr[0] === LEAD_SOURCE_GROUP_FACEBOOK) return 'Facebook';
        if (arr[0] === LEAD_SOURCE_GROUP_FB_SPO) return 'Facebook - SPO';
        if (arr[0].indexOf('__parent:') === 0) return arr[0].slice(9);
      }
    }
    if (arr.length === 1) return arr[0].indexOf('__parent:') === 0 ? arr[0].slice(9) : arr[0];
    return arr.length + ' selected';
  }

  function filterDisplayValue(key) {
    if (key === 'dateRange') {
      var preset = DATE_PRESETS.filter(function (p) { return p.id === FILTERS.dateRange; })[0];
      if (FILTERS.dateRange === 'custom' && (FILTERS.customFrom || FILTERS.customTo)) {
        return (FILTERS.customFrom || '…') + ' – ' + (FILTERS.customTo || '…');
      }
      return preset ? preset.label : 'Year to date';
    }
    return multiFilterLabel(key);
  }

  function dateRangeMetaLabel() {
    var preset = DATE_PRESETS.filter(function (p) { return p.id === FILTERS.dateRange; })[0];
    return preset ? preset.label : 'Year to date';
  }

  function buildFacetValues(deals, field) {
    var seen = {};
    deals.forEach(function (d) {
      var val = d[field];
      if (!val) return;
      var key = field === 'state' ? normState(val) : val;
      if (!seen[key]) seen[key] = field === 'state' ? normState(val) : val;
    });
    return Object.values(seen).sort(function (a, b) {
      return String(a).localeCompare(String(b));
    });
  }

  function buildGroupedTree(deals, field) {
    var values = buildFacetValues(deals, field);
    var parents = {};
    var standalone = [];

    values.forEach(function (v) {
      var m = v.match(/^([^–\-]+?)\s*[-–]\s*(.+)$/);
      if (m) {
        var parent = m[1].trim();
        if (!parents[parent]) parents[parent] = [];
        parents[parent].push(v);
      } else {
        standalone.push(v);
      }
    });

    var tree = [];
    if (field === 'leadSource') {
      var hasFb = false;
      var hasFbSpo = false;
      values.forEach(function (v) {
        if (isFacebookSpo(v)) hasFbSpo = true;
        else if (isFacebookNonSpo(v)) hasFb = true;
      });
      if (hasFb) tree.push({ type: 'leaf', value: LEAD_SOURCE_GROUP_FACEBOOK, label: 'Facebook' });
      if (hasFbSpo) tree.push({ type: 'leaf', value: LEAD_SOURCE_GROUP_FB_SPO, label: 'Facebook - SPO' });
    }

    Object.keys(parents).sort().forEach(function (p) {
      if (parents[p].length >= 1) {
        tree.push({
          type: 'parent',
          value: '__parent:' + p,
          label: p,
          children: parents[p].sort().map(function (c) {
            return { type: 'child', value: c, label: c };
          })
        });
      }
    });

    standalone.forEach(function (v) {
      if (field === 'leadSource' && looksLikeFacebook(v)) return;
      if (parents[v]) return;
      tree.push({ type: 'leaf', value: v, label: v });
    });

    return tree;
  }

  function renderFilterChips() {
    var grid = document.getElementById('fbFilterGrid');
    if (!grid) return;
    grid.innerHTML = FILTER_DEFS.map(function (def) {
      var active = def.type === 'date'
        ? FILTERS.dateRange !== 'ytd' || FILTERS.customFrom || FILTERS.customTo
        : (FILTERS[def.key] && FILTERS[def.key].length > 0);
      if (def.key === 'dateRange' && FILTERS.dateRange === 'ytd') active = false;
      var val = filterDisplayValue(def.key);
      return '<button type="button" class="fb-filter-chip' + (active ? ' active' : '') + '"' +
        ' data-filter-key="' + def.key + '">' +
        '<span class="fb-filter-chip-name">' + esc(def.label) + '</span>' +
        '<span class="fb-filter-chip-val">' + esc(val) + '</span>' +
        '</button>';
    }).join('');

    grid.querySelectorAll('.fb-filter-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openFilterPopup(btn.getAttribute('data-filter-key'));
      });
    });
  }

  function renderActiveTags() {
    var wrap = document.getElementById('fbActiveFilters');
    if (!wrap) return;
    var tags = [];

    FILTER_DEFS.forEach(function (def) {
      if (def.key === 'dateRange') {
        if (FILTERS.dateRange !== 'ytd' || FILTERS.customFrom || FILTERS.customTo) {
          tags.push({ key: def.key, label: def.label + ': ' + filterDisplayValue(def.key) });
        }
        return;
      }
      if (FILTERS[def.key] && FILTERS[def.key].length) {
        tags.push({ key: def.key, label: def.label + ': ' + filterDisplayValue(def.key) });
      }
    });

    if (!tags.length) {
      wrap.innerHTML = '';
      return;
    }

    wrap.innerHTML = tags.map(function (t) {
      return '<span class="fb-active-tag">' + esc(t.label) +
        '<button type="button" data-clear-key="' + t.key + '" aria-label="Remove ' + esc(t.label) + '">&times;</button></span>';
    }).join('');

    wrap.querySelectorAll('[data-clear-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearFilterKey(btn.getAttribute('data-clear-key'));
        render();
      });
    });
  }

  function clearFilterKey(key) {
    if (key === 'dateRange') {
      FILTERS.dateRange = 'ytd';
      FILTERS.customFrom = '';
      FILTERS.customTo = '';
    } else {
      FILTERS[key] = [];
    }
  }

  function renderHeroKpis(filtered) {
    var vol = filtered.reduce(function (s, d) { return s + d.funding; }, 0);
    var reps = aggregateByRep(filtered);
    var elVol = document.getElementById('fbKpiVolume');
    var elDeals = document.getElementById('fbKpiDeals');
    var elAvg = document.getElementById('fbKpiAvg');
    var elReps = document.getElementById('fbKpiReps');
    if (elVol) elVol.textContent = fmtFull(vol);
    if (elDeals) elDeals.textContent = filtered.length.toLocaleString();
    if (elAvg) elAvg.textContent = filtered.length ? fmtFull(vol / filtered.length) : fmtFull(0);
    if (elReps) elReps.textContent = reps.length.toLocaleString();
  }

  function renderHeroSpotlight(rows) {
    var el = document.getElementById('fbHeroSpotlight');
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var top = rows[0];
    var pid = repPersonId(top.name);
    var rep = pid && window.REPS ? window.REPS[pid] : null;
    var photoHtml = '<div class="fb-spot-photo-ring" id="fbSpotPhotoRing">' +
      '<img id="fbSpotPhoto" alt="" hidden />' +
      '<div class="hero-photo-placeholder" aria-hidden="true">?</div></div>';

    el.innerHTML =
      photoHtml +
      '<div class="fb-spot-name">' + esc(top.name) + '</div>';

    if (window.setHeroRepPhoto && rep) {
      window.setHeroRepPhoto(
        document.getElementById('fbSpotPhotoRing'),
        document.getElementById('fbSpotPhoto'),
        rep
      );
    }
  }

  function renderSortHeaders() {
    var thead = document.querySelector('#fbRepTable thead tr');
    if (!thead) return;
    thead.querySelectorAll('[data-sort]').forEach(function (th) {
      var key = th.getAttribute('data-sort');
      var arrow = th.querySelector('.fb-sort-arrow');
      if (!arrow) return;
      if (key === SORT_KEY) {
        arrow.textContent = SORT_DIR === 'asc' ? '▲' : '▼';
        th.classList.add('sorted');
      } else {
        arrow.textContent = '';
        th.classList.remove('sorted');
      }
    });
  }

  function renderTable(rows) {
    var tbody = document.getElementById('fbRepTableBody');
    var empty = document.getElementById('fbEmptyState');
    var table = document.getElementById('fbRepTable');
    var meta = document.getElementById('fbTableMeta');
    if (meta) meta.textContent = dateRangeMetaLabel() + ' · ' + rows.length + ' rep' + (rows.length === 1 ? '' : 's');

    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '';
      if (table) table.hidden = true;
      if (empty) empty.hidden = false;
      renderHeroSpotlight([]);
      return;
    }
    if (table) table.hidden = false;
    if (empty) empty.hidden = true;

    tbody.innerHTML = rows.map(function (r, i) {
      var pid = repPersonId(r.name);
      var nameCell = pid
        ? '<span class="fb-rep-name" data-person-id="' + pid + '" role="button" tabindex="0">' + esc(r.name) + '</span>'
        : '<span class="fb-rep-name">' + esc(r.name) + '</span>';
      var rowCls = i === 0 ? ' class="fb-row-top"' : '';
      return '<tr' + rowCls + '>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + nameCell + '</td>' +
        '<td><span class="fb-money-total">' + fmtFull(r.volume) + '</span></td>' +
        '<td><span class="fb-money">' + fmtFull(r.revenue) + '</span></td>' +
        '<td><span class="fb-pts">' + fmtPts(r.points) + '</span></td>' +
        '<td>' + esc(repTeam(r.name)) + '</td>' +
        '<td>' + r.count + '</td>' +
        '<td><span class="fb-money">' + fmtFull(r.avg) + '</span></td>' +
        '<td><span class="fb-money">' + fmtFull(r.avgRev) + '</span></td>' +
        '</tr>';
    }).join('');

    renderSortHeaders();
    renderHeroSpotlight(rows);
  }

  function render() {
    var filtered = applyFilters(DEALS);
    var rows = sortRows(aggregateByRep(filtered));
    renderFilterChips();
    renderActiveTags();
    renderHeroKpis(filtered);
    renderTable(rows);
  }

  function draftHas(val) {
    return popupDraft.indexOf(val) > -1;
  }

  function findOptInput(container, val) {
    var found = null;
    container.querySelectorAll('input[data-opt]').forEach(function (inp) {
      if (inp.getAttribute('data-opt') === val) found = inp;
    });
    return found;
  }

  function toggleDraftVal(val, children) {
    var idx = popupDraft.indexOf(val);
    if (idx > -1) {
      popupDraft.splice(idx, 1);
      if (children) {
        children.forEach(function (c) {
          var ci = popupDraft.indexOf(c.value);
          if (ci > -1) popupDraft.splice(ci, 1);
        });
      }
    } else {
      popupDraft.push(val);
      if (children) {
        children.forEach(function (c) {
          if (popupDraft.indexOf(c.value) === -1) popupDraft.push(c.value);
        });
      }
    }
  }

  function renderCheckboxOptions(container, def, query) {
    if (!container || !def.field) return;

    var tree = def.grouped ? buildGroupedTree(DEALS, def.field) : buildFacetValues(DEALS, def.field).map(function (v) {
      return { type: 'leaf', value: v, label: v };
    });

    var q = normStr(query);
    if (q) {
      tree = tree.filter(function (node) {
        if (node.type === 'parent') {
          node.children = node.children.filter(function (c) { return normStr(c.label).indexOf(q) > -1; });
          return normStr(node.label).indexOf(q) > -1 || node.children.length;
        }
        return normStr(node.label).indexOf(q) > -1;
      });
    }

    var allChecked = !popupDraft.length;
    var html = '<label class="fb-filter-check fb-filter-check-all">' +
      '<input type="checkbox" data-opt-all="1"' + (allChecked ? ' checked' : '') + ' />' +
      '<span>Select all</span></label>';

    tree.slice(0, 250).forEach(function (node) {
      if (node.type === 'parent') {
        var pChecked = draftHas(node.value);
        html += '<label class="fb-filter-check fb-filter-check-parent">' +
          '<input type="checkbox" data-opt="' + esc(node.value) + '"' + (pChecked ? ' checked' : '') + ' />' +
          '<span>' + esc(node.label) + '</span></label>';
        node.children.forEach(function (c) {
          html += '<label class="fb-filter-check fb-filter-check-child">' +
            '<input type="checkbox" data-opt="' + esc(c.value) + '"' + (draftHas(c.value) ? ' checked' : '') + ' />' +
            '<span>' + esc(c.label) + '</span></label>';
        });
      } else {
        html += '<label class="fb-filter-check">' +
          '<input type="checkbox" data-opt="' + esc(node.value) + '"' + (draftHas(node.value) ? ' checked' : '') + ' />' +
          '<span>' + esc(node.label) + '</span></label>';
      }
    });

    container.innerHTML = html;

    container.querySelectorAll('input[data-opt-all]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        popupDraft = [];
        container.querySelectorAll('input[data-opt]').forEach(function (c) { c.checked = false; });
        inp.checked = true;
      });
    });

    container.querySelectorAll('input[data-opt]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var val = inp.getAttribute('data-opt');
        var parentNode = tree.filter(function (n) { return n.value === val; })[0];
        if (parentNode && parentNode.type === 'parent') {
          toggleDraftVal(val, parentNode.children);
          parentNode.children.forEach(function (c) {
            var childInp = findOptInput(container, c.value);
            if (childInp) childInp.checked = draftHas(c.value);
          });
          inp.checked = draftHas(val);
        } else {
          if (inp.checked) {
            if (popupDraft.indexOf(val) === -1) popupDraft.push(val);
          } else {
            var idx = popupDraft.indexOf(val);
            if (idx > -1) popupDraft.splice(idx, 1);
          }
        }
        var allInp = container.querySelector('input[data-opt-all]');
        if (allInp) allInp.checked = !popupDraft.length;
      });
    });
  }

  function openFilterPopup(key) {
    var def = FILTER_DEFS.filter(function (d) { return d.key === key; })[0];
    if (!def) return;

    popupKey = key;
    if (key === 'dateRange') {
      popupDraft = FILTERS.dateRange;
    } else {
      popupDraft = (FILTERS[key] || []).slice();
    }

    var overlay = document.getElementById('fbFilterOverlay');
    var title = document.getElementById('fbFilterModalTitle');
    var searchWrap = document.getElementById('fbFilterSearchWrap');
    var searchInput = document.getElementById('fbFilterSearch');
    var options = document.getElementById('fbFilterOptions');

    if (title) title.textContent = def.label;
    if (searchWrap) searchWrap.hidden = def.type === 'date' ? true : !def.searchable;
    if (searchInput) searchInput.value = '';

    if (def.type === 'date') {
      renderDateOptions(options);
    } else {
      renderCheckboxOptions(options, def, '');
    }

    if (searchInput && def.searchable) {
      searchInput.oninput = function () {
        renderCheckboxOptions(options, def, searchInput.value);
      };
    }

    if (overlay) {
      overlay.hidden = false;
      requestAnimationFrame(function () { overlay.classList.add('open'); });
    }
    document.body.style.overflow = 'hidden';
  }

  function renderDateOptions(container) {
    if (!container) return;
    var html = '<div class="fb-date-presets">';
    DATE_PRESETS.forEach(function (p) {
      var sel = (popupDraft || FILTERS.dateRange) === p.id ? ' selected' : '';
      html += '<button type="button" class="fb-filter-option' + sel + '" data-date-preset="' + p.id + '">' + esc(p.label) + '</button>';
    });
    html += '</div>';
    html += '<div class="fb-date-custom">' +
      '<label>From<input type="date" id="fbCustomFrom" value="' + esc(FILTERS.customFrom) + '" /></label>' +
      '<label>To<input type="date" id="fbCustomTo" value="' + esc(FILTERS.customTo) + '" /></label>' +
      '</div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-date-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        popupDraft = btn.getAttribute('data-date-preset');
        container.querySelectorAll('[data-date-preset]').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
      });
    });
  }

  function closeFilterPopup() {
    var overlay = document.getElementById('fbFilterOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(function () { overlay.hidden = true; }, 200);
    }
    popupKey = null;
    popupDraft = [];
  }

  function applyFilterPopup() {
    if (!popupKey) return;
    if (popupKey === 'dateRange') {
      FILTERS.dateRange = popupDraft || 'ytd';
      var fromEl = document.getElementById('fbCustomFrom');
      var toEl = document.getElementById('fbCustomTo');
      if (fromEl) FILTERS.customFrom = fromEl.value;
      if (toEl) FILTERS.customTo = toEl.value;
      if (FILTERS.dateRange === 'custom' && !FILTERS.customFrom && !FILTERS.customTo) {
        FILTERS.dateRange = 'ytd';
      }
    } else {
      FILTERS[popupKey] = popupDraft.slice();
    }
    closeFilterPopup();
    render();
  }

  function clearFilterPopup() {
    if (!popupKey) return;
    if (popupKey === 'dateRange') {
      popupDraft = 'ytd';
      FILTERS.dateRange = 'ytd';
      FILTERS.customFrom = '';
      FILTERS.customTo = '';
      renderDateOptions(document.getElementById('fbFilterOptions'));
    } else {
      popupDraft = [];
      FILTERS[popupKey] = [];
      var def = FILTER_DEFS.filter(function (d) { return d.key === popupKey; })[0];
      if (def) renderCheckboxOptions(document.getElementById('fbFilterOptions'), def, '');
    }
    closeFilterPopup();
    render();
  }

  function wireModal() {
    var overlay = document.getElementById('fbFilterOverlay');
    var closeBtn = document.getElementById('fbFilterClose');
    var applyBtn = document.getElementById('fbFilterApply');
    var clearBtn = document.getElementById('fbFilterClear');

    if (closeBtn) closeBtn.addEventListener('click', closeFilterPopup);
    if (applyBtn) applyBtn.addEventListener('click', applyFilterPopup);
    if (clearBtn) clearBtn.addEventListener('click', clearFilterPopup);
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeFilterPopup();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && popupKey) closeFilterPopup();
    });
  }

  function wireSortHeaders() {
    document.querySelectorAll('#fbRepTable [data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (SORT_KEY === key) {
          SORT_DIR = SORT_DIR === 'asc' ? 'desc' : 'asc';
        } else {
          SORT_KEY = key;
          SORT_DIR = key === 'name' ? 'asc' : 'desc';
        }
        render();
      });
    });
  }

  function load(raw) {
    if (!raw || !raw.length) return;
    DEALS = raw.filter(function (r) { return r.company || r.Deal_Name; }).map(mapRecord);
    render();
  }

  function init() {
    wireModal();
    wireSortHeaders();
    renderFilterChips();
    loadCsvLookup().then(function () {
      if (window.CapMuseData) {
        return window.CapMuseData.getRawDeals().then(function (raw) {
          if (raw && raw.length) load(raw);
        });
      }
    });
    window.addEventListener('capmuse:deals-updated', function (e) {
      if (e.detail && e.detail.length) load(e.detail);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
