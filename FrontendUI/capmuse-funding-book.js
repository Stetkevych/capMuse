// Funding Book — filterable rep leaderboard from funding_book_live.json
(function () {
  if (!document.body.classList.contains('funding-book-page')) return;

  var DEALS = [];
  var FILTERS = {
    leadSource: '',
    marketingAssist: '',
    state: '',
    dateRange: 'ytd',
    customFrom: '',
    customTo: '',
    lender: '',
    funder: '',
    productType: '',
    dealType: ''
  };

  var FILTER_DEFS = [
    { key: 'leadSource', label: 'Lead Source', field: 'leadSource', searchable: true },
    { key: 'marketingAssist', label: 'Marketing Assist', disabled: true },
    { key: 'state', label: 'State', field: 'state', searchable: true },
    { key: 'dateRange', label: 'Date Range', type: 'date' },
    { key: 'lender', label: 'Lender', field: 'lender', searchable: true },
    { key: 'funder', label: 'Funder', field: 'packageOwner', searchable: true },
    { key: 'productType', label: 'Product Type', disabled: true },
    { key: 'dealType', label: 'Deal Type', field: 'dealType', searchable: true }
  ];

  var DATE_PRESETS = [
    { id: 'ytd', label: 'Year to date' },
    { id: 'last_month', label: 'Last month' },
    { id: 'last_3_months', label: 'Last 3 months' },
    { id: 'last_6_months', label: 'Last 6 months' },
    { id: 'this_month', label: 'This month' },
    { id: 'all_time', label: 'All time' },
    { id: 'custom', label: 'Custom range' }
  ];

  var popupKey = null;
  var popupDraft = '';

  // Mis-synced records where puller was copied into package_owner (Package Owner is House in Zoho).
  // Remove entries after S3 data is repaired or webhook sends Package_Owner.name.
  var PACKAGE_OWNER_RECORD_FIXES = {
    '3793076000601237337': 'House .',
    '3793076000605384128': 'House .',
    '3793076000606189343': 'House .',
    '3793076000624144182': 'House .',
    '3793076000649034499': 'House .'
  };

  function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }
  function fmt(v) {
    if (!v) return '$0';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(v).toLocaleString();
  }
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function parseDate(s) {
    if (!s) return null;
    var d = new Date(String(s).length === 10 ? String(s) + 'T12:00:00' : s);
    return isNaN(d.getTime()) ? null : d;
  }
  function normState(s) {
    return String(s || '').trim().toUpperCase();
  }
  function normStr(s) {
    return String(s || '').trim().toLowerCase();
  }

  var LEAD_SOURCE_GROUP_FACEBOOK = '__group:facebook';
  var LEAD_SOURCE_GROUP_FB_SPO = '__group:facebook-spo';

  function normLeadKey(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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

  function leadSourceFilterLabel(val) {
    if (val === LEAD_SOURCE_GROUP_FACEBOOK) return 'Facebook';
    if (val === LEAD_SOURCE_GROUP_FB_SPO) return 'Facebook - SPO';
    return val || 'All';
  }

  function leadSourceMatchesFilter(dealSource, filterValue) {
    if (!filterValue) return true;
    if (filterValue === LEAD_SOURCE_GROUP_FACEBOOK) return isFacebookNonSpo(dealSource);
    if (filterValue === LEAD_SOURCE_GROUP_FB_SPO) return isFacebookSpo(dealSource);
    return normStr(dealSource) === normStr(filterValue);
  }

  function buildLeadSourceOptions(deals) {
    var hasFacebook = false;
    var hasFacebookSpo = false;
    var others = {};
    deals.forEach(function (d) {
      var ls = d.leadSource;
      if (!ls) return;
      if (isFacebookSpo(ls)) {
        hasFacebookSpo = true;
        return;
      }
      if (isFacebookNonSpo(ls)) {
        hasFacebook = true;
        return;
      }
      if (!others[ls]) others[ls] = ls;
    });
    var opts = [];
    if (hasFacebook) opts.push({ value: LEAD_SOURCE_GROUP_FACEBOOK, label: 'Facebook' });
    if (hasFacebookSpo) opts.push({ value: LEAD_SOURCE_GROUP_FB_SPO, label: 'Facebook - SPO' });
    Object.values(others).sort(function (a, b) {
      return String(a).localeCompare(String(b));
    }).forEach(function (o) {
      opts.push({ value: o, label: o });
    });
    return opts;
  }

  function isHouseName(name) {
    var n = normStr(name).replace(/\./g, '').trim();
    return n === 'house';
  }

  function fundingBookOwnerFromRecord(r) {
    return (r.funding_book_owner || r.Funding_Book_Owner || r['Funding_Book_Owner.name'] || r.Owner || r['Owner.name'] || '').trim();
  }

  function packageOwnerFromRecord(r) {
    var recordId = String(r.record_id || '');
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

  function mapRecord(r) {
    return {
      company: r.company || r.Deal_Name || '',
      funding: nn(r.funding || r.Funded_Amount),
      revenue: nn(r.revenue || r.Total_rev),
      leadSource: (r.lead_source || r.Lead_Source2 || '').trim(),
      state: (r.state || r.State || '').trim(),
      lender: (r.lender || r.Lender || '').trim(),
      packageOwner: packageOwnerFromRecord(r),
      dealType: (r.deal_type || r.Deal_Type || '').trim(),
      date: parseDate(r.date_funded || r.Date_Funded || '')
    };
  }

  function buildFacetOptions(deals, field) {
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

  function dateRangeBounds() {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth();
    var start, end;

    switch (FILTERS.dateRange) {
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
      if (FILTERS.leadSource && !leadSourceMatchesFilter(d.leadSource, FILTERS.leadSource)) return false;
      if (FILTERS.state && normState(d.state) !== normState(FILTERS.state)) return false;
      if (FILTERS.lender && normStr(d.lender) !== normStr(FILTERS.lender)) return false;
      if (FILTERS.funder && normStr(d.packageOwner) !== normStr(FILTERS.funder)) return false;
      if (FILTERS.dealType && normStr(d.dealType) !== normStr(FILTERS.dealType)) return false;
      return true;
    });
  }

  function aggregateByRep(deals) {
    var by = {};
    deals.forEach(function (d) {
      var name = d.packageOwner;
      if (!name) return;
      if (!by[name]) {
        by[name] = { name: name, volume: 0, revenue: 0, count: 0 };
      }
      by[name].volume += d.funding;
      by[name].revenue += d.revenue;
      by[name].count += 1;
    });
    return Object.values(by)
      .map(function (r) {
        r.avg = r.count ? r.volume / r.count : 0;
        r.avgRev = r.count ? r.revenue / r.count : 0;
        return r;
      })
      .sort(function (a, b) { return b.volume - a.volume; });
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

  function filterDisplayValue(key) {
    if (key === 'dateRange') {
      var preset = DATE_PRESETS.filter(function (p) { return p.id === FILTERS.dateRange; })[0];
      if (FILTERS.dateRange === 'custom' && (FILTERS.customFrom || FILTERS.customTo)) {
        return (FILTERS.customFrom || '…') + ' – ' + (FILTERS.customTo || '…');
      }
      return preset ? preset.label : 'Year to date';
    }
    if (key === 'leadSource') return leadSourceFilterLabel(FILTERS.leadSource);
    var val = FILTERS[key];
    return val || 'All';
  }

  function dateRangeMetaLabel() {
    var preset = DATE_PRESETS.filter(function (p) { return p.id === FILTERS.dateRange; })[0];
    return preset ? preset.label : 'Year to date';
  }

  function renderFilterChips() {
    var grid = document.getElementById('fbFilterGrid');
    if (!grid) return;
    grid.innerHTML = FILTER_DEFS.map(function (def) {
      var active = def.type === 'date'
        ? FILTERS.dateRange !== 'ytd' || FILTERS.customFrom || FILTERS.customTo
        : !!FILTERS[def.key];
      if (def.key === 'dateRange' && FILTERS.dateRange === 'ytd') active = false;
      var val = def.disabled ? 'Coming soon' : filterDisplayValue(def.key);
      return '<button type="button" class="fb-filter-chip' + (active ? ' active' : '') + '"' +
        ' data-filter-key="' + def.key + '"' +
        (def.disabled ? ' disabled title="Coming soon — field not in live sync yet"' : '') + '>' +
        '<span class="fb-filter-chip-name">' + esc(def.label) + '</span>' +
        '<span class="fb-filter-chip-val">' + esc(val) + '</span>' +
        '</button>';
    }).join('');

    grid.querySelectorAll('.fb-filter-chip:not([disabled])').forEach(function (btn) {
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
      if (def.disabled) return;
      if (def.key === 'dateRange') {
        if (FILTERS.dateRange !== 'ytd' || FILTERS.customFrom || FILTERS.customTo) {
          tags.push({ key: def.key, label: def.label + ': ' + filterDisplayValue(def.key) });
        }
        return;
      }
      if (FILTERS[def.key]) {
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
      FILTERS[key] = '';
    }
  }

  function renderHeroKpis(filtered) {
    var vol = filtered.reduce(function (s, d) { return s + d.funding; }, 0);
    var reps = aggregateByRep(filtered);
    var elVol = document.getElementById('fbKpiVolume');
    var elDeals = document.getElementById('fbKpiDeals');
    var elAvg = document.getElementById('fbKpiAvg');
    var elReps = document.getElementById('fbKpiReps');
    if (elVol) elVol.textContent = fmt(vol);
    if (elDeals) elDeals.textContent = filtered.length.toLocaleString();
    if (elAvg) elAvg.textContent = filtered.length ? fmt(vol / filtered.length) : '$0';
    if (elReps) elReps.textContent = reps.length.toLocaleString();
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
      return;
    }
    if (table) table.hidden = false;
    if (empty) empty.hidden = true;

    tbody.innerHTML = rows.map(function (r, i) {
      var pid = repPersonId(r.name);
      var nameCell = pid
        ? '<span class="fb-rep-name" data-person-id="' + pid + '" role="button" tabindex="0">' + esc(r.name) + '</span>'
        : '<span class="fb-rep-name">' + esc(r.name) + '</span>';
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + nameCell + '</td>' +
        '<td><span class="fb-money">' + fmt(r.volume) + '</span></td>' +
        '<td>' + esc(repTeam(r.name)) + '</td>' +
        '<td>' + r.count + '</td>' +
        '<td><span class="fb-money">' + fmt(r.avg) + '</span></td>' +
        '<td><span class="fb-money">' + fmt(r.avgRev) + '</span></td>' +
        '</tr>';
    }).join('');
  }

  function render() {
    var filtered = applyFilters(DEALS);
    var rows = aggregateByRep(filtered);
    renderFilterChips();
    renderActiveTags();
    renderHeroKpis(filtered);
    renderTable(rows);
  }

  function openFilterPopup(key) {
    var def = FILTER_DEFS.filter(function (d) { return d.key === key; })[0];
    if (!def || def.disabled) return;

    popupKey = key;
    popupDraft = FILTERS[key] || (key === 'dateRange' ? FILTERS.dateRange : '');

    var overlay = document.getElementById('fbFilterOverlay');
    var title = document.getElementById('fbFilterModalTitle');
    var searchWrap = document.getElementById('fbFilterSearchWrap');
    var searchInput = document.getElementById('fbFilterSearch');
    var options = document.getElementById('fbFilterOptions');

    if (title) title.textContent = def.label;
    if (searchWrap) searchWrap.hidden = def.type !== 'date' && !def.searchable;
    if (searchInput) searchInput.value = '';

    if (def.type === 'date') {
      renderDateOptions(options);
    } else {
      renderFieldOptions(options, def, '');
    }

    if (searchInput && def.searchable) {
      searchInput.oninput = function () {
        renderFieldOptions(options, def, searchInput.value);
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

  function renderFieldOptions(container, def, query) {
    if (!container || !def.field) return;
    var opts;
    if (def.key === 'leadSource') {
      opts = buildLeadSourceOptions(DEALS);
    } else {
      opts = buildFacetOptions(DEALS, def.field).map(function (o) {
        return { value: o, label: o };
      });
    }
    var q = normStr(query);
    if (q) {
      opts = opts.filter(function (o) { return normStr(o.label).indexOf(q) > -1; });
    }

    var html = '<button type="button" class="fb-filter-option' + (!popupDraft ? ' selected' : '') + '" data-opt="">All</button>';
    opts.slice(0, 200).forEach(function (o) {
      var sel = popupDraft === o.value ? ' selected' : '';
      html += '<button type="button" class="fb-filter-option' + sel + '" data-opt="' + esc(o.value) + '">' + esc(o.label) + '</button>';
    });
    if (opts.length > 200) {
      html += '<div style="padding:10px 12px;font-size:12px;color:var(--text-muted)">Showing first 200 — use search to narrow.</div>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.fb-filter-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        popupDraft = btn.getAttribute('data-opt') || '';
        container.querySelectorAll('.fb-filter-option').forEach(function (b) { b.classList.remove('selected'); });
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
    popupDraft = '';
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
      FILTERS[popupKey] = popupDraft || '';
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
      popupDraft = '';
      FILTERS[popupKey] = '';
      var def = FILTER_DEFS.filter(function (d) { return d.key === popupKey; })[0];
      if (def) renderFieldOptions(document.getElementById('fbFilterOptions'), def, '');
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

  function load(raw) {
    if (!raw || !raw.length) return;
    DEALS = raw.filter(function (r) { return r.company || r.Deal_Name; }).map(mapRecord);
    render();
  }

  function init() {
    wireModal();
    renderFilterChips();
    if (!window.CapMuseData) return;
    window.CapMuseData.getRawDeals().then(load);
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
