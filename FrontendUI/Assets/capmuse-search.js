/* ═══════════════════════════════════════════════════════════════
   capmuse-search.js — StatMuse-style natural language search
   Drop this script on any FrontendUI page that has .search-input
════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BUCKET = 'https://capmuse-data-882611632216.s3.amazonaws.com';
  var _deals        = [];
  var _loaded       = false;
  var _loading      = false;
  var _queue        = [];
  var _currentQuery = '';

  var NOW = new Date();
  var FILTER_CHIPS = [
    { label: 'All Time', filter: { label: 'All Time',        allTime: true } },
    { label: 'YTD',      filter: { type: 'year', year: NOW.getFullYear(), label: 'YTD ' + NOW.getFullYear() } },
    { label: String(NOW.getFullYear() - 1), filter: { type: 'year', year: NOW.getFullYear() - 1, label: String(NOW.getFullYear() - 1) } },
    { label: String(NOW.getFullYear() - 2), filter: { type: 'year', year: NOW.getFullYear() - 2, label: String(NOW.getFullYear() - 2) } },
    { label: 'Last 90d', filter: { label: 'Last 90 Days',    days: 90  } },
    { label: 'Last 30d', filter: { label: 'Last 30 Days',    days: 30  } },
  ];

  // ── CSV utilities ──────────────────────────────────────────────────────────
  function parseCSV(text) {
    var lines = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === '\n' && !inQ) { lines.push(cur); cur = ''; }
      else if (c !== '\r') { cur += c; }
    }
    if (cur.trim()) lines.push(cur);
    if (lines.length < 2) return [];
    var headers = splitRow(lines[0]);
    var out = [];
    for (var j = 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      var vals = splitRow(lines[j]);
      var obj = {};
      headers.forEach(function (h, k) { obj[h] = (vals[k] || '').trim(); });
      out.push(obj);
    }
    return out;
  }

  function splitRow(line) {
    var r = [], c = '', q = false;
    for (var i = 0; i < line.length; i++) {
      if (line[i] === '"') { q = !q; }
      else if (line[i] === ',' && !q) { r.push(c.trim()); c = ''; }
      else { c += line[i]; }
    }
    r.push(c.trim());
    return r;
  }

  function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }

  // ── Data mapper — handles both live JSON and legacy CSV field names ──────────
  function mapRecord(r) {
    var stage     = r.Stage || r.Stage_of_Package || r.stage || '';
    var s         = stage.toLowerCase();
    var fundedAmt = nn(r.Funded_Amount || r.funding || r.Amount || 0);
    // Match analytics page logic: funding amount present = funded, unless explicitly declined/lost
    var status;
    if (s.indexOf('decline') > -1 || s.indexOf('lost') > -1) {
      status = 'declined';
    } else if (fundedAmt > 0) {
      status = 'funded';
    } else if (s.indexOf('approv') > -1) {
      status = 'approved';
    } else {
      status = 'submitted';
    }
    var applied  = r.Created_Time || r.created_time || r.Date_Applied || r.created_at || '';
    var fundedAt = r.Date_Funded  || r.date_funded  || '';
    return {
      client_name:             r.Deal_Name || r.company || r.Account_Name || r.DBA || '',
      rep_name:                r['Owner.name'] || r['Package_Owner.name'] || r.package_owner || r.puller || r.Bizz_Owner_Name || r.First_Name || '',
      lender_name:             r.Lender || r.lender || r.Funder_2 || '',
      lead_source:             r.Lead_Source2 || r.Lead_Source || r.lead_source || r.Original_Lead_Source || '',
      industry:                r.Industry || r.industry || r.I_Stated_Industry || '',
      state:                   r.State || r.state || r.Business_State || '',
      approval_status:         status,
      funded_amount:           status === 'funded' ? fundedAmt : 0,
      application_submitted_at: applied,
      funded_at:               fundedAt,
      days_total_to_fund:      calcDays(applied, fundedAt),
      position:                r.position  || r.Position  || '',
      deal_type:               r.deal_type || r.Deal_Type || '',
      revenue:                 nn(r.revenue || r.Total_rev || 0),
      buy_rate:                nn(r.buy_rate || r.Buy_Rate || 0),
    };
  }

  function calcDays(start, end) {
    if (!start || !end) return null;
    try {
      var diff = Math.round((new Date(end) - new Date(start)) / 86400000);
      return diff > 0 && diff < 365 ? diff : null;
    } catch (e) { return null; }
  }

  // ── Data loading — prefers window.CapMuseData (live JSON), falls back to CSV ─
  function loadData(cb) {
    if (_loaded) { cb(_deals); return; }
    _queue.push(cb);
    if (_loading) return;
    _loading = true;

    function finish(raw) {
      _deals  = (raw || []).map(mapRecord).filter(function (d) { return d.client_name; });
      _loaded = true;
      console.log('[CapMuse Search] Loaded ' + _deals.length + ' records');
      _queue.forEach(function (fn) { fn(_deals); });
      _queue  = [];
    }

    // Use the shared live-data loader if available (funding_book_live.json)
    if (window.CapMuseData) {
      window.CapMuseData.getRawDeals().then(finish).catch(function () { finish([]); });
      return;
    }

    // Fallback: fetch funding_book_live.json directly
    fetch(BUCKET + '/funding_book_live.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data && data.length) { finish(data); } else { finish([]); } })
      .catch(function () { finish([]); });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function fmt(n) {
    if (!n) return '0';
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000)    return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n).toLocaleString();
  }

  function fmtNum(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000)    return Math.round(n / 1000) + 'K';
    return Math.round(n).toLocaleString();
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function monthKey(date) {
    var dt = new Date(date);
    if (isNaN(dt.getTime())) return null;
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
  }

  function labelFromKey(key) {
    var parts  = key.split('-');
    var labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return labels[parseInt(parts[1]) - 1] + ' ' + parts[0];
  }

  // ── Time detection (comprehensive) ────────────────────────────────────────
  var MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  var MONTH_MAP   = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};

  // Parses "june 5" / "june 5th" / "june 5 2024" into a Date, or null
  function parseNamedDate(str) {
    var s = str.replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Returns a specific period object or null if nothing specific was found.
  // Types: 'date' | 'range' | 'month' | 'quarter' | 'year'
  function detectPeriod(q) {
    var now = new Date();

    // ── Date range: "june 1 to june 30", "jan 5 - jan 10 2024", "between X and Y" ──
    var rangeRe = /([a-z]+ \d{1,2}(?:st|nd|rd|th)?(?:\s+\d{4})?)\s*(?:to|through|–|-)\s*([a-z]+ \d{1,2}(?:st|nd|rd|th)?(?:\s+\d{4})?)/i;
    var rm = q.match(rangeRe);
    if (rm) {
      var d1 = parseNamedDate(rm[1]), d2 = parseNamedDate(rm[2]);
      if (d1 && d2) {
        d2.setHours(23,59,59,999);
        return { type:'range', start:d1, end:d2, label:rm[1].trim()+' – '+rm[2].trim() };
      }
    }

    // ── Numeric date: "6/5/2024", "06/05/24", "6/5" ──
    var numM = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (numM) {
      var mo = parseInt(numM[1]), dy = parseInt(numM[2]);
      var yr = numM[3] ? (numM[3].length === 2 ? 2000+parseInt(numM[3]) : parseInt(numM[3])) : now.getFullYear();
      if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
        var nd = new Date(yr, mo-1, dy);
        return { type:'date', start:nd, end:new Date(yr,mo-1,dy,23,59,59,999), label:nd.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) };
      }
    }

    // ── Specific named date: "june 5", "june 5th", "june 5 2024" ──
    for (var i = 0; i < MONTH_NAMES.length; i++) {
      var mn = MONTH_NAMES[i];
      var sdRe = new RegExp('\\b'+mn+'\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b','i');
      var sdM  = q.match(sdRe);
      if (sdM) {
        var day = parseInt(sdM[1]), year = sdM[2] ? parseInt(sdM[2]) : now.getFullYear();
        if (day >= 1 && day <= 31) {
          var sd = new Date(year, i, day);
          var ed = new Date(year, i, day, 23, 59, 59, 999);
          return { type:'date', start:sd, end:ed, label:cap(mn)+' '+day+(sdM[2]?' '+year:'') };
        }
      }
    }

    // ── Full month name + optional year: "in march", "march 2024" ──
    for (var i = 0; i < MONTH_NAMES.length; i++) {
      if (q.indexOf(MONTH_NAMES[i]) > -1) {
        var ym = q.match(/\b(20\d\d)\b/);
        var yr = ym ? parseInt(ym[1]) : null;
        return { type:'month', month:i+1, year:yr, label:cap(MONTH_NAMES[i])+(yr?' '+yr:'') };
      }
    }

    // ── Short month abbreviations ──
    for (var abbr in MONTH_MAP) {
      if (new RegExp('\\b'+abbr+'\\b').test(q)) {
        var ym = q.match(/\b(20\d\d)\b/);
        var yr = ym ? parseInt(ym[1]) : null;
        return { type:'month', month:MONTH_MAP[abbr], year:yr, label:cap(abbr)+(yr?' '+yr:'') };
      }
    }

    // ── Quarter: "q1", "q2 2024" ──
    var qm = q.match(/\bq([1-4])\b/i);
    if (qm) {
      var qn = parseInt(qm[1]);
      var qy = (q.match(/\b(20\d\d)\b/)||[])[1];
      var yr = qy ? parseInt(qy) : now.getFullYear();
      return { type:'quarter', quarter:qn, year:yr, startMonth:(qn-1)*3+1, endMonth:qn*3, label:'Q'+qn+' '+yr };
    }

    // ── Year only: "in 2024", "2023", "last year 2024" ──
    var yearM = q.match(/\b(20\d\d)\b/);
    if (yearM) {
      return { type:'year', year:parseInt(yearM[1]), label:yearM[1] };
    }

    // ── "last month" ──
    if (/last month/i.test(q)) {
      var lm = new Date(now.getFullYear(), now.getMonth()-1, 1);
      return { type:'month', month:lm.getMonth()+1, year:lm.getFullYear(), label:'Last Month' };
    }

    // ── "this year" / "ytd" — calendar year, not rolling 365 days ──
    if (/this year|ytd/i.test(q)) {
      return { type:'year', year:now.getFullYear(), label:'YTD ' + now.getFullYear() };
    }

    // ── "this month" — current calendar month ──
    if (/this month/i.test(q)) {
      var labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return { type:'month', month:now.getMonth()+1, year:now.getFullYear(), label:'This Month (' + labels[now.getMonth()] + ')' };
    }

    // ── "this quarter" — current calendar quarter ──
    if (/this quarter/i.test(q)) {
      var qn = Math.ceil((now.getMonth()+1)/3);
      return { type:'quarter', quarter:qn, year:now.getFullYear(), startMonth:(qn-1)*3+1, endMonth:qn*3, label:'Q'+qn+' '+now.getFullYear() };
    }

    // ── "last year" — previous calendar year ──
    if (/last year/i.test(q)) {
      return { type:'year', year:now.getFullYear()-1, label:(now.getFullYear()-1).toString() };
    }

    return null;
  }

  // Rolling-window detector — only for keywords that don't imply a fixed calendar period
  function detectTimeWindow(q) {
    if (/\btoday\b/i.test(q))             return { label:'Today',        days:1   };
    if (/\byesterday\b/i.test(q))         return { label:'Yesterday',    days:2   };
    if (/this week/i.test(q))             return { label:'This Week',    days:7   };
    if (/last week/i.test(q))             return { label:'Last Week',    days:7   };
    if (/this month/i.test(q))            return { label:'This Month',   days:30  };
    if (/this quarter|last 90|90 days/i.test(q)) return { label:'This Quarter', days:90 };
    if (/this year|ytd/i.test(q))         return { label:'YTD',          days:365 };
    if (/all.?time|ever|history/i.test(q))return { label:'All Time',     days:null};
    var nd = q.match(/last (\d+) days?/i);   if (nd) return { label:'Last '+nd[1]+' Days',   days:parseInt(nd[1])     };
    var nw = q.match(/last (\d+) weeks?/i);  if (nw) return { label:'Last '+nw[1]+' Weeks',  days:parseInt(nw[1])*7   };
    var nm = q.match(/last (\d+) months?/i); if (nm) return { label:'Last '+nm[1]+' Months', days:parseInt(nm[1])*30  };
    var da = q.match(/(\d+) days? ago/i);    if (da) return { label:da[1]+' Days Ago',        days:parseInt(da[1])+1   };
    var wa = q.match(/(\d+) weeks? ago/i);   if (wa) return { label:wa[1]+' Weeks Ago',       days:parseInt(wa[1])*7+7 };
    var ma = q.match(/(\d+) months? ago/i);  if (ma) return { label:ma[1]+' Months Ago',      days:parseInt(ma[1])*30+30};
    return { label:'All Time', days:null };
  }

  function applyTimeFilter(deals, tf) {
    if (!tf.days) return deals;
    var cutoff = Date.now() - tf.days * 86400000;
    return deals.filter(function (d) {
      return new Date(d.application_submitted_at || d.funded_at || '').getTime() >= cutoff;
    });
  }

  // Handles all period types: month, quarter, year, date, range
  function applyPeriodFilter(deals, pf) {
    return deals.filter(function (d) {
      var dt = new Date(d.funded_at || d.application_submitted_at || '');
      if (isNaN(dt.getTime())) return false;
      var m = dt.getMonth()+1, y = dt.getFullYear();
      if (pf.type === 'month')   return m === pf.month   && (!pf.year || y === pf.year);
      if (pf.type === 'quarter') return m >= pf.startMonth && m <= pf.endMonth && (!pf.year || y === pf.year);
      if (pf.type === 'year')    return y === pf.year;
      if (pf.type === 'date')    return dt >= pf.start && dt <= pf.end;
      if (pf.type === 'range')   return dt >= pf.start && dt <= pf.end;
      return false;
    });
  }

  // ── Entity detection ───────────────────────────────────────────────────────
  function detectRep(q, deals) {
    var names = [];
    deals.forEach(function (d) { if (d.rep_name && names.indexOf(d.rep_name) === -1) names.push(d.rep_name); });
    for (var i = 0; i < names.length; i++) {
      var first = names[i].split(' ')[0].toLowerCase();
      if (first.length > 2 && q.indexOf(first) > -1) return first;
    }
    return null;
  }

  function detectLender(q, deals) {
    var lenders = [];
    deals.forEach(function (d) { if (d.lender_name && lenders.indexOf(d.lender_name) === -1) lenders.push(d.lender_name); });
    for (var i = 0; i < lenders.length; i++) {
      if (lenders[i].length > 3 && q.indexOf(lenders[i].toLowerCase()) > -1) return lenders[i].toLowerCase();
    }
    return null;
  }

  function resolveRepName(repMatch, deals) {
    var names = [];
    deals.forEach(function (d) { if (d.rep_name && names.indexOf(d.rep_name) === -1) names.push(d.rep_name); });
    for (var i = 0; i < names.length; i++) {
      if (names[i].split(' ')[0].toLowerCase() === repMatch || names[i].toLowerCase().indexOf(repMatch) > -1) return names[i];
    }
    return cap(repMatch);
  }

  function groupByMonth(deals, dateField) {
    var map = {};
    deals.forEach(function (d) {
      var key = monthKey(d[dateField] || d.application_submitted_at || '');
      if (!key) return;
      if (!map[key]) map[key] = { month:key, submitted:0, funded:0, volume:0 };
      map[key].submitted++;
      if (d.approval_status === 'funded') { map[key].funded++; map[key].volume += d.funded_amount || 0; }
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  // ── Intent classifier — extracts metric, direction, subject from any phrasing ──
  function classifyIntent(q) {
    var metric =
      /which month|what month|best month|peak month|top month|biggest month|worst month/.test(q) ? 'best_month' :
      /approv|conversion rate|win rate|success rate/.test(q)               ? 'approval'    :
      /fast|speed|quick|how long|days?.*(to fund|to close)|time.*(fund|close)/.test(q) ? 'speed' :
      /commission|earn|pay|compens|bonus/.test(q)                          ? 'commission'  :
      /revenue|how much.*make|factor fee|rev by rep|rev\/deal/.test(q)     ? 'revenue'     :
      /trend|over time|month.by.month|monthly|histor|progress/.test(q)     ? 'trend'       :
      /source|where.*come from|lead.*source|referr/.test(q)                ? 'lead_source' :
      /largest|biggest deal|highest deal|max deal|single deal/.test(q)     ? 'largest'     :
      /pipeline|funnel|stage|in progress|outstanding/.test(q)              ? 'pipeline'    :
      /\blender\b|\bfunder\b|financing|which bank/.test(q)                 ? 'lender'      :
      /\bstate\b|region|geography|by state|which state|top state/.test(q)  ? 'state'       :
      /\bposition\b|1st pos|2nd pos|3rd pos|stacking/.test(q)              ? 'position'    :
      /deal type|type of deal|renewal|new deal|what kind|deal mix/.test(q) ? 'deal_type'   :
      /deal.*count|number of deal|how many deal/.test(q)                   ? 'deal_count'  :
      'volume';

    var direction = /least|worst|bottom|fewest|lowest|min\b|last.?place|slow|weak/.test(q) ? 'bottom' : 'top';

    return { metric: metric, direction: direction };
  }

  // ── Query router ───────────────────────────────────────────────────────────
  function processQuery(query, deals, filterOverride) {
    var q = query.toLowerCase().trim();
    var repMatch    = detectRep(q, deals);
    var lenderMatch = detectLender(q, deals);
    var intent      = classifyIntent(q);

    var periodFilter, timeFilter;
    if (filterOverride) {
      if (filterOverride.allTime)  { periodFilter = null; timeFilter = { label: 'All Time', days: null }; }
      else if (filterOverride.type){ periodFilter = filterOverride; timeFilter = { label: filterOverride.label, days: null }; }
      else                         { periodFilter = null; timeFilter = filterOverride; }
    } else {
      periodFilter = detectPeriod(q);
      timeFilter   = detectTimeWindow(q);
    }

    var filtered = deals;
    if (periodFilter)         filtered = applyPeriodFilter(filtered, periodFilter);
    else if (timeFilter.days) filtered = applyTimeFilter(filtered, timeFilter);

    if (lenderMatch) filtered = filtered.filter(function (d) { return (d.lender_name || '').toLowerCase().indexOf(lenderMatch) > -1; });

    var timeLabel = periodFilter ? periodFilter.label : timeFilter.label;

    // ── Rep intents ──────────────────────────────────────────────────────────
    if (repMatch) {
      var repName     = resolveRepName(repMatch, deals);
      var allRepDeals = deals.filter(function (d) { return (d.rep_name || '').toLowerCase().indexOf(repMatch) > -1; });
      var repDeals    = filtered.filter(function (d) { return (d.rep_name || '').toLowerCase().indexOf(repMatch) > -1; });

      if (/best month|peak month|top month|biggest month/.test(q)) return repBestMonth(allRepDeals, repName);
      if (/worst month|lowest month|slowest month/.test(q))        return repWorstMonth(allRepDeals, repName);
      if (periodFilter)                                              return repInMonth(allRepDeals, repName, periodFilter);
      if (/vs\b|versus|compare/.test(q))                           return compareReps(q, filtered, timeLabel, deals);
      // Route by classified intent
      if (intent.metric === 'best_month') return repBestMonth(allRepDeals, repName);
      if (intent.metric === 'lender')     return repLenders(repDeals, repName, timeLabel);
      if (intent.metric === 'approval')   return repApprovalRate(repDeals, repName, timeLabel);
      if (intent.metric === 'speed')      return repSpeed(repDeals, repName, timeLabel);
      if (intent.metric === 'commission') return repCommission(repDeals, repName, timeLabel);
      if (intent.metric === 'revenue')    return revenueByRep(repDeals, timeLabel);
      if (intent.metric === 'trend')      return repMonthlyTrend(allRepDeals, repName, timeLabel);
      if (intent.metric === 'lead_source')return repLeadSource(repDeals, repName, timeLabel);
      if (intent.metric === 'largest')    return repLargestDeal(repDeals, repName, timeLabel);
      if (intent.metric === 'state')      return topStates(repDeals, repName + ' — ' + timeLabel);
      if (intent.metric === 'position')   return topPositions(repDeals, repName + ' — ' + timeLabel);
      if (intent.metric === 'deal_type')  return dealTypes(repDeals, repName + ' — ' + timeLabel);
      return repOverview(repDeals, repName, timeLabel);
    }

    // ── Specific lender intents ───────────────────────────────────────────────
    if (lenderMatch) return lenderOverview(filtered, lenderMatch, timeLabel);

    // ── Compare intent ────────────────────────────────────────────────────────
    if (/vs\b|versus|compare/.test(q)) return compareReps(q, filtered, timeLabel, deals);

    // ── Route all other queries by classified intent ──────────────────────────
    if (intent.metric === 'best_month')  return teamBestMonth(filtered, timeLabel);
    if (intent.metric === 'lender')      return intent.direction === 'bottom' ? bottomLenders(filtered, timeLabel) : topLenders(filtered, timeLabel);
    if (intent.metric === 'approval')    return approvalRates(filtered, timeLabel);
    if (intent.metric === 'speed')       return fundingSpeed(filtered, timeLabel);
    if (intent.metric === 'commission')  return commissions(filtered, timeLabel);
    if (intent.metric === 'revenue')     return revenueByRep(filtered, timeLabel);
    if (intent.metric === 'trend')       return trend(filtered, timeLabel);
    if (intent.metric === 'lead_source') return leadSources(filtered, timeLabel);
    if (intent.metric === 'largest')     return largestDeals(filtered, timeLabel);
    if (intent.metric === 'pipeline')    return pipeline(filtered, timeLabel);
    if (intent.metric === 'state')       return topStates(filtered, timeLabel);
    if (intent.metric === 'position')    return topPositions(filtered, timeLabel);
    if (intent.metric === 'deal_type')   return dealTypes(filtered, timeLabel);

    // Default: rep leaderboard, direction-aware
    return intent.direction === 'bottom' ? bottomFunders(filtered, timeLabel) : topFunders(filtered, timeLabel);
  }

  // ── Result builders ────────────────────────────────────────────────────────

  function repBestMonth(allRepDeals, repName) {
    var funded = allRepDeals.filter(function (d) { return d.approval_status === 'funded' && d.funded_amount > 0; });
    var byMonth = {};
    funded.forEach(function (d) {
      var key = monthKey(d.funded_at || d.application_submitted_at || '');
      if (!key) return;
      if (!byMonth[key]) byMonth[key] = { month:key, volume:0, count:0 };
      byMonth[key].volume += d.funded_amount;
      byMonth[key].count++;
    });
    var months = Object.keys(byMonth).map(function (k) { return byMonth[k]; }).sort(function (a,b) { return b.volume - a.volume; });
    if (!months.length) return { title: repName + ' — Best Month', answer: 'No funded deals found.', insight: null, chart: null, table: null };
    var best   = months[0];
    var runner = months[1];
    var sorted = Object.keys(byMonth).sort().map(function (k) { return byMonth[k]; });
    return {
      title:   repName + "'s Best Month",
      answer:  repName + "'s best month was " + labelFromKey(best.month) + ' with ' + fmt(best.volume) + ' funded across ' + best.count + ' deal' + (best.count !== 1 ? 's' : '') + '.',
      insight: runner ? 'Runner-up: ' + labelFromKey(runner.month) + ' at ' + fmt(runner.volume) + ' — ' + Math.round((best.volume - runner.volume) / runner.volume * 100) + '% behind the peak.' : null,
      chart:   { data: sorted.map(function (m) { return { name: m.month.substring(5), value: m.volume }; }), label: 'Monthly Funded Volume' },
      table:   { cols: ['Month','Volume','Deals','Avg Deal'], rows: months.slice(0,12).map(function (m) { return [labelFromKey(m.month), fmt(m.volume), m.count, fmt(Math.round(m.volume/m.count))]; }) },
    };
  }

  function repWorstMonth(allRepDeals, repName) {
    var funded = allRepDeals.filter(function (d) { return d.approval_status === 'funded' && d.funded_amount > 0; });
    var byMonth = {};
    funded.forEach(function (d) {
      var key = monthKey(d.funded_at || d.application_submitted_at || '');
      if (!key) return;
      if (!byMonth[key]) byMonth[key] = { month:key, volume:0, count:0 };
      byMonth[key].volume += d.funded_amount;
      byMonth[key].count++;
    });
    var months = Object.keys(byMonth).map(function (k) { return byMonth[k]; }).sort(function (a,b) { return a.volume - b.volume; });
    if (!months.length) return { title: repName + ' — Worst Month', answer: 'No funded deals found.', insight: null, chart: null, table: null };
    var worst = months[0];
    var best  = months[months.length - 1];
    var sorted = Object.keys(byMonth).sort().map(function (k) { return byMonth[k]; });
    return {
      title:   repName + "'s Worst Month",
      answer:  repName + "'s lowest month was " + labelFromKey(worst.month) + ' with ' + fmt(worst.volume) + ' across ' + worst.count + ' deal' + (worst.count !== 1 ? 's' : '') + '.',
      insight: 'Best month: ' + labelFromKey(best.month) + ' at ' + fmt(best.volume) + '.',
      chart:   { data: sorted.map(function (m) { return { name: m.month.substring(5), value: m.volume }; }), label: 'Monthly Volume' },
      table:   { cols: ['Month','Volume','Deals'], rows: months.slice(0,12).map(function (m) { return [labelFromKey(m.month), fmt(m.volume), m.count]; }) },
    };
  }

  function repInMonth(allRepDeals, repName, mf) {
    var funded = applyPeriodFilter(
      allRepDeals.filter(function(d){ return d.approval_status === 'funded' && d.funded_amount; }),
      mf
    );
    var volume  = funded.reduce(function (s,d) { return s + d.funded_amount; }, 0);
    var avgDeal = funded.length ? Math.round(volume / funded.length) : 0;
    var allFunded = allRepDeals.filter(function (d) { return d.approval_status === 'funded' && d.funded_amount > 0; });
    var byM = {};
    allFunded.forEach(function (d) { var k = monthKey(d.funded_at||d.application_submitted_at||''); if (k) byM[k] = (byM[k]||0) + d.funded_amount; });
    var vals = Object.keys(byM).map(function (k) { return byM[k]; });
    var avgMon = vals.length ? Math.round(vals.reduce(function (s,v) { return s+v; }, 0) / vals.length) : 0;
    var pct    = avgMon ? Math.round((volume - avgMon) / avgMon * 100) : 0;
    return {
      title:   repName + ' — ' + mf.label,
      answer:  funded.length
        ? repName + ' funded ' + fmt(volume) + ' in ' + mf.label + ' across ' + funded.length + ' deal' + (funded.length!==1?'s':'') + ' (avg ' + fmt(avgDeal) + '/deal).'
        : repName + ' had no funded deals in ' + mf.label + '.',
      insight: avgMon > 0 ? (pct >= 0 ? '+' : '') + pct + '% vs. career monthly average (' + fmt(avgMon) + ').' : null,
      chart:   funded.length ? { data: funded.sort(function(a,b){return b.funded_amount-a.funded_amount;}).slice(0,10).map(function(d){return{name:(d.client_name||'Deal').substring(0,12),value:d.funded_amount};}), label:'Deals in '+mf.label } : null,
      table:   { cols:['Client','Lender','Amount','Date'], rows: funded.sort(function(a,b){return b.funded_amount-a.funded_amount;}).map(function(d){return[d.client_name||'-',d.lender_name||'-',fmt(d.funded_amount),(d.funded_at||d.application_submitted_at||'').substring(0,10)];}) },
    };
  }

  function repOverview(repDeals, repName, timeLabel) {
    var funded    = repDeals.filter(function (d) { return d.approval_status === 'funded'; });
    var volume    = funded.reduce(function (s,d) { return s+d.funded_amount; }, 0);
    var avgDeal   = funded.length ? Math.round(volume/funded.length) : 0;
    var appRate   = repDeals.length ? Math.round(funded.length/repDeals.length*100) : 0;
    var byLender  = {};
    funded.forEach(function (d) {
      var l = d.lender_name || 'Unknown';
      if (!byLender[l]) byLender[l] = { name:l, count:0, volume:0 };
      byLender[l].count++; byLender[l].volume += d.funded_amount||0;
    });
    var lenders  = Object.keys(byLender).map(function(k){return byLender[k];}).sort(function(a,b){return b.volume-a.volume;});
    var monthly  = groupByMonth(funded, 'funded_at');
    return {
      title:   repName + ' — ' + timeLabel,
      answer:  repName + ' funded ' + fmt(volume) + ' across ' + funded.length + ' deal' + (funded.length!==1?'s':'') + ' (' + appRate + '% approval rate, avg ' + fmt(avgDeal) + '/deal).',
      insight: lenders[0] ? 'Top lender: ' + lenders[0].name + ' — ' + lenders[0].count + ' deals, ' + fmt(lenders[0].volume) + '.' : null,
      chart:   monthly.length > 1 ? { data: monthly.map(function(m){return{name:m.month.substring(5),value:m.volume};}), label:'Monthly Funded Volume' } : null,
      table:   lenders.length ? { cols:['Lender','Deals','Volume'], rows:lenders.slice(0,8).map(function(l){return[l.name,l.count,fmt(l.volume)];}) } : null,
    };
  }

  function repLenders(repDeals, repName, timeLabel) {
    var funded = repDeals.filter(function (d) { return d.approval_status === 'funded'; });
    var byLender = {};
    funded.forEach(function (d) {
      var l = d.lender_name||'Unknown';
      if (!byLender[l]) byLender[l] = {name:l,count:0,volume:0};
      byLender[l].count++; byLender[l].volume += d.funded_amount||0;
    });
    var lenders = Object.keys(byLender).map(function(k){return byLender[k];}).sort(function(a,b){return b.volume-a.volume;});
    var top = lenders[0];
    return {
      title:   repName + "'s Lenders — " + timeLabel,
      answer:  top ? repName + ' funds most with ' + top.name + ' — ' + top.count + ' deal'+(top.count!==1?'s':'')+' totaling '+fmt(top.volume)+'.' : 'No funded deals.',
      insight: lenders.length > 1 ? lenders.length+' lenders used. Runner-up: '+lenders[1].name+' ('+fmt(lenders[1].volume)+').' : null,
      chart:   { data:lenders.slice(0,8).map(function(l){return{name:l.name.split(' ')[0],value:l.volume};}), label:'Volume by Lender' },
      table:   { cols:['Lender','Deals','Volume','% of Total'], rows:lenders.map(function(l){return[l.name,l.count,fmt(l.volume),(funded.length?Math.round(l.count/funded.length*100):0)+'%'];}) },
    };
  }

  function repLargestDeal(repDeals, repName, timeLabel) {
    var funded = repDeals.filter(function (d) { return d.approval_status==='funded'&&d.funded_amount>0; }).sort(function(a,b){return b.funded_amount-a.funded_amount;});
    var top = funded[0];
    return {
      title:   repName + "'s Largest Deals — " + timeLabel,
      answer:  top ? repName+"'s biggest deal was "+fmt(top.funded_amount)+' for '+top.client_name+' via '+top.lender_name+'.' : 'No funded deals.',
      insight: funded.length>1 ? 'Avg of top 5: '+fmt(Math.round(funded.slice(0,5).reduce(function(s,d){return s+d.funded_amount;},0)/Math.min(5,funded.length)))+'.' : null,
      chart:   { data:funded.slice(0,8).map(function(d){return{name:(d.client_name||'Deal').substring(0,12),value:d.funded_amount};}), label:'Deal Size' },
      table:   { cols:['Client','Amount','Lender','Date'], rows:funded.slice(0,10).map(function(d){return[d.client_name||'-',fmt(d.funded_amount),d.lender_name||'-',(d.funded_at||d.application_submitted_at||'').substring(0,10)];}) },
    };
  }

  function repApprovalRate(repDeals, repName, timeLabel) {
    var total    = repDeals.length;
    var approved = repDeals.filter(function(d){return['approved','funded'].indexOf(d.approval_status)>-1;}).length;
    var funded   = repDeals.filter(function(d){return d.approval_status==='funded';}).length;
    var declined = repDeals.filter(function(d){return d.approval_status==='declined';}).length;
    var rate     = total ? Math.round(approved/total*100) : 0;
    var fundRate = total ? Math.round(funded/total*100) : 0;
    return {
      title:   repName + "'s Approval Rate — " + timeLabel,
      answer:  repName+' has a '+rate+'% approval rate ('+approved+'/'+total+' apps) and '+fundRate+'% funding rate.',
      insight: total > 0 ? declined+' declined, '+Math.max(0,total-approved-declined)+' still in pipeline.' : null,
      chart:   { data:[{name:'Approved',value:approved},{name:'Funded',value:funded},{name:'Declined',value:declined},{name:'Pending',value:Math.max(0,total-approved-declined)}], label:'Application Outcomes' },
      table:   { cols:['Stage','Count','% of Total'], rows:[['Submitted',total,'100%'],['Approved',approved,rate+'%'],['Funded',funded,fundRate+'%'],['Declined',declined,(total?Math.round(declined/total*100):0)+'%']] },
    };
  }

  function repSpeed(repDeals, repName, timeLabel) {
    var funded = repDeals.filter(function(d){return d.approval_status==='funded'&&d.days_total_to_fund;}).sort(function(a,b){return a.days_total_to_fund-b.days_total_to_fund;});
    var avg    = funded.length ? +(funded.reduce(function(s,d){return s+d.days_total_to_fund;},0)/funded.length).toFixed(1) : null;
    var fastest = funded[0];
    return {
      title:   repName + "'s Funding Speed — " + timeLabel,
      answer:  avg ? repName+' averages '+avg+' days from application to funded across '+funded.length+' deal'+(funded.length!==1?'s':'')+'.' : 'No timing data.',
      insight: fastest ? 'Fastest: '+fastest.days_total_to_fund+' day'+(fastest.days_total_to_fund!==1?'s':'')+' for '+fastest.client_name+'.' : null,
      chart:   { data:funded.slice(0,10).map(function(d){return{name:(d.client_name||'Deal').substring(0,10),value:d.days_total_to_fund};}), label:'Days to Fund' },
      table:   { cols:['Client','Days','Amount','Lender'], rows:funded.slice(0,10).map(function(d){return[d.client_name||'-',d.days_total_to_fund,fmt(d.funded_amount),d.lender_name||'-'];}) },
    };
  }

  function repCommission(repDeals, repName, timeLabel) {
    var funded     = repDeals.filter(function(d){return d.approval_status==='funded';});
    var volume     = funded.reduce(function(s,d){return s+d.funded_amount;},0);
    var commission = Math.round(volume*0.02);
    return {
      title:   repName + "'s Commissions — " + timeLabel,
      answer:  funded.length ? repName+' earned ~'+fmt(commission)+' in estimated commissions from '+fmt(volume)+' funded ('+funded.length+' deals).' : 'No funded deals.',
      insight: funded.length ? 'Avg commission per deal: ~'+fmt(Math.round(commission/funded.length))+'.' : null,
      chart:   null,
      table:   null,
    };
  }

  function repMonthlyTrend(allRepDeals, repName, timeLabel) {
    var data   = groupByMonth(allRepDeals, 'funded_at');
    var latest = data[data.length-1];
    var prev   = data[data.length-2];
    return {
      title:   repName + ' — Monthly Trend',
      answer:  latest ? repName+"'s latest month ("+labelFromKey(latest.month)+'): '+latest.funded+' funded, '+fmt(latest.volume)+'.' : 'No data.',
      insight: latest&&prev ? 'vs. previous: '+(latest.funded-prev.funded>=0?'+':'')+(latest.funded-prev.funded)+' deals, '+(latest.volume>=prev.volume?'+':'')+fmt(Math.abs(latest.volume-prev.volume))+' volume.' : null,
      chart:   { data:data.map(function(m){return{name:m.month.substring(5),value:m.volume};}), label:'Monthly Volume' },
      table:   { cols:['Month','Apps','Funded','Volume'], rows:data.map(function(m){return[labelFromKey(m.month),m.submitted,m.funded,fmt(m.volume)];}) },
    };
  }

  function repLeadSource(repDeals, repName, timeLabel) {
    var bySrc = {};
    repDeals.forEach(function (d) {
      var s = d.lead_source||'Unknown';
      if (!bySrc[s]) bySrc[s]={name:s,total:0,funded:0,volume:0};
      bySrc[s].total++;
      if (d.approval_status==='funded'){bySrc[s].funded++;bySrc[s].volume+=d.funded_amount||0;}
    });
    var sources = Object.keys(bySrc).map(function(k){return bySrc[k];}).sort(function(a,b){return b.volume-a.volume;});
    var top = sources[0];
    return {
      title:   repName + "'s Lead Sources — " + timeLabel,
      answer:  top ? repName+"'s top source is "+top.name+' — '+top.funded+' funded from '+top.total+' apps ('+(top.total?Math.round(top.funded/top.total*100):0)+'% rate).' : 'No data.',
      insight: sources.length>1 ? sources.length+' sources total.' : null,
      chart:   { data:sources.slice(0,8).map(function(s){return{name:s.name,value:s.funded};}), label:'Funded Deals by Source' },
      table:   { cols:['Source','Apps','Funded','Rate','Volume'], rows:sources.map(function(s){return[s.name,s.total,s.funded,(s.total?Math.round(s.funded/s.total*100):0)+'%',fmt(s.volume)];}) },
    };
  }

  function lenderOverview(filtered, lenderMatch, timeLabel) {
    var funded     = filtered.filter(function(d){return d.approval_status==='funded';});
    var approved   = filtered.filter(function(d){return['approved','funded'].indexOf(d.approval_status)>-1;});
    var volume     = funded.reduce(function(s,d){return s+d.funded_amount;},0);
    var rate       = filtered.length ? Math.round(approved.length/filtered.length*100) : 0;
    var lenderName = (funded[0]&&funded[0].lender_name) || cap(lenderMatch);
    var byRep = {};
    funded.forEach(function(d){var r=d.rep_name||'Unknown';if(!byRep[r])byRep[r]={name:r,count:0,volume:0};byRep[r].count++;byRep[r].volume+=d.funded_amount||0;});
    var reps = Object.keys(byRep).map(function(k){return byRep[k];}).sort(function(a,b){return b.volume-a.volume;});
    return {
      title:   lenderName + ' — ' + timeLabel,
      answer:  lenderName+' funded '+fmt(volume)+' across '+funded.length+' deals with a '+rate+'% approval rate from '+filtered.length+' submissions.',
      insight: reps[0] ? 'Top rep: '+reps[0].name+' — '+reps[0].count+' deals, '+fmt(reps[0].volume)+'.' : null,
      chart:   { data:reps.slice(0,8).map(function(r){return{name:r.name.split(' ')[0],value:r.volume};}), label:'Volume by Rep' },
      table:   { cols:['Rep','Deals','Volume'], rows:reps.slice(0,8).map(function(r){return[r.name,r.count,fmt(r.volume)];}) },
    };
  }

  function topFunders(deals, timeLabel) {
    var funded = deals.filter(function(d){return d.approval_status==='funded'&&d.rep_name;});
    var byRep  = {};
    funded.forEach(function(d){if(!byRep[d.rep_name])byRep[d.rep_name]={name:d.rep_name,amount:0,count:0};byRep[d.rep_name].amount+=d.funded_amount||0;byRep[d.rep_name].count++;});
    var ranked = Object.keys(byRep).map(function(k){return byRep[k];}).sort(function(a,b){return b.amount-a.amount;});
    var top = ranked[0];
    return {
      title:   'Top Funders — ' + timeLabel,
      answer:  top ? top.name+' funded the most with '+fmt(top.amount)+' across '+top.count+' deals.' : 'No funded deals.',
      insight: top&&ranked[1] ? top.name+' is ahead of '+ranked[1].name+' by '+fmt(top.amount-ranked[1].amount)+'.' : null,
      chart:   { data:ranked.slice(0,8).map(function(r){return{name:r.name.split(' ')[0],value:r.amount};}), label:'Funded Amount' },
      table:   { cols:['Rank','Rep','Funded','Deals'], rows:ranked.slice(0,10).map(function(r,i){return[i+1,r.name,fmt(r.amount),r.count];}) },
    };
  }

  function topLenders(deals, timeLabel) {
    var funded = deals.filter(function(d){return d.approval_status==='funded'&&d.lender_name;});
    var byLender = {};
    funded.forEach(function(d){
      var l = d.lender_name;
      if(!byLender[l])byLender[l]={name:l,amount:0,count:0};
      byLender[l].amount+=d.funded_amount||0;
      byLender[l].count++;
    });
    var ranked = Object.keys(byLender).map(function(k){return byLender[k];}).sort(function(a,b){return b.amount-a.amount;});
    var top = ranked[0];
    return {
      title:   'Top Lenders — ' + timeLabel,
      answer:  top ? top.name+' funded the most with '+fmt(top.amount)+' across '+top.count+' deals.' : 'No funded deals.',
      insight: top&&ranked[1] ? top.name+' is ahead of '+ranked[1].name+' by '+fmt(top.amount-ranked[1].amount)+'.' : null,
      chart:   { data:ranked.slice(0,8).map(function(r){return{name:r.name,value:r.amount};}), label:'Funded Amount by Lender' },
      table:   { cols:['Rank','Lender','Funded','Deals'], rows:ranked.slice(0,10).map(function(r,i){return[i+1,r.name,fmt(r.amount),r.count];}) },
    };
  }

  function bottomLenders(deals, timeLabel) {
    var funded = deals.filter(function(d){return d.approval_status==='funded'&&d.lender_name;});
    var byLender = {};
    funded.forEach(function(d){
      var l = d.lender_name;
      if(!byLender[l])byLender[l]={name:l,amount:0,count:0};
      byLender[l].amount+=d.funded_amount||0;
      byLender[l].count++;
    });
    var ranked = Object.keys(byLender).map(function(k){return byLender[k];}).sort(function(a,b){return a.amount-b.amount;});
    var bottom = ranked[0];
    return {
      title:   'Least Used Lenders — ' + timeLabel,
      answer:  bottom ? bottom.name+' was used the least with '+fmt(bottom.amount)+' across '+bottom.count+' deals.' : 'No funded deals.',
      insight: ranked.length > 1 ? ranked.length+' lenders total. Next: '+ranked[1].name+' ('+fmt(ranked[1].amount)+').' : null,
      chart:   { data:ranked.slice(0,8).map(function(r){return{name:r.name,value:r.amount};}), label:'Funded Amount by Lender (Ascending)' },
      table:   { cols:['Rank','Lender','Funded','Deals'], rows:ranked.slice(0,10).map(function(r,i){return[i+1,r.name,fmt(r.amount),r.count];}) },
    };
  }

  function bottomFunders(deals, timeLabel) {
    var funded = deals.filter(function(d){return d.approval_status==='funded'&&d.rep_name;});
    var byRep  = {};
    funded.forEach(function(d){if(!byRep[d.rep_name])byRep[d.rep_name]={name:d.rep_name,amount:0,count:0};byRep[d.rep_name].amount+=d.funded_amount||0;byRep[d.rep_name].count++;});
    var ranked = Object.keys(byRep).map(function(k){return byRep[k];}).sort(function(a,b){return a.amount-b.amount;});
    var bottom = ranked[0];
    return {
      title:   'Bottom Funders — ' + timeLabel,
      answer:  bottom ? bottom.name+' funded the least with '+fmt(bottom.amount)+' across '+bottom.count+' deals.' : 'No funded deals.',
      insight: ranked.length > 1 ? ranked[ranked.length-1].name+' leads with '+fmt(ranked[ranked.length-1].amount)+'.' : null,
      chart:   { data:ranked.slice(0,8).map(function(r){return{name:r.name.split(' ')[0],value:r.amount};}), label:'Funded Amount (Ascending)' },
      table:   { cols:['Rank','Rep','Funded','Deals'], rows:ranked.slice(0,10).map(function(r,i){return[i+1,r.name,fmt(r.amount),r.count];}) },
    };
  }

  function teamBestMonth(deals, timeLabel) {
    var funded = deals.filter(function(d){return d.approval_status==='funded';});
    var byMonth = {};
    funded.forEach(function(d){
      var key = monthKey(d.funded_at || d.application_submitted_at || '');
      if(!key)return;
      if(!byMonth[key])byMonth[key]={month:key,count:0,volume:0};
      byMonth[key].count++;
      byMonth[key].volume+=d.funded_amount||0;
    });
    var months = Object.keys(byMonth).map(function(k){return byMonth[k];}).sort(function(a,b){return b.count-a.count;});
    if(!months.length) return {title:'Best Month — '+timeLabel,answer:'No funded deals.',insight:null,chart:null,table:null};
    var best   = months[0];
    var sorted = Object.keys(byMonth).sort().map(function(k){return byMonth[k];});
    return {
      title:   'Best Month — ' + timeLabel,
      answer:  labelFromKey(best.month)+' was the best month with '+best.count+' deals funded, totaling '+fmt(best.volume)+'.',
      insight: months[1] ? 'Runner-up: '+labelFromKey(months[1].month)+' — '+months[1].count+' deals ('+fmt(months[1].volume)+').' : null,
      chart:   { data:sorted.slice(-12).map(function(m){return{name:m.month.substring(5),value:m.count};}), label:'Funded Deals / Month' },
      table:   { cols:['Month','Deals','Volume','Avg Deal'], rows:months.slice(0,15).map(function(m){return[labelFromKey(m.month),m.count,fmt(m.volume),fmt(Math.round(m.volume/m.count))];}) },
    };
  }

  function topStates(deals, timeLabel) {
    var byState = {};
    deals.forEach(function(d){
      var s = d.state || 'Unknown';
      if(!byState[s])byState[s]={name:s,count:0,volume:0};
      byState[s].count++;
      byState[s].volume+=d.funded_amount||0;
    });
    var ranked = Object.keys(byState).map(function(k){return byState[k];}).sort(function(a,b){return b.volume-a.volume;});
    var top = ranked[0];
    return {
      title:   'By State — ' + timeLabel,
      answer:  top ? top.name+' leads with '+top.count+' deals totaling '+fmt(top.volume)+'.' : 'No data.',
      insight: ranked.length > 1 ? ranked.length+' states total. Runner-up: '+ranked[1].name+' ('+fmt(ranked[1].volume)+').' : null,
      chart:   { data:ranked.slice(0,8).map(function(r){return{name:r.name,value:r.volume};}), label:'Volume by State' },
      table:   { cols:['Rank','State','Deals','Volume'], rows:ranked.slice(0,15).map(function(r,i){return[i+1,r.name,r.count,fmt(r.volume)];}) },
    };
  }

  function topPositions(deals, timeLabel) {
    var byPos = {};
    deals.forEach(function(d){
      var p = d.position || 'Unknown';
      if(!byPos[p])byPos[p]={name:p,count:0,volume:0};
      byPos[p].count++;
      byPos[p].volume+=d.funded_amount||0;
    });
    var ranked = Object.keys(byPos).map(function(k){return byPos[k];}).sort(function(a,b){return b.count-a.count;});
    var top = ranked[0];
    var total = deals.length;
    return {
      title:   'By Position — ' + timeLabel,
      answer:  top ? top.name+' position is most common — '+top.count+' deals ('+Math.round(top.count/total*100)+'% of total), '+fmt(top.volume)+' funded.' : 'No data.',
      insight: ranked.length > 1 ? 'Runner-up: '+ranked[1].name+' position — '+ranked[1].count+' deals, '+fmt(ranked[1].volume)+'.' : null,
      chart:   { data:ranked.slice(0,8).map(function(r){return{name:r.name,value:r.count};}), label:'Deals by Position' },
      table:   { cols:['Position','Deals','Volume','% of Total'], rows:ranked.map(function(r){return[r.name,r.count,fmt(r.volume),(total?Math.round(r.count/total*100):0)+'%'];}) },
    };
  }

  function dealTypes(deals, timeLabel) {
    var byType = {};
    deals.forEach(function(d){
      var t = d.deal_type || 'Unknown';
      if(!byType[t])byType[t]={name:t,count:0,volume:0};
      byType[t].count++;
      byType[t].volume+=d.funded_amount||0;
    });
    var ranked = Object.keys(byType).map(function(k){return byType[k];}).sort(function(a,b){return b.count-a.count;});
    var top = ranked[0];
    var total = deals.length;
    return {
      title:   'Deal Types — ' + timeLabel,
      answer:  top ? top.name+' is the most common deal type — '+top.count+' deals ('+Math.round(top.count/total*100)+'%), '+fmt(top.volume)+' funded.' : 'No data.',
      insight: ranked.length > 1 ? ranked.length+' deal types. Runner-up: '+ranked[1].name+' ('+ranked[1].count+' deals).' : null,
      chart:   { data:ranked.slice(0,8).map(function(r){return{name:r.name,value:r.count};}), label:'Deals by Type' },
      table:   { cols:['Type','Deals','Volume','% of Total'], rows:ranked.map(function(r){return[r.name,r.count,fmt(r.volume),(total?Math.round(r.count/total*100):0)+'%'];}) },
    };
  }

  function revenueByRep(deals, timeLabel) {
    var byRep = {};
    deals.filter(function(d){return d.rep_name&&d.revenue>0;}).forEach(function(d){
      var r = d.rep_name;
      if(!byRep[r])byRep[r]={name:r,revenue:0,count:0};
      byRep[r].revenue+=d.revenue;
      byRep[r].count++;
    });
    var ranked = Object.keys(byRep).map(function(k){return byRep[k];}).sort(function(a,b){return b.revenue-a.revenue;});
    var top = ranked[0];
    var totalRev = ranked.reduce(function(s,r){return s+r.revenue;},0);
    return {
      title:   'Revenue by Rep — ' + timeLabel,
      answer:  top ? top.name+' generated the most revenue — '+fmt(top.revenue)+' across '+top.count+' deals ('+fmt(Math.round(top.revenue/top.count))+'/deal).' : 'No data.',
      insight: totalRev > 0 ? 'Total team revenue: '+fmt(totalRev)+'. Avg per deal: '+fmt(Math.round(totalRev/deals.length))+'.' : null,
      chart:   { data:ranked.slice(0,8).map(function(r){return{name:r.name.split(' ')[0],value:r.revenue};}), label:'Revenue by Rep' },
      table:   { cols:['Rank','Rep','Revenue','Deals','Rev/Deal'], rows:ranked.slice(0,10).map(function(r,i){return[i+1,r.name,fmt(r.revenue),r.count,fmt(Math.round(r.revenue/r.count))];}) },
    };
  }

  function approvalRates(deals, timeLabel) {
    var byRep = {};
    deals.filter(function(d){return !!d.rep_name;}).forEach(function(d){if(!byRep[d.rep_name])byRep[d.rep_name]={name:d.rep_name,total:0,approved:0};byRep[d.rep_name].total++;if(['approved','funded'].indexOf(d.approval_status)>-1)byRep[d.rep_name].approved++;});
    var ranked = Object.keys(byRep).map(function(k){var r=byRep[k];return{name:r.name,total:r.total,approved:r.approved,rate:r.total?Math.round(r.approved/r.total*100):0};}).sort(function(a,b){return b.rate-a.rate;});
    var top = ranked[0];
    return {
      title:   'Approval Rates — ' + timeLabel,
      answer:  top ? top.name+' has the highest approval rate at '+top.rate+'% ('+top.approved+'/'+top.total+' deals).' : 'No data.',
      insight: top ? 'Team average: '+Math.round(ranked.reduce(function(s,r){return s+r.rate;},0)/ranked.length)+'%.' : null,
      chart:   { data:ranked.slice(0,8).map(function(r){return{name:r.name.split(' ')[0],value:r.rate};}), label:'Approval %' },
      table:   { cols:['Rank','Rep','Rate','Approved','Total'], rows:ranked.slice(0,10).map(function(r,i){return[i+1,r.name,r.rate+'%',r.approved,r.total];}) },
    };
  }

  function fundingSpeed(deals, timeLabel) {
    var funded = deals.filter(function(d){return d.approval_status==='funded'&&d.days_total_to_fund&&d.rep_name;});
    var byRep  = {};
    funded.forEach(function(d){if(!byRep[d.rep_name])byRep[d.rep_name]={name:d.rep_name,days:[],count:0};byRep[d.rep_name].days.push(d.days_total_to_fund);byRep[d.rep_name].count++;});
    var ranked = Object.keys(byRep).map(function(k){var r=byRep[k];var avg=+(r.days.reduce(function(s,v){return s+v;},0)/r.days.length).toFixed(1);return{name:r.name,avg:avg,count:r.count};}).sort(function(a,b){return a.avg-b.avg;});
    var top = ranked[0];
    return {
      title:   'Funding Speed — ' + timeLabel,
      answer:  top ? top.name+' has the fastest average at '+top.avg+' days across '+top.count+' deals.' : 'No data.',
      insight: top ? 'Team average: '+(ranked.reduce(function(s,r){return s+r.avg;},0)/ranked.length).toFixed(1)+' days.' : null,
      chart:   { data:ranked.slice(0,8).map(function(r){return{name:r.name.split(' ')[0],value:r.avg};}), label:'Avg Days to Fund' },
      table:   { cols:['Rank','Rep','Avg Days','Deals'], rows:ranked.slice(0,10).map(function(r,i){return[i+1,r.name,r.avg,r.count];}) },
    };
  }

  function largestDeals(deals, timeLabel) {
    var funded = deals.filter(function(d){return d.funded_amount>0;}).sort(function(a,b){return b.funded_amount-a.funded_amount;});
    var top = funded[0];
    return {
      title:   'Largest Deals — ' + timeLabel,
      answer:  top ? 'Largest deal: '+fmt(top.funded_amount)+' for '+top.client_name+' by '+top.rep_name+' via '+top.lender_name+'.' : 'No funded deals.',
      insight: funded.length>3 ? 'Avg of top 5: '+fmt(Math.round(funded.slice(0,5).reduce(function(s,d){return s+d.funded_amount;},0)/5))+'.' : null,
      chart:   { data:funded.slice(0,8).map(function(d){return{name:(d.client_name||'').substring(0,12),value:d.funded_amount};}), label:'Amount' },
      table:   { cols:['Rank','Client','Rep','Lender','Amount'], rows:funded.slice(0,10).map(function(d,i){return[i+1,d.client_name,d.rep_name,d.lender_name,fmt(d.funded_amount)];}) },
    };
  }

  function compareReps(q, deals, timeLabel, allDeals) {
    var repNames = [];
    allDeals.forEach(function(d){if(d.rep_name&&repNames.indexOf(d.rep_name)===-1)repNames.push(d.rep_name);});
    var found = repNames.filter(function(n){return q.indexOf(n.split(' ')[0].toLowerCase())>-1;});
    var pair  = found.length >= 2 ? found.slice(0,2) : repNames.slice(0,2);
    var results = pair.map(function(name){
      var rd=deals.filter(function(d){return d.rep_name===name;});
      var fn=rd.filter(function(d){return d.approval_status==='funded';});
      return{name:name,total:rd.length,funded:fn.length,volume:fn.reduce(function(s,d){return s+d.funded_amount;},0),rate:rd.length?Math.round(fn.length/rd.length*100):0};
    });
    if (results.length < 2) results.push({name:'N/A',total:0,funded:0,volume:0,rate:0});
    return {
      title:   results[0].name+' vs '+results[1].name+' — '+timeLabel,
      answer:  results[0].name+': '+fmt(results[0].volume)+' funded ('+results[0].rate+'% rate). '+results[1].name+': '+fmt(results[1].volume)+' funded ('+results[1].rate+'% rate).',
      insight: results[0].volume>results[1].volume ? results[0].name+' is outpacing by '+fmt(results[0].volume-results[1].volume)+'.' : results[1].name+' is outpacing by '+fmt(results[1].volume-results[0].volume)+'.',
      chart:   { data:[{name:results[0].name.split(' ')[0],value:results[0].volume},{name:results[1].name.split(' ')[0],value:results[1].volume}], label:'Funded Volume' },
      table:   { cols:['Metric',results[0].name,results[1].name], rows:[['Deals',results[0].total,results[1].total],['Funded',results[0].funded,results[1].funded],['Volume',fmt(results[0].volume),fmt(results[1].volume)],['Rate',results[0].rate+'%',results[1].rate+'%']] },
    };
  }

  function leadSources(deals, timeLabel) {
    var bySrc = {};
    deals.forEach(function(d){var s=d.lead_source||'Unknown';if(!bySrc[s])bySrc[s]={name:s,total:0,funded:0,volume:0};bySrc[s].total++;if(d.approval_status==='funded'){bySrc[s].funded++;bySrc[s].volume+=d.funded_amount||0;}});
    var ranked = Object.keys(bySrc).map(function(k){var s=bySrc[k];return{name:s.name,total:s.total,funded:s.funded,volume:s.volume,rate:s.total?Math.round(s.funded/s.total*100):0};}).sort(function(a,b){return b.rate-a.rate;});
    return {
      title:   'Lead Source Performance — ' + timeLabel,
      answer:  ranked[0] ? ranked[0].name+' converts at '+ranked[0].rate+'% funding rate.' : 'No data.',
      insight: null,
      chart:   { data:ranked.slice(0,8).map(function(s){return{name:s.name,value:s.rate};}), label:'Conversion %' },
      table:   { cols:['Source','Apps','Funded','Rate','Volume'], rows:ranked.map(function(s){return[s.name,s.total,s.funded,s.rate+'%',fmt(s.volume)];}) },
    };
  }

  function trend(deals, timeLabel) {
    var data   = groupByMonth(deals, 'application_submitted_at');
    var latest = data[data.length-1];
    var prev   = data[data.length-2];
    return {
      title:   'Monthly Trend — ' + timeLabel,
      answer:  latest ? data.length+' months of data. Latest: '+latest.submitted+' apps, '+latest.funded+' funded.' : 'No data.',
      insight: latest&&prev ? 'Month-over-month funded change: '+(latest.funded-prev.funded)+' deals.' : null,
      chart:   { data:data.map(function(m){return{name:m.month.substring(5),value:m.funded};}), label:'Funded Deals / Month' },
      table:   { cols:['Month','Submitted','Funded','Volume'], rows:data.map(function(m){return[labelFromKey(m.month),m.submitted,m.funded,fmt(m.volume)];}) },
    };
  }

  function pipeline(deals, timeLabel) {
    var stages = ['submitted','docs_uploaded','underwriting','approved','funded'];
    var counts = stages.map(function(s){return{stage:s,count:deals.filter(function(d){return d.approval_status===s;}).length};});
    var total  = deals.length;
    return {
      title:   'Pipeline Funnel — ' + timeLabel,
      answer:  total+' total applications. '+(counts[4].count)+' funded.',
      insight: 'Conversion: '+(total?Math.round(counts[4].count/total*100):0)+'% submitted → funded.',
      chart:   { data:counts.map(function(c){return{name:c.stage,value:c.count};}), label:'Pipeline' },
      table:   { cols:['Stage','Count','% of Total'], rows:counts.map(function(c){return[c.stage,c.count,(total?Math.round(c.count/total*100):0)+'%'];}) },
    };
  }

  function commissions(deals, timeLabel) {
    var funded = deals.filter(function(d){return d.approval_status==='funded'&&d.rep_name;});
    var byRep  = {};
    funded.forEach(function(d){if(!byRep[d.rep_name])byRep[d.rep_name]={name:d.rep_name,volume:0,count:0};byRep[d.rep_name].volume+=d.funded_amount||0;byRep[d.rep_name].count++;});
    var ranked = Object.keys(byRep).map(function(k){var r=byRep[k];return{name:r.name,volume:r.volume,count:r.count,commission:Math.round(r.volume*0.02)};}).sort(function(a,b){return b.commission-a.commission;});
    return {
      title:   'Estimated Commissions — ' + timeLabel,
      answer:  ranked[0] ? ranked[0].name+' leads with ~'+fmt(ranked[0].commission)+' from '+fmt(ranked[0].volume)+' funded.' : 'No data.',
      insight: 'Total team: ~'+fmt(ranked.reduce(function(s,r){return s+r.commission;},0))+'.',
      chart:   { data:ranked.slice(0,8).map(function(r){return{name:r.name.split(' ')[0],value:r.commission};}), label:'Commission' },
      table:   { cols:['Rep','Volume','Deals','Est. Commission'], rows:ranked.map(function(r){return[r.name,fmt(r.volume),r.count,fmt(r.commission)];}) },
    };
  }

  // ── Result rendering ───────────────────────────────────────────────────────
  function renderBarChart(data, label) {
    if (!data || !data.length) return '';
    var max = 0;
    data.forEach(function(d){if((d.value||0)>max)max=d.value;});
    if (!max) return '';
    var bars = data.map(function (d) {
      var pct = Math.round((d.value / max) * 100);
      return '<div class="cms-bar-row">' +
        '<span class="cms-bar-name">' + (d.name || '').substring(0, 14) + '</span>' +
        '<div class="cms-bar-track"><div class="cms-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="cms-bar-val">' + (typeof d.value === 'number' && d.value >= 1000 ? fmtNum(d.value) : d.value) + '</span>' +
      '</div>';
    }).join('');
    return '<div class="cms-chart"><div class="cms-chart-label">' + label + '</div>' + bars + '</div>';
  }

  function renderTable(table) {
    if (!table || !table.rows || !table.rows.length) return '';
    var head = table.cols.map(function (c) { return '<th>' + c + '</th>'; }).join('');
    var rows = table.rows.map(function (r) {
      return '<tr>' + r.map(function (cell) { return '<td>' + cell + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<div class="cms-table-wrap"><table class="cms-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderResult(result, query) {
    if (!result) return '<div class="cms-empty">No results found.</div>';
    var html = '<div class="cms-result">';
    html += '<div class="cms-result-header"><span class="cms-result-icon">✦</span><div><h2 class="cms-result-title">' + result.title + '</h2>';
    html += '<p class="cms-result-answer">' + result.answer + '</p></div></div>';
    if (result.chart) html += renderBarChart(result.chart.data, result.chart.label);
    if (result.table) html += renderTable(result.table);
    if (result.insight) html += '<div class="cms-insight"><span class="cms-insight-dot">◆</span>' + result.insight + '</div>';
    html += '</div>';
    return html;
  }

  // ── Overlay UI ─────────────────────────────────────────────────────────────
  var STYLES = `
    #cms-overlay { position:fixed; inset:0; z-index:9999; display:flex; align-items:flex-start; justify-content:center; padding-top:80px; background:rgba(0,0,0,0.45); backdrop-filter:blur(4px); opacity:0; transition:opacity 0.2s ease; pointer-events:none; }
    #cms-overlay.open { opacity:1; pointer-events:auto; }
    #cms-panel { background:#fff; border-radius:20px; width:100%; max-width:720px; max-height:80vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 80px rgba(0,0,0,0.25),0 8px 24px rgba(0,0,0,0.15); transform:translateY(-12px); transition:transform 0.25s cubic-bezier(0.22,1,0.36,1); }
    #cms-overlay.open #cms-panel { transform:translateY(0); }
    .cms-panel-head { display:flex; align-items:center; gap:10px; padding:16px 20px; border-bottom:1px solid #f0f0f0; flex-shrink:0; }
    .cms-search-icon { width:18px; height:18px; color:#2563EB; flex-shrink:0; }
    .cms-query-text { flex:1; font-size:14px; color:#666; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cms-close { width:28px; height:28px; border:none; background:#f4f4f4; border-radius:8px; cursor:pointer; font-size:16px; line-height:1; color:#666; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background 0.12s; }
    .cms-close:hover { background:#e8e8e8; }
    .cms-panel-body { overflow-y:auto; padding:20px 24px 28px; }
    .cms-loading { display:flex; align-items:center; gap:10px; color:#888; font-size:14px; padding:32px 0; justify-content:center; }
    .cms-spinner { width:18px; height:18px; border:2px solid #e0e0e0; border-top-color:#2563EB; border-radius:50%; animation:cms-spin 0.7s linear infinite; }
    @keyframes cms-spin { to { transform:rotate(360deg); } }
    .cms-result { }
    .cms-result-header { display:flex; align-items:flex-start; gap:12px; margin-bottom:20px; }
    .cms-result-icon { width:32px; height:32px; background:#EFF6FF; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:13px; color:#2563EB; flex-shrink:0; }
    .cms-result-title { font-size:16px; font-weight:700; color:#111; margin-bottom:4px; }
    .cms-result-answer { font-size:15px; color:#333; line-height:1.55; }
    .cms-chart { margin-bottom:20px; }
    .cms-chart-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:#999; margin-bottom:10px; }
    .cms-bar-row { display:flex; align-items:center; gap:8px; margin-bottom:7px; }
    .cms-bar-name { font-size:12px; color:#555; width:80px; flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right; }
    .cms-bar-track { flex:1; height:10px; background:#f0f0f0; border-radius:100px; overflow:hidden; }
    .cms-bar-fill { height:100%; background:linear-gradient(90deg,#2563EB,#10B981); border-radius:100px; transition:width 0.6s cubic-bezier(0.22,1,0.36,1); }
    .cms-bar-val { font-size:12px; font-weight:600; color:#333; width:60px; flex-shrink:0; }
    .cms-table-wrap { overflow-x:auto; margin-bottom:20px; border:1px solid #f0f0f0; border-radius:12px; }
    .cms-table { width:100%; border-collapse:collapse; font-size:13px; }
    .cms-table thead tr { background:#f8f8f8; }
    .cms-table th { padding:9px 12px; text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#888; white-space:nowrap; }
    .cms-table td { padding:9px 12px; color:#333; border-top:1px solid #f4f4f4; }
    .cms-table tbody tr:hover td { background:#fafafa; }
    .cms-insight { display:flex; align-items:flex-start; gap:8px; padding:12px 14px; background:#F0FDF4; border-radius:10px; font-size:13px; color:#166534; }
    .cms-insight-dot { flex-shrink:0; font-size:10px; margin-top:2px; }
    .cms-empty { text-align:center; padding:40px; color:#999; font-size:14px; }
    .cms-filters { display:flex; gap:6px; padding:10px 20px; border-bottom:1px solid #f0f0f0; flex-wrap:wrap; flex-shrink:0; }
    .cms-chip { padding:4px 13px; border-radius:100px; border:1.5px solid #e0e0e0; background:#fff; font-size:12px; font-weight:500; color:#555; cursor:pointer; transition:all 0.12s; white-space:nowrap; }
    .cms-chip:hover { border-color:#2563EB; color:#2563EB; }
    .cms-chip.active { background:#2563EB; border-color:#2563EB; color:#fff; }

    @media (prefers-color-scheme: dark) {
      html[data-theme="dark"] #cms-panel { background:#141C28; }
      html[data-theme="dark"] .cms-panel-head { border-color:#1A2435; }
      html[data-theme="dark"] .cms-close { background:#1A2435; color:#aaa; }
      html[data-theme="dark"] .cms-close:hover { background:#243044; }
      html[data-theme="dark"] .cms-result-title { color:#F1F5F9; }
      html[data-theme="dark"] .cms-result-answer { color:#CBD5E1; }
      html[data-theme="dark"] .cms-bar-track { background:#1A2435; }
      html[data-theme="dark"] .cms-table-wrap { border-color:#1A2435; }
      html[data-theme="dark"] .cms-table thead tr { background:#0C0F14; }
      html[data-theme="dark"] .cms-table th { color:#4A5F78; }
      html[data-theme="dark"] .cms-table td { color:#CBD5E1; border-color:#1A2435; }
      html[data-theme="dark"] .cms-table tbody tr:hover td { background:#111720; }
      html[data-theme="dark"] .cms-insight { background:rgba(16,185,129,0.1); color:#6EE7B7; }
      html[data-theme="dark"] .cms-bar-name { color:#7A8FA8; }
      html[data-theme="dark"] .cms-bar-val { color:#CBD5E1; }
      html[data-theme="dark"] .cms-chart-label { color:#4A5F78; }
      html[data-theme="dark"] .cms-query-text { color:#7A8FA8; }
      html[data-theme="dark"] .cms-filters { border-color:#1A2435; }
      html[data-theme="dark"] .cms-chip { background:#0C0F14; border-color:#1A2435; color:#7A8FA8; }
      html[data-theme="dark"] .cms-chip:hover { border-color:#2563EB; color:#93C5FD; }
      html[data-theme="dark"] .cms-chip.active { background:#2563EB; border-color:#2563EB; color:#fff; }
    }
  `;

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function buildOverlay() {
    var el = document.createElement('div');
    el.id  = 'cms-overlay';
    el.innerHTML =
      '<div id="cms-panel">' +
        '<div class="cms-panel-head">' +
          '<svg class="cms-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 3 3" stroke-linecap="round"/></svg>' +
          '<span class="cms-query-text" id="cms-query-display"></span>' +
          '<button class="cms-close" id="cms-close-btn" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="cms-filters" id="cms-filters"></div>' +
        '<div class="cms-panel-body" id="cms-panel-body"></div>' +
      '</div>';
    document.body.appendChild(el);

    el.addEventListener('click', function (e) { if (e.target === el) closeOverlay(); });
    document.getElementById('cms-close-btn').addEventListener('click', closeOverlay);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOverlay(); });
  }

  function renderBody(query, filterOverride) {
    var body = document.getElementById('cms-panel-body');
    body.innerHTML = '<div class="cms-loading"><div class="cms-spinner"></div>Analyzing your query…</div>';
    loadData(function (deals) {
      var result = processQuery(query, deals, filterOverride);
      body.innerHTML = renderResult(result, query);
      setTimeout(function () {
        body.querySelectorAll('.cms-bar-fill').forEach(function (bar) {
          var w = bar.style.width; bar.style.width = '0';
          setTimeout(function () { bar.style.width = w; }, 10);
        });
      }, 20);
    });
  }

  function renderChips(query, activeIdx) {
    var container = document.getElementById('cms-filters');
    container.innerHTML = FILTER_CHIPS.map(function (chip, i) {
      return '<button class="cms-chip' + (i === activeIdx ? ' active' : '') + '" data-idx="' + i + '">' + chip.label + '</button>';
    }).join('');
    container.querySelectorAll('.cms-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-idx'));
        container.querySelectorAll('.cms-chip').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderBody(_currentQuery, FILTER_CHIPS[idx].filter);
      });
    });
  }

  function detectActiveChip(q) {
    var pf = detectPeriod(q);
    var tf = detectTimeWindow(q);
    if (!pf && !tf.days) return 0; // All Time
    if (pf && pf.type === 'year') {
      for (var i = 0; i < FILTER_CHIPS.length; i++) {
        var fc = FILTER_CHIPS[i].filter;
        if (fc.type === 'year' && fc.year === pf.year) return i;
      }
    }
    if (tf.days === 90) return 4;
    if (tf.days === 30) return 5;
    return -1; // no chip matches — none active
  }

  function openOverlay(query) {
    _currentQuery = query;
    var overlay = document.getElementById('cms-overlay');
    var display = document.getElementById('cms-query-display');
    display.textContent = '"' + query + '"';
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderChips(query, detectActiveChip(query.toLowerCase().trim()));
    renderBody(query, null);
  }

  function closeOverlay() {
    var overlay = document.getElementById('cms-overlay');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Wire up search inputs ──────────────────────────────────────────────────
  function wireSearch() {
    var inputs = document.querySelectorAll('.search-input, input[aria-label="Search"]');
    inputs.forEach(function (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && input.value.trim()) {
          var q = input.value.trim();
          input.value = '';
          openOverlay(q);
        }
      });
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    buildOverlay();
    wireSearch();
    // Pre-fetch data in background so first search is instant
    loadData(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
