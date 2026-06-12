// Funding Book — filterable rep leaderboard from funding_book_live.json
(function () {
  if (!document.body.classList.contains('funding-book-page')) return;

  let DEALS = [];
  let RAW_DEALS = [];
  let CSV_LOOKUP = {};
  let CSV_URLS = [
    'https://capmuse-data-882611632216.s3.amazonaws.com/funding_book.csv',
    '../funding_book.csv',
    'funding_book.csv'
  ];
  let SORT_KEY = 'volume';
  let SORT_DIR = 'desc';
  let CACHED_ROWS = [];

  let SORT_LABELS = {
    name: 'Name',
    volume: 'Total Funding',
    revenue: 'Total Revenue',
    points: 'Points',
    count: 'Count',
    avg: 'Avg. Funding',
    avgRev: 'Avg. Rev'
  };

  let SORT_COL_INDEX = {
    name: 2,
    volume: 3,
    revenue: 4,
    points: 5,
    count: 7,
    avg: 8,
    avgRev: 9
  };

  let GROUP_BY = 'packageOwner';

  let FILTERS = {
    leadSource: [],
    marketingAssist: [],
    state: [],
    dateRange: 'ytd',
    customFrom: '',
    customTo: '',
    lender: [],
    productType: [],
    dealType: [],
    fundingMin: null,
    fundingMax: null
  };

  let GROUP_BY_OPTIONS = [
    { id: 'packageOwner', label: 'Package Owner' },
    { id: 'puller', label: 'Puller' }
  ];

  let FILTER_DEFS = [
    { key: 'groupBy', label: 'Group by', type: 'groupBy' },
    { key: 'leadSource', label: 'Lead Source', field: 'leadSource', searchable: true, grouped: true },
    { key: 'marketingAssist', label: 'Marketing Assist', field: 'marketingAssist', searchable: true },
    { key: 'state', label: 'State', field: 'state', searchable: true },
    { key: 'dateRange', label: 'Date Range', type: 'date' },
    { key: 'fundingRange', label: 'Funded Amount', type: 'range' },
    { key: 'lender', label: 'Lender', field: 'lender', searchable: true },
    { key: 'productType', label: 'Product Type', field: 'productType', searchable: true, extraOptions: ['Reverse'] },
    { key: 'dealType', label: 'Deal Type', field: 'dealType', searchable: true, grouped: true }
  ];

  let FUNDING_RANGE_STEP = 5000;

  let DATE_PRESETS = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'ytd', label: 'Year to date' },
    { id: 'last_month', label: 'Last month' },
    { id: 'last_3_months', label: 'Last 3 months' },
    { id: 'last_6_months', label: 'Last 6 months' },
    { id: 'this_month', label: 'This month' },
    { id: 'all_time', label: 'Last 24 Months' },
    { id: 'custom', label: 'Custom range' }
  ];

  let popupKey = null;
  let popupDraft = null;
  let DATA_STATUS = 'loading'; // loading | ready | error

  let PACKAGE_OWNER_RECORD_FIXES = {
    '3793076000601237337': 'House .',
    '3793076000605384128': 'House .',
    '3793076000606189343': 'House .',
    '3793076000624144182': 'House .',
    '3793076000649034499': 'House .'
  };

  let LENDER_ALIASES = {
    'can': 'Can Capital',
    'can capital': 'Can Capital',
    'canacap': 'Can Capital',
    'cancap': 'Can Capital',
    'can equipment': 'CAN Equipment',
    'ondeck (loc)': 'OnDeck (LOC)',
    'ondeck (canada)': 'OnDeck (Canada)',
    'ondeck (canda)': 'OnDeck (Canada)',
    '2m7': '2M7',
    'newco': 'NewCo',
    'sheaves': 'Sheaves'
  };

  let LEAD_SOURCE_GROUP_FACEBOOK = '__group:facebook';
  let LEAD_SOURCE_GROUP_FB_SPO = '__group:facebook-spo';

  function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }

  function fmtFull(v) {
    return '$' + Math.round(v || 0).toLocaleString('en-US');
  }

  function fmtFundingShort(v) {
    let n = Math.round(v || 0);
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + n.toLocaleString('en-US');
  }

  function roundFundingBound(v, up) {
    if (!v) return 0;
    let step = FUNDING_RANGE_STEP;
    return up ? Math.ceil(v / step) * step : Math.floor(v / step) * step;
  }

  function fundingDataBounds(exceptKey) {
    let deals = applyFilters(DEALS, exceptKey || 'fundingRange');
    let amounts = deals.map(function (d) { return d.funding || 0; }).filter(function (v) { return v > 0; });
    if (!amounts.length) return { min: 0, max: FUNDING_RANGE_STEP };
    let rawMin = Math.min.apply(null, amounts);
    let rawMax = Math.max.apply(null, amounts);
    return {
      min: roundFundingBound(rawMin, false),
      max: Math.max(roundFundingBound(rawMax, true), roundFundingBound(rawMin, false) + FUNDING_RANGE_STEP)
    };
  }

  function isFundingFilterActive() {
    return FILTERS.fundingMin != null || FILTERS.fundingMax != null;
  }

  function inFundingRange(d) {
    if (!isFundingFilterActive()) return true;
    let f = d.funding || 0;
    if (FILTERS.fundingMin != null && f < FILTERS.fundingMin) return false;
    if (FILTERS.fundingMax != null && f > FILTERS.fundingMax) return false;
    return true;
  }

  function fundingRangeLabel(min, max) {
    if (min != null && max != null) return fmtFundingShort(min) + ' – ' + fmtFundingShort(max);
    if (min != null) return fmtFundingShort(min) + '+';
    if (max != null) return 'Up to ' + fmtFundingShort(max);
    return 'All';
  }

  function fmtPts(v) {
    return (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function parseDate(s) {
    if (!s) return null;
    let str = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      let d = new Date(str + 'T12:00:00');
      return isNaN(d.getTime()) ? null : d;
    }
    let d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function localDateKey(date) {
    if (!date) return '';
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  function fundedDateKey(raw, parsedDate) {
    let m = String(raw || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    if (parsedDate) return localDateKey(parsedDate);
    return '';
  }

  function normalizeDateRangeId(value) {
    let id = typeof value === 'string' ? value.trim() : '';
    let i;
    for (i = 0; i < DATE_PRESETS.length; i++) {
      if (DATE_PRESETS[i].id === id) return id;
    }
    return 'ytd';
  }

  function normState(s) { return String(s || '').trim().toUpperCase(); }
  function normStr(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim()
      .toLowerCase();
  }

  function normLeadKey(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function normalizeLender(name) {
    let raw = String(name || '').trim();
    if (!raw) return '';
    let key = normStr(raw);
    if (LENDER_ALIASES[key]) return LENDER_ALIASES[key];
    if (key === 'can') return 'Can Capital';
    if (/^can\s+equipment$/i.test(raw)) return 'CAN Equipment';
    if (/^canacap$/i.test(raw) || /^cancap$/i.test(raw)) return 'Can Capital';
    if (/^ondeck\s*\(loc\)$/i.test(raw)) return 'OnDeck (LOC)';
    if (/^ondeck\s*\(canada\)$/i.test(raw) || /^ondeck\s*\(canda\)$/i.test(raw)) return 'OnDeck (Canada)';
    return raw;
  }

  function normalizeProductType(raw, dealType) {
    let s = String(raw || '').trim();
    if (s && s !== '-') return s;
    let dt = String(dealType || '').trim();
    if (!dt || dt === '-') return '';
    let m = dt.match(/^(?:renewal|new deal|add\s*[- ]?on)\s+(.+)$/i);
    if (m) return m[1].trim();
    return '';
  }

  function normalizeDealType(type) {
    let raw = String(type || '').trim();
    if (!raw || raw === '-') return '';
    let key = normStr(raw);
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
    let n = normLeadKey(leadSource);
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
    let recordId = String(r.record_id || r.id || '');
    if (PACKAGE_OWNER_RECORD_FIXES[recordId]) return PACKAGE_OWNER_RECORD_FIXES[recordId];

    let fromLookup = (r['Package_Owner.name'] || (r.Package_Owner && r.Package_Owner.name) || r.package_owner_name || '').trim();
    if (fromLookup) return fromLookup;

    let flat = (r.package_owner || '').trim();
    let puller = (r.puller || r.Puller || r['Puller.name'] || '').trim();
    let fbOwner = fundingBookOwnerFromRecord(r);

    if (flat && puller && normStr(flat) === normStr(puller) && fbOwner && isHouseName(fbOwner)) {
      return fbOwner;
    }
    return flat;
  }

  function pullerFromRecord(r) {
    return (r.puller || r.Puller || r['Puller.name'] || r.re_puller || '').trim();
  }

  function normalizeGroupBy(value) {
    let id = String(value || '').trim();
    let i;
    for (i = 0; i < GROUP_BY_OPTIONS.length; i++) {
      if (GROUP_BY_OPTIONS[i].id === id) return id;
    }
    return 'packageOwner';
  }

  function setGroupBy(value) {
    GROUP_BY = normalizeGroupBy(value);
  }

  function repNameFromDeal(d) {
    return GROUP_BY === 'puller' ? d.puller : d.packageOwner;
  }

  function groupByLabel() {
    let opt = GROUP_BY_OPTIONS.filter(function (o) { return o.id === GROUP_BY; })[0];
    return opt ? opt.label : 'Package Owner';
  }

  function resolveGroupByDraft() {
    let draft = normalizeGroupBy(popupDraft);
    if (draft !== 'packageOwner' || popupDraft === 'packageOwner') return draft;
    let selected = document.querySelector('#fbFilterOptions [data-group-by].selected');
    if (selected) return normalizeGroupBy(selected.getAttribute('data-group-by'));
    return GROUP_BY;
  }

  function csvHeaderIndex(headers, names) {
    let i;
    for (i = 0; i < names.length; i++) {
      let idx = headers.indexOf(names[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function csvEnrich(r) {
    let id = String(r.record_id || r.id || '');
    let row = CSV_LOOKUP[id];
    if (!row) {
      return { productType: '', marketingAssist: '', packageOwner: '', puller: '' };
    }
    return {
      productType: (row.productType || '').trim(),
      marketingAssist: (row.marketingAssist || '').trim(),
      packageOwner: (row.packageOwner || '').trim(),
      puller: (row.puller || '').trim()
    };
  }

  function dealPoints(funding, revenue) {
    return funding > 0 ? (revenue / funding) * 100 : 0;
  }

  function mapRecord(r) {
    let extra = csvEnrich(r);
    let leadSource = (r.lead_source || r.Lead_Source2 || '').trim();
    let funding = nn(r.funding || r.Funded_Amount);
    let revenue = nn(r.revenue || r.Total_rev);
    let dateFundedRaw = (r.date_funded || r.Date_Funded || '').trim();
    let date = parseDate(dateFundedRaw);
    return {
      recordId: String(r.record_id || r.id || ''),
      company: r.company || r.Deal_Name || '',
      funding: funding,
      revenue: revenue,
      points: dealPoints(funding, revenue),
      leadSource: leadSource,
      state: (r.state || r.State || '').trim(),
      lender: normalizeLender(r.lender || r.Lender || ''),
      packageOwner: extra.packageOwner || packageOwnerFromRecord(r),
      puller: extra.puller || pullerFromRecord(r),
      dealType: normalizeDealType(r.deal_type || r.Deal_Type || ''),
      productType: normalizeProductType(
        extra.productType || (r.product_type || r.Product_Type || ''),
        r.deal_type || r.Deal_Type || ''
      ),
      marketingAssist: extra.marketingAssist || (r.marketing_assist || r.Marketing_Master || '').trim(),
      dateFundedRaw: dateFundedRaw,
      date: date,
      dateKey: fundedDateKey(dateFundedRaw, date)
    };
  }

  function parseCsvLine(line) {
    let out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      let ch = line[i];
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

  function fetchCsvText(urlIndex) {
    if (urlIndex >= CSV_URLS.length) return Promise.resolve('');
    return fetch(CSV_URLS[urlIndex])
      .then(function (res) {
        if (res.ok) return res.text();
        return fetchCsvText(urlIndex + 1);
      })
      .catch(function () { return fetchCsvText(urlIndex + 1); });
  }

  function parseCsvLookup(text) {
    if (!text) return;
    let lines = text.split(/\r?\n/);
    if (!lines.length) return;
    let headers = parseCsvLine(lines[0]);
    let idIdx = csvHeaderIndex(headers, ['Record Id', 'record_id', 'id']);
    let ptIdx = csvHeaderIndex(headers, ['Product Type', 'Product_Type']);
    let mmIdx = csvHeaderIndex(headers, ['Marketing Master %', 'Marketing Master', 'Marketing_Master']);
    let poIdx = csvHeaderIndex(headers, ['Package Owner', 'Package_Owner.name']);
    let puIdx = csvHeaderIndex(headers, ['Puller', 'Puller.name']);
    if (idIdx < 0) return;
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      let cols = parseCsvLine(lines[i]);
      let id = (cols[idIdx] || '').trim();
      if (!id) continue;
      let mm = mmIdx >= 0 ? (cols[mmIdx] || '').trim() : '';
      if (mm === '-' || mm === '0.0%') mm = '';
      CSV_LOOKUP[id] = {
        productType: ptIdx >= 0 ? (cols[ptIdx] || '').trim() : '',
        marketingAssist: mm,
        packageOwner: poIdx >= 0 ? (cols[poIdx] || '').trim() : '',
        puller: puIdx >= 0 ? (cols[puIdx] || '').trim() : ''
      };
    }
  }

  function loadCsvLookup() {
    return fetchCsvText(0).then(function (text) {
      parseCsvLookup(text);
    });
  }

  function expandFilterValues(field, selected) {
    if (!selected || !selected.length) return null;
    let expanded = {};
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
      if (field === 'state' && val === STATE_GROUP_US) {
        DEALS.forEach(function (d) {
          let s = d.state;
          if (!s || isCanadianState(s)) return;
          expanded[normState(s)] = normState(s);
        });
        return;
      }
      if (field === 'state' && val === STATE_GROUP_CA) {
        DEALS.forEach(function (d) {
          let s = d.state;
          if (!s || !isCanadianState(s)) return;
          expanded[normState(s)] = normState(s);
        });
        return;
      }
      if (val.indexOf('__parent:') === 0) {
        let parent = val.slice(9);
        DEALS.forEach(function (d) {
          let v = d[field];
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
    let expanded = expandFilterValues(field, selected);
    if (!expanded) return true;
    if (!dealVal) return false;
    let dv = field === 'state' ? normState(dealVal) : normStr(dealVal);
    return expanded.some(function (v) {
      return field === 'state' ? normState(v) === dv : normStr(v) === dv;
    });
  }

  function dateRangeBounds() {
    let now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth();
    let start, end;

    switch (FILTERS.dateRange) {
      case 'today':
        start = new Date(y, m, now.getDate(), 0, 0, 0);
        end = new Date(y, m, now.getDate(), 23, 59, 59);
        break;
      case 'yesterday':
        start = new Date(y, m, now.getDate() - 1, 0, 0, 0);
        end = new Date(y, m, now.getDate() - 1, 23, 59, 59);
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
    let bounds = dateRangeBounds();
    if (!bounds) return true;
    let dealKey = d.dateKey || fundedDateKey(d.dateFundedRaw, d.date);
    if (!dealKey) return false;
    let startKey = bounds.start ? localDateKey(bounds.start) : '';
    let endKey = bounds.end ? localDateKey(bounds.end) : '9999-99-99';
    if (startKey && dealKey < startKey) return false;
    if (endKey && dealKey > endKey) return false;
    return true;
  }

  function applyFilters(deals, exceptKey) {
    return deals.filter(function (d) {
      if (!inDateRange(d)) return false;
      if (exceptKey !== 'leadSource' && !matchesMulti('leadSource', d.leadSource, FILTERS.leadSource)) return false;
      if (exceptKey !== 'marketingAssist' && !matchesMulti('marketingAssist', d.marketingAssist, FILTERS.marketingAssist)) return false;
      if (exceptKey !== 'state' && !matchesMulti('state', d.state, FILTERS.state)) return false;
      if (exceptKey !== 'lender' && !matchesMulti('lender', d.lender, FILTERS.lender)) return false;
      if (exceptKey !== 'productType' && !matchesMulti('productType', d.productType, FILTERS.productType)) return false;
      if (exceptKey !== 'dealType' && !matchesMulti('dealType', d.dealType, FILTERS.dealType)) return false;
      if (exceptKey !== 'fundingRange' && !inFundingRange(d)) return false;
      return true;
    });
  }

  function dealsForFacetOptions(excludeKey) {
    return applyFilters(DEALS, excludeKey);
  }

  function aggregateByRep(deals) {
    let by = {};
    deals.forEach(function (d) {
      let name = repNameFromDeal(d);
      if (!name) return;
      if (!by[name]) {
        by[name] = { name: name, volume: 0, revenue: 0, pointsSum: 0, count: 0 };
      }
      by[name].volume += d.funding;
      by[name].revenue += d.revenue;
      by[name].pointsSum += d.points;
      by[name].count += 1;
    });
    return Object.values(by).map(function (r) {
      r.avg = r.count ? r.volume / r.count : 0;
      r.avgRev = r.count ? r.revenue / r.count : 0;
      r.points = r.volume > 0 ? (r.revenue / r.volume) * 100 : 0;
      r.avgPts = r.count ? r.pointsSum / r.count : 0;
      delete r.pointsSum;
      return r;
    });
  }

  function sortRows(rows) {
    let key = SORT_KEY;
    let dir = SORT_DIR === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      let av = a[key];
      let bv = b[key];
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

  function repInitials(name) {
    return (name || '').split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  }

  function fbRepClickAttrs(pid, name) {
    if (!pid || !name) return '';
    return ' data-person-id="' + esc(pid) + '" data-fb-rep-name="' + esc(name) + '"' +
      ' role="button" tabindex="0" aria-label="View ' + esc(name) + ' stats"';
  }

  function repAvatarHtml(pid, name) {
    let rep = pid && window.REPS ? window.REPS[pid] : null;
    let photo = rep && rep.photo ? rep.photo : '';
    let init = repInitials(name);
    let pidAttr = pid ? fbRepClickAttrs(pid, name) : '';
    if (photo) {
      return '<img class="fb-rep-avatar"' + pidAttr + ' src="' + esc(photo) + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
        '<div class="fb-rep-initials" style="display:none"' + pidAttr + '>' + esc(init) + '</div>';
    }
    return '<div class="fb-rep-initials"' + pidAttr + '>' + esc(init) + '</div>';
  }

  function repPersonId(name) {
    if (window.resolveRepPersonId) return window.resolveRepPersonId(name);
    if (!window.REPS || !name) return null;
    return null;
  }

  function repTeam(name) {
    let id = repPersonId(name);
    if (id && window.REPS[id] && window.REPS[id].company) return window.REPS[id].company;
    return 'Capital Infusion';
  }

  function multiFilterLabel(key) {
    let arr = FILTERS[key];
    if (!arr || !arr.length) return 'All';
    if (key === 'leadSource') {
      if (arr.length === 1 && arr[0].indexOf('__') === 0) {
        if (arr[0] === LEAD_SOURCE_GROUP_FACEBOOK) return 'Facebook';
        if (arr[0] === LEAD_SOURCE_GROUP_FB_SPO) return 'Facebook - SPO';
        if (arr[0].indexOf('__parent:') === 0) return arr[0].slice(9);
      }
    }
    if (key === 'state' && arr.length === 1) {
      if (arr[0] === STATE_GROUP_US) return 'United States';
      if (arr[0] === STATE_GROUP_CA) return 'Canada Provinces';
    }
    if (arr.length === 1) return arr[0].indexOf('__parent:') === 0 ? arr[0].slice(9) : arr[0];
    return arr.length + ' selected';
  }

  function filterDisplayValue(key) {
    if (key === 'groupBy') {
      return groupByLabel();
    }
    if (key === 'dateRange') {
      let preset = DATE_PRESETS.filter(function (p) { return p.id === FILTERS.dateRange; })[0];
      if (FILTERS.dateRange === 'custom' && (FILTERS.customFrom || FILTERS.customTo)) {
        return (FILTERS.customFrom || '…') + ' – ' + (FILTERS.customTo || '…');
      }
      return preset ? preset.label : 'Year to date';
    }
    if (key === 'fundingRange') {
      if (!isFundingFilterActive()) return 'All';
      return fundingRangeLabel(FILTERS.fundingMin, FILTERS.fundingMax);
    }
    return multiFilterLabel(key);
  }

  function dateRangeMetaLabel() {
    let preset = DATE_PRESETS.filter(function (p) { return p.id === FILTERS.dateRange; })[0];
    return preset ? preset.label : 'Year to date';
  }

  function sortProductTypeFacets(values) {
    let sorted = values.slice().sort(function (a, b) {
      return String(a).localeCompare(String(b));
    });
    let reverseIdx = sorted.indexOf('Reverse');
    if (reverseIdx === -1) return sorted;
    sorted.splice(reverseIdx, 1);
    let wcIdx = sorted.indexOf('Working Capital');
    if (wcIdx === -1) sorted.push('Reverse');
    else sorted.splice(wcIdx + 1, 0, 'Reverse');
    return sorted;
  }

  let STATE_GROUP_US = '__state:us';
  let STATE_GROUP_CA = '__state:ca';

  let CANADIAN_STATE_CODES = {
    AB: 1, BC: 1, MB: 1, NB: 1, NL: 1, NS: 1, NT: 1, NU: 1, ON: 1, PE: 1, QC: 1, PQ: 1, SK: 1, YT: 1
  };

  let CANADIAN_STATE_NAMES = {
    alberta: 1,
    'british columbia': 1,
    manitoba: 1,
    'new brunswick': 1,
    'newfoundland and labrador': 1,
    newfoundland: 1,
    'nova scotia': 1,
    'northwest territories': 1,
    nunavut: 1,
    ontario: 1,
    'prince edward island': 1,
    quebec: 1,
    saskatchewan: 1,
    yukon: 1,
    'yukon territory': 1
  };

  function isCanadianState(val) {
    let raw = String(val || '').trim();
    if (!raw) return false;
    let code = normState(raw);
    if (code === 'CANADA') return true;
    if (CANADIAN_STATE_CODES[code]) return true;
    let name = normStr(raw);
    if (name === 'canada' || name.indexOf('canada') > -1) return true;
    if (CANADIAN_STATE_NAMES[name]) return true;
    let beforeComma = name.split(',')[0].trim();
    return !!CANADIAN_STATE_NAMES[beforeComma];
  }

  function partitionStateFacets(values) {
    let us = [];
    let canada = [];
    values.forEach(function (v) {
      if (isCanadianState(v)) canada.push(v);
      else us.push(v);
    });
    function byLabel(a, b) {
      return String(a).localeCompare(String(b));
    }
    us.sort(byLabel);
    canada.sort(byLabel);
    return { us: us, canada: canada };
  }

  function sortStateFacets(values) {
    let parts = partitionStateFacets(values);
    return parts.us.concat(parts.canada);
  }

  function buildStateGroupedTree(values) {
    let parts = partitionStateFacets(values);
    let tree = [];
    if (parts.us.length) {
      tree.push({
        type: 'parent',
        value: STATE_GROUP_US,
        label: 'United States',
        sectionClass: 'fb-filter-state-section--us',
        children: parts.us.map(function (v) {
          return { type: 'child', value: v, label: v };
        })
      });
    }
    if (parts.canada.length) {
      tree.push({
        type: 'parent',
        value: STATE_GROUP_CA,
        label: 'Canada Provinces',
        sectionClass: 'fb-filter-state-section--ca',
        children: parts.canada.map(function (v) {
          return { type: 'child', value: v, label: v };
        })
      });
    }
    return tree;
  }

  function buildFacetValues(deals, field) {
    let seen = {};
    deals.forEach(function (d) {
      let val = d[field];
      if (!val) return;
      let key = field === 'state' ? normState(val) : val;
      if (!seen[key]) seen[key] = field === 'state' ? normState(val) : val;
    });
    let values = Object.values(seen);
    if (field === 'state') return sortStateFacets(values);
    return values.sort(function (a, b) {
      return String(a).localeCompare(String(b));
    });
  }

  function buildGroupedTree(deals, field) {
    let values = buildFacetValues(deals, field);
    let parents = {};
    let standalone = [];

    values.forEach(function (v) {
      let m = v.match(/^([^–\-]+?)\s*[-–]\s*(.+)$/);
      if (m) {
        let parent = m[1].trim();
        if (!parents[parent]) parents[parent] = [];
        parents[parent].push(v);
      } else {
        standalone.push(v);
      }
    });

    let tree = [];
    if (field === 'leadSource') {
      let hasFb = false;
      let hasFbSpo = false;
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
    let grid = document.getElementById('fbFilterGrid');
    if (!grid) return;
    grid.innerHTML = FILTER_DEFS.map(function (def) {
      let active;
      if (def.type === 'groupBy') {
        active = GROUP_BY !== 'packageOwner';
      } else if (def.type === 'date') {
        active = FILTERS.dateRange !== 'ytd' || FILTERS.customFrom || FILTERS.customTo;
        if (def.key === 'dateRange' && FILTERS.dateRange === 'ytd') active = false;
      } else if (def.type === 'range') {
        active = isFundingFilterActive();
      } else {
        active = FILTERS[def.key] && FILTERS[def.key].length > 0;
      }
      let val = filterDisplayValue(def.key);
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
    let wrap = document.getElementById('fbActiveFilters');
    if (!wrap) return;
    let tags = [];

    FILTER_DEFS.forEach(function (def) {
      if (def.key === 'groupBy') {
        if (GROUP_BY !== 'packageOwner') {
          tags.push({ key: def.key, label: def.label + ': ' + filterDisplayValue(def.key) });
        }
        return;
      }
      if (def.key === 'dateRange') {
        if (FILTERS.dateRange !== 'ytd' || FILTERS.customFrom || FILTERS.customTo) {
          tags.push({ key: def.key, label: def.label + ': ' + filterDisplayValue(def.key) });
        }
        return;
      }
      if (def.type === 'range') {
        if (isFundingFilterActive()) {
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
    if (key === 'groupBy') {
      setGroupBy('packageOwner');
    } else if (key === 'dateRange') {
      FILTERS.dateRange = 'ytd';
      FILTERS.customFrom = '';
      FILTERS.customTo = '';
    } else if (key === 'fundingRange') {
      FILTERS.fundingMin = null;
      FILTERS.fundingMax = null;
    } else {
      FILTERS[key] = [];
    }
  }

  function sortLabel() {
    return SORT_LABELS[SORT_KEY] || SORT_KEY;
  }

  function renderHeroContext(rows) {
    let el = document.getElementById('fbHeroContext');
    if (!el) return;
    let repPart = rows.length
      ? rows.length + ' rep' + (rows.length === 1 ? '' : 's')
      : 'No reps';
    el.textContent = dateRangeMetaLabel() + ' · ' + repPart + ' · By ' + groupByLabel() + ' · Sorted by ' + sortLabel();
  }

  function kpiScopeLabel() {
    let parts = [dateRangeMetaLabel()];
    if (GROUP_BY !== 'packageOwner') {
      parts.push('By ' + groupByLabel());
    }
    let hasFacetFilters = FILTER_DEFS.some(function (def) {
      if (def.type === 'groupBy' || def.type === 'date' || def.type === 'range') return false;
      return FILTERS[def.key] && FILTERS[def.key].length > 0;
    });
    if (hasFacetFilters || isFundingFilterActive()) {
      parts.push('Filtered');
    }
    return parts.join(' · ');
  }

  function renderHeroKpis(filtered) {
    let vol = filtered.reduce(function (s, d) { return s + d.funding; }, 0);
    let reps = aggregateByRep(filtered);
    let elVol = document.getElementById('fbKpiVolume');
    let elDeals = document.getElementById('fbKpiDeals');
    let elAvg = document.getElementById('fbKpiAvg');
    let elReps = document.getElementById('fbKpiReps');
    let elScope = document.getElementById('fbKpiScope');
    if (elVol) elVol.textContent = fmtFull(vol);
    if (elDeals) elDeals.textContent = filtered.length.toLocaleString();
    if (elAvg) elAvg.textContent = filtered.length ? fmtFull(vol / filtered.length) : fmtFull(0);
    if (elReps) elReps.textContent = reps.length.toLocaleString();
    if (elScope) elScope.textContent = kpiScopeLabel();
  }

  let SPOT_STAT_LABELS = {
    volume: 'Total funded',
    revenue: 'Total revenue',
    points: 'Points',
    count: 'Deal count',
    avg: 'Avg. funding',
    avgRev: 'Avg. revenue'
  };

  function leaderForSortKey(rows) {
    if (!rows.length || SORT_KEY === 'name') return null;
    let key = SORT_KEY;
    let leader = rows[0];
    let best = leader[key] || 0;
    for (let i = 1; i < rows.length; i++) {
      let v = rows[i][key] || 0;
      if (v > best) {
        best = v;
        leader = rows[i];
      }
    }
    return leader;
  }

  function formatSpotlightValue(row) {
    let v = row[SORT_KEY] || 0;
    if (SORT_KEY === 'points') return fmtPts(v);
    if (SORT_KEY === 'count') return v.toLocaleString();
    return fmtFull(v);
  }

  function renderHeroSpotlight(rows) {
    let el = document.getElementById('fbHeroSpotlight');
    if (!el) return;
    let top = leaderForSortKey(rows);
    if (!top) {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }
    el.hidden = false;
    let pid = repPersonId(top.name);
    let rep = pid && window.REPS ? window.REPS[pid] : null;
    let ringAttrs = ' class="fb-spot-photo-ring" id="fbSpotPhotoRing"';
    if (pid) {
      ringAttrs += fbRepClickAttrs(pid, top.name) +
        ' title="View stats card" aria-label="View ' + esc(top.name) + ' stats card"';
    }
    let photoHtml = '<div' + ringAttrs + '>' +
      '<img id="fbSpotPhoto" alt="" hidden />' +
      '<div class="hero-photo-placeholder" aria-hidden="true">?</div></div>';

    let nameHtml = pid
      ? '<span class="fb-spot-name"' + fbRepClickAttrs(pid, top.name) + '>' + esc(top.name) + '</span>'
      : '<div class="fb-spot-name">' + esc(top.name) + '</div>';

    el.innerHTML =
      photoHtml +
      '<div class="fb-spot-info">' +
        '<div class="fb-spot-lead">Leading rep</div>' +
        nameHtml +
        '<div class="fb-spot-stat">' + formatSpotlightValue(top) + '</div>' +
        '<div class="fb-spot-stat-lbl">' + esc(SPOT_STAT_LABELS[SORT_KEY] || sortLabel()) + '</div>' +
        '<div class="fb-spot-meta">' + top.count + ' deal' + (top.count === 1 ? '' : 's') + '</div>' +
      '</div>';

    if (window.setHeroRepPhoto && rep) {
      window.setHeroRepPhoto(
        document.getElementById('fbSpotPhotoRing'),
        document.getElementById('fbSpotPhoto'),
        rep
      );
    }

    let photoRing = document.getElementById('fbSpotPhotoRing');
    if (photoRing && pid) {
      photoRing.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          photoRing.click();
        }
      });
    }
  }

  function applySortedColumnHighlight() {
    let table = document.getElementById('fbRepTable');
    if (!table) return;

    table.querySelectorAll('.fb-col-sorted').forEach(function (el) {
      el.classList.remove('fb-col-sorted');
    });

    let colIndex = SORT_COL_INDEX[SORT_KEY];
    if (!colIndex) return;

    let th = table.querySelector('thead th:nth-child(' + colIndex + ')');
    if (th) th.classList.add('fb-col-sorted');

    table.querySelectorAll('tbody td:nth-child(' + colIndex + ')').forEach(function (td) {
      td.classList.add('fb-col-sorted');
    });
  }

  function renderSortHeaders() {
    let thead = document.querySelector('#fbRepTable thead tr');
    if (!thead) return;
    thead.querySelectorAll('[data-sort]').forEach(function (th) {
      let key = th.getAttribute('data-sort');
      let arrow = th.querySelector('.fb-sort-arrow');
      if (!arrow) return;
      if (key === SORT_KEY) {
        arrow.textContent = SORT_DIR === 'asc' ? '▲' : '▼';
        th.classList.add('sorted');
      } else {
        arrow.textContent = '';
        th.classList.remove('sorted');
      }
    });
    applySortedColumnHighlight();
  }

  function renderTable(rows) {
    let tbody = document.getElementById('fbRepTableBody');
    let table = document.getElementById('fbRepTable');
    let meta = document.getElementById('fbTableMeta');
    if (meta) meta.textContent = dateRangeMetaLabel() + ' · ' + groupByLabel() + ' · ' + rows.length + ' rep' + (rows.length === 1 ? '' : 's');

    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '';
      if (table) table.hidden = true;
      renderHeroSpotlight([]);
      return;
    }
    if (table) table.hidden = false;

    tbody.innerHTML = rows.map(function (r, i) {
      let pid = repPersonId(r.name);
      let nameCell = pid
        ? '<span class="fb-rep-name"' + fbRepClickAttrs(pid, r.name) + '>' + esc(r.name) + '</span>'
        : '<span class="fb-rep-name">' + esc(r.name) + '</span>';
      let rowCls = i === 0 ? ' class="fb-row-top"' : '';
      return '<tr' + rowCls + '>' +
        '<td>' + (i + 1) + '</td>' +
        '<td class="fb-col-name"><div class="fb-rep-cell">' + repAvatarHtml(pid, r.name) + nameCell + '</div></td>' +
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

  function personMatchTargets(personId) {
    if (!personId || !window.REPS) return [];
    let rep = window.REPS[personId];
    if (!rep) return [];
    return [normStr(rep.bookName), normStr(rep.name)].filter(Boolean);
  }

  function nameMatchesTargets(name, targets) {
    if (window.CapMuseRepMatch && window.CapMuseRepMatch.namesMatch) {
      let t;
      for (t = 0; t < targets.length; t++) {
        if (window.CapMuseRepMatch.namesMatch(name, targets[t])) return true;
      }
      return false;
    }
    let rn = normStr(name);
    if (!rn || !targets.length) return false;
    let t;
    for (t = 0; t < targets.length; t++) {
      if (rn === targets[t]) return true;
    }
    return false;
  }

  function dealMatchesPerson(d, personId) {
    return nameMatchesTargets(repNameFromDeal(d), personMatchTargets(personId));
  }

  function dealsForPerson(personId) {
    return DEALS.filter(function (d) { return dealMatchesPerson(d, personId); });
  }

  function aggregateYearlyRows(deals) {
    let byYear = {};
    let currentYear = new Date().getFullYear();
    deals.forEach(function (d) {
      let year = d.date ? d.date.getFullYear() : currentYear;
      if (!byYear[year]) {
        byYear[year] = { year: year, volume: 0, revenue: 0, pointsSum: 0, count: 0 };
      }
      byYear[year].volume += d.funding;
      byYear[year].revenue += d.revenue;
      byYear[year].pointsSum += d.points;
      byYear[year].count += 1;
    });
    return Object.values(byYear).map(function (r) {
      r.avg = r.count ? r.volume / r.count : 0;
      r.avgRev = r.count ? r.revenue / r.count : 0;
      r.points = r.volume > 0 ? (r.revenue / r.volume) * 100 : 0;
      delete r.pointsSum;
      return r;
    }).sort(function (a, b) { return b.year - a.year; });
  }

  let RANK_ONE_METRICS = [
    { key: 'volume', label: 'Total Funding' },
    { key: 'revenue', label: 'Total Revenue' },
    { key: 'count', label: 'Funded Deals' },
    { key: 'points', label: 'Points' },
    { key: 'avg', label: 'Avg. Funding' },
    { key: 'avgRev', label: 'Avg. Revenue' }
  ];

  function leadersForMetric(rows, key) {
    if (!rows || !rows.length) return [];
    let max = -Infinity;
    let i;
    for (i = 0; i < rows.length; i++) {
      let v = rows[i][key] || 0;
      if (v > max) max = v;
    }
    if (!isFinite(max) || max <= 0) return [];
    let leaders = [];
    for (i = 0; i < rows.length; i++) {
      if ((rows[i][key] || 0) === max) leaders.push(rows[i]);
    }
    return leaders;
  }

  function repAmongLeaderRows(personId, leaderRows) {
    let targets = personMatchTargets(personId);
    if (!targets.length || !leaderRows.length) return null;
    let i;
    for (i = 0; i < leaderRows.length; i++) {
      if (nameMatchesTargets(leaderRows[i].name, targets)) return leaderRows[i];
    }
    return null;
  }

  function passesNonDateFilters(d) {
    if (!matchesMulti('leadSource', d.leadSource, FILTERS.leadSource)) return false;
    if (!matchesMulti('marketingAssist', d.marketingAssist, FILTERS.marketingAssist)) return false;
    if (!matchesMulti('state', d.state, FILTERS.state)) return false;
    if (!matchesMulti('lender', d.lender, FILTERS.lender)) return false;
    if (!matchesMulti('productType', d.productType, FILTERS.productType)) return false;
    if (!matchesMulti('dealType', d.dealType, FILTERS.dealType)) return false;
    if (!inFundingRange(d)) return false;
    return true;
  }

  function dealsThisMonth() {
    let now = new Date();
    let start = new Date(now.getFullYear(), now.getMonth(), 1);
    let end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return DEALS.filter(function (d) {
      if (!d.date || d.date < start || d.date > end) return false;
      return passesNonDateFilters(d);
    });
  }

  function formatRankValue(key, v) {
    if (key === 'points') return fmtPts(v);
    if (key === 'count' || key === 'monthCount') return String(v);
    return fmtFull(v);
  }

  function getRepNumberOnes(personId) {
    let ones = [];
    let i;
    let m;
    let leaders;
    let leader;
    for (i = 0; i < RANK_ONE_METRICS.length; i++) {
      m = RANK_ONE_METRICS[i];
      leaders = leadersForMetric(CACHED_ROWS, m.key);
      leader = repAmongLeaderRows(personId, leaders);
      if (leader) {
        ones.push({
          key: m.key,
          label: m.label,
          badge: '#1 ' + m.label,
          value: formatRankValue(m.key, leader[m.key]),
          scope: 'filter'
        });
      }
    }
    leaders = leadersForMetric(aggregateByRep(dealsThisMonth()), 'count');
    leader = repAmongLeaderRows(personId, leaders);
    if (leader) {
      ones.push({
        key: 'monthCount',
        label: 'Deals This Month',
        badge: '#1 Deals This Month',
        value: formatRankValue('monthCount', leader.count),
        scope: 'month'
      });
    }
    return {
      filterMeta: dateRangeMetaLabel() + ' · By ' + groupByLabel(),
      ones: ones
    };
  }

  function findRowForPerson(personId) {
    let targets = personMatchTargets(personId);
    if (!targets.length) return null;
    let i;
    let r;
    let t;
    for (i = 0; i < CACHED_ROWS.length; i++) {
      r = CACHED_ROWS[i];
      if (nameMatchesTargets(r.name, targets)) {
        return { row: r, rank: i + 1 };
      }
    }
    return null;
  }

  function render() {
    let filtered = applyFilters(DEALS);
    let rows = sortRows(aggregateByRep(filtered));
    CACHED_ROWS = rows;
    renderFilterChips();
    renderActiveTags();
    renderHeroContext(rows);
    renderHeroKpis(filtered);
    renderTable(rows);
    window.dispatchEvent(new CustomEvent('capmuse:funding-book-rendered'));
  }

  function draftHas(val) {
    return Array.isArray(popupDraft) && popupDraft.indexOf(val) > -1;
  }

  function findOptInput(container, val) {
    let found = null;
    container.querySelectorAll('input[data-opt]').forEach(function (inp) {
      if (inp.getAttribute('data-opt') === val) found = inp;
    });
    return found;
  }

  function toggleDraftVal(val, children) {
    let idx = popupDraft.indexOf(val);
    if (idx > -1) {
      popupDraft.splice(idx, 1);
      if (children) {
        children.forEach(function (c) {
          let ci = popupDraft.indexOf(c.value);
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

    let facetDeals = dealsForFacetOptions(def.key);
    let facetValues = buildFacetValues(facetDeals, def.field);
    if (def.extraOptions) {
      def.extraOptions.forEach(function (v) {
        if (facetValues.indexOf(v) === -1) facetValues.push(v);
      });
    }
    if (def.key === 'productType') {
      facetValues = sortProductTypeFacets(facetValues);
    } else if (def.key !== 'state') {
      facetValues.sort(function (a, b) { return String(a).localeCompare(String(b)); });
    }
    let tree;
    if (def.key === 'state') {
      tree = buildStateGroupedTree(facetValues);
    } else if (def.grouped) {
      tree = buildGroupedTree(facetDeals, def.field);
    } else {
      tree = facetValues.map(function (v) {
        return { type: 'leaf', value: v, label: v };
      });
    }

    let q = normStr(query);
    if (q) {
      tree = tree.filter(function (node) {
        if (node.type === 'parent') {
          node.children = node.children.filter(function (c) { return normStr(c.label).indexOf(q) > -1; });
          return normStr(node.label).indexOf(q) > -1 || node.children.length;
        }
        return normStr(node.label).indexOf(q) > -1;
      });
    }

    let allChecked = !Array.isArray(popupDraft) || !popupDraft.length;
    let html = '<label class="fb-filter-check fb-filter-check-all">' +
      '<input type="checkbox" data-opt-all="1"' + (allChecked ? ' checked' : '') + ' />' +
      '<span>Select all</span></label>';

    tree.slice(0, 250).forEach(function (node) {
      if (node.type === 'parent') {
        let pChecked = draftHas(node.value);
        let sectionCls = node.sectionClass ? ' ' + node.sectionClass : '';
        html += '<label class="fb-filter-check fb-filter-check-parent' + sectionCls + '">' +
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
        let val = inp.getAttribute('data-opt');
        let parentNode = tree.filter(function (n) { return n.value === val; })[0];
        if (parentNode && parentNode.type === 'parent') {
          toggleDraftVal(val, parentNode.children);
          parentNode.children.forEach(function (c) {
            let childInp = findOptInput(container, c.value);
            if (childInp) childInp.checked = draftHas(c.value);
          });
          inp.checked = draftHas(val);
        } else {
          if (inp.checked) {
            if (popupDraft.indexOf(val) === -1) popupDraft.push(val);
          } else {
            let idx = popupDraft.indexOf(val);
            if (idx > -1) popupDraft.splice(idx, 1);
          }
        }
        let allInp = container.querySelector('input[data-opt-all]');
        if (allInp) allInp.checked = !popupDraft.length;
      });
    });
  }

  function openFilterPopup(key) {
    let def = FILTER_DEFS.filter(function (d) { return d.key === key; })[0];
    if (!def) return;

    popupKey = key;
    if (key === 'groupBy') {
      popupDraft = GROUP_BY;
    } else if (key === 'dateRange') {
      popupDraft = FILTERS.dateRange;
    } else if (def.type === 'range') {
      let bounds = fundingDataBounds('fundingRange');
      popupDraft = {
        min: FILTERS.fundingMin != null ? FILTERS.fundingMin : bounds.min,
        max: FILTERS.fundingMax != null ? FILTERS.fundingMax : bounds.max
      };
    } else {
      popupDraft = (FILTERS[key] || []).slice();
    }

    let overlay = document.getElementById('fbFilterOverlay');
    let title = document.getElementById('fbFilterModalTitle');
    let searchWrap = document.getElementById('fbFilterSearchWrap');
    let searchInput = document.getElementById('fbFilterSearch');
    let options = document.getElementById('fbFilterOptions');

    if (title) title.textContent = def.label;
    if (searchWrap) searchWrap.hidden = def.type === 'date' || def.type === 'range' || def.type === 'groupBy' ? true : !def.searchable;
    if (searchInput) searchInput.value = '';

    if (def.type === 'groupBy') {
      renderGroupByOptions(options);
    } else if (def.type === 'date') {
      renderDateOptions(options);
    } else if (def.type === 'range') {
      renderFundingRangeOptions(options);
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

  function updateFundingRangeFill(minInp, maxInp, fill, bounds) {
    if (!minInp || !maxInp || !fill) return;
    let span = bounds.max - bounds.min || 1;
    let lo = (parseInt(minInp.value, 10) - bounds.min) / span * 100;
    let hi = (parseInt(maxInp.value, 10) - bounds.min) / span * 100;
    fill.style.left = lo + '%';
    fill.style.width = (hi - lo) + '%';
  }

  function renderFundingRangeOptions(container) {
    if (!container) return;
    let bounds = fundingDataBounds('fundingRange');
    let draftMin = popupDraft && popupDraft.min != null ? popupDraft.min : (
      FILTERS.fundingMin != null ? FILTERS.fundingMin : bounds.min
    );
    let draftMax = popupDraft && popupDraft.max != null ? popupDraft.max : (
      FILTERS.fundingMax != null ? FILTERS.fundingMax : bounds.max
    );
    draftMin = Math.max(bounds.min, Math.min(draftMin, bounds.max));
    draftMax = Math.max(bounds.min, Math.min(draftMax, bounds.max));
    if (draftMin > draftMax) draftMin = draftMax;
    popupDraft = { min: draftMin, max: draftMax };

    container.innerHTML =
      '<div class="fb-range-slider">' +
        '<div class="fb-range-values">' +
          '<span class="fb-range-val" id="fbFundingMinLbl">' + fmtFundingShort(draftMin) + '</span>' +
          '<span class="fb-range-val" id="fbFundingMaxLbl">' + fmtFundingShort(draftMax) + '</span>' +
        '</div>' +
        '<div class="fb-range-track-wrap">' +
          '<div class="fb-range-track"></div>' +
          '<div class="fb-range-fill" id="fbFundingFill"></div>' +
          '<input type="range" class="fb-range-input fb-range-input--min" id="fbFundingMinInp"' +
            ' min="' + bounds.min + '" max="' + bounds.max + '" step="' + FUNDING_RANGE_STEP + '" value="' + draftMin + '" />' +
          '<input type="range" class="fb-range-input fb-range-input--max" id="fbFundingMaxInp"' +
            ' min="' + bounds.min + '" max="' + bounds.max + '" step="' + FUNDING_RANGE_STEP + '" value="' + draftMax + '" />' +
        '</div>' +
        '<div class="fb-range-hint">Per-deal funded amount · ' + fmtFundingShort(bounds.min) + ' – ' + fmtFundingShort(bounds.max) + '</div>' +
      '</div>';

    let minInp = document.getElementById('fbFundingMinInp');
    let maxInp = document.getElementById('fbFundingMaxInp');
    let minLbl = document.getElementById('fbFundingMinLbl');
    let maxLbl = document.getElementById('fbFundingMaxLbl');
    let fill = document.getElementById('fbFundingFill');

    function syncFromMin() {
      let minVal = parseInt(minInp.value, 10);
      let maxVal = parseInt(maxInp.value, 10);
      if (minVal > maxVal) {
        minVal = maxVal;
        minInp.value = String(minVal);
      }
      popupDraft = { min: minVal, max: maxVal };
      if (minLbl) minLbl.textContent = fmtFundingShort(minVal);
      updateFundingRangeFill(minInp, maxInp, fill, bounds);
    }

    function syncFromMax() {
      let minVal = parseInt(minInp.value, 10);
      let maxVal = parseInt(maxInp.value, 10);
      if (maxVal < minVal) {
        maxVal = minVal;
        maxInp.value = String(maxVal);
      }
      popupDraft = { min: minVal, max: maxVal };
      if (maxLbl) maxLbl.textContent = fmtFundingShort(maxVal);
      updateFundingRangeFill(minInp, maxInp, fill, bounds);
    }

    if (minInp) minInp.addEventListener('input', syncFromMin);
    if (maxInp) maxInp.addEventListener('input', syncFromMax);
    updateFundingRangeFill(minInp, maxInp, fill, bounds);
  }

  function renderGroupByOptions(container) {
    if (!container) return;
    let current = normalizeGroupBy(typeof popupDraft === 'string' ? popupDraft : GROUP_BY);
    let html = '<div class="fb-date-presets">';
    GROUP_BY_OPTIONS.forEach(function (o) {
      let sel = current === o.id ? ' selected' : '';
      html += '<button type="button" class="fb-filter-option' + sel + '" data-group-by="' + o.id + '">' + esc(o.label) + '</button>';
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-group-by]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        let next = normalizeGroupBy(btn.getAttribute('data-group-by'));
        popupDraft = next;
        setGroupBy(next);
        container.querySelectorAll('[data-group-by]').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        closeFilterPopup();
        render();
      });
    });
  }

  function renderDateOptions(container) {
    if (!container) return;
    let html = '<div class="fb-date-presets">';
    DATE_PRESETS.forEach(function (p) {
      let sel = (popupDraft || FILTERS.dateRange) === p.id ? ' selected' : '';
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
        let preset = normalizeDateRangeId(btn.getAttribute('data-date-preset'));
        popupDraft = preset;
        FILTERS.dateRange = preset;
        if (preset !== 'custom') {
          FILTERS.customFrom = '';
          FILTERS.customTo = '';
        }
        container.querySelectorAll('[data-date-preset]').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        closeFilterPopup();
        render();
      });
    });
  }

  function closeFilterPopup() {
    let overlay = document.getElementById('fbFilterOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(function () { overlay.hidden = true; }, 200);
    }
    popupKey = null;
    popupDraft = null;
  }

  function applyFilterPopup() {
    if (!popupKey) return;
    if (popupKey === 'groupBy') {
      setGroupBy(resolveGroupByDraft());
    } else if (popupKey === 'dateRange') {
      FILTERS.dateRange = normalizeDateRangeId(popupDraft);
      let fromEl = document.getElementById('fbCustomFrom');
      let toEl = document.getElementById('fbCustomTo');
      if (fromEl) FILTERS.customFrom = fromEl.value;
      if (toEl) FILTERS.customTo = toEl.value;
      if (FILTERS.dateRange === 'custom' && !FILTERS.customFrom && !FILTERS.customTo) {
        FILTERS.dateRange = 'ytd';
      }
    } else if (popupKey === 'fundingRange') {
      let bounds = fundingDataBounds('fundingRange');
      let minVal = popupDraft && popupDraft.min != null ? popupDraft.min : bounds.min;
      let maxVal = popupDraft && popupDraft.max != null ? popupDraft.max : bounds.max;
      if (minVal <= bounds.min && maxVal >= bounds.max) {
        FILTERS.fundingMin = null;
        FILTERS.fundingMax = null;
      } else {
        FILTERS.fundingMin = minVal > bounds.min ? minVal : null;
        FILTERS.fundingMax = maxVal < bounds.max ? maxVal : null;
      }
    } else if (Array.isArray(popupDraft)) {
      FILTERS[popupKey] = popupDraft.slice();
    }
    closeFilterPopup();
    render();
  }

  function clearFilterPopup() {
    if (!popupKey) return;
    if (popupKey === 'groupBy') {
      popupDraft = 'packageOwner';
      setGroupBy('packageOwner');
      renderGroupByOptions(document.getElementById('fbFilterOptions'));
    } else if (popupKey === 'dateRange') {
      popupDraft = 'ytd';
      FILTERS.dateRange = 'ytd';
      FILTERS.customFrom = '';
      FILTERS.customTo = '';
      renderDateOptions(document.getElementById('fbFilterOptions'));
    } else if (popupKey === 'fundingRange') {
      FILTERS.fundingMin = null;
      FILTERS.fundingMax = null;
      let bounds = fundingDataBounds('fundingRange');
      popupDraft = { min: bounds.min, max: bounds.max };
      renderFundingRangeOptions(document.getElementById('fbFilterOptions'));
    } else {
      popupDraft = [];
      FILTERS[popupKey] = [];
      let def = FILTER_DEFS.filter(function (d) { return d.key === popupKey; })[0];
      if (def) renderCheckboxOptions(document.getElementById('fbFilterOptions'), def, '');
    }
    closeFilterPopup();
    render();
  }

  function wireModal() {
    let overlay = document.getElementById('fbFilterOverlay');
    let closeBtn = document.getElementById('fbFilterClose');
    let applyBtn = document.getElementById('fbFilterApply');
    let clearBtn = document.getElementById('fbFilterClear');

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
        let key = th.getAttribute('data-sort');
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

  function applyMappedDeals() {
    if (RAW_DEALS.length) {
      DEALS = RAW_DEALS.filter(function (r) { return r.company || r.Deal_Name; }).map(mapRecord);
      DATA_STATUS = 'ready';
    } else {
      DEALS = [];
    }
    render();
  }

  function load(raw) {
    if (!raw || !raw.length) return;
    RAW_DEALS = raw;
    applyMappedDeals();
  }

  function init() {
    FILTERS.dateRange = normalizeDateRangeId(FILTERS.dateRange);
    wireModal();
    wireSortHeaders();
    renderFilterChips();
    render();
    let csvReady = loadCsvLookup();
    let dealsReady = window.CapMuseData
      ? window.CapMuseData.getRawDeals().then(function (raw) {
          if (raw && raw.length) RAW_DEALS = raw;
        })
      : Promise.resolve();
    Promise.all([csvReady, dealsReady]).then(function () {
      if (!RAW_DEALS.length) DATA_STATUS = 'error';
      applyMappedDeals();
    });
    window.addEventListener('capmuse:deals-updated', function (e) {
      if (e.detail && e.detail.length) load(e.detail);
    });
  }

  window.CapMuseFundingBook = {
    getRepRowForPerson: function (personId) {
      let found = findRowForPerson(personId);
      if (!found) return null;
      let r = found.row;
      return {
        rank: found.rank,
        name: r.name,
        volume: fmtFull(r.volume),
        revenue: fmtFull(r.revenue),
        points: fmtPts(r.points),
        team: repTeam(r.name),
        count: String(r.count),
        avgFunding: fmtFull(r.avg),
        avgRev: fmtFull(r.avgRev),
        filterMeta: dateRangeMetaLabel() + ' · By ' + groupByLabel()
      };
    },
    getRepYearlyStatsForPerson: function (personId) {
      let rep = window.REPS && window.REPS[personId];
      if (!rep) return null;
      let repDeals = dealsForPerson(personId);
      if (!repDeals.length) return null;
      let repName = rep.bookName || rep.name || personId;
      let years = aggregateYearlyRows(repDeals);
      return {
        name: repName,
        team: repTeam(repName),
        groupBy: groupByLabel(),
        years: years.map(function (y) {
          return {
            year: y.year,
            volume: fmtFull(y.volume),
            revenue: fmtFull(y.revenue),
            points: fmtPts(y.points),
            team: repTeam(repName),
            count: String(y.count),
            avgFunding: fmtFull(y.avg),
            avgRev: fmtFull(y.avgRev)
          };
        })
      };
    },
    getRepNumberOnes: getRepNumberOnes
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
