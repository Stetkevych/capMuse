// Rep career + today stats from funding_book_live.json
(function () {
  'use strict';

  let PACKAGE_OWNER_RECORD_FIXES = {
    '3793076000601237337': 'House .',
    '3793076000605384128': 'House .',
    '3793076000606189343': 'House .',
    '3793076000624144182': 'House .',
    '3793076000649034499': 'House .'
  };

  function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }

  function normStr(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
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

  function fmtMoney(v) {
    if (v == null || v === '') return '';
    let n = typeof v === 'number' ? v : nn(v);
    if (!n) return '$0';
    if (n >= 1e6 || Math.round(n / 1000) >= 1000) {
      return '$' + (n / 1e6).toFixed(2) + 'M';
    }
    if (n >= 1e3) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n).toLocaleString();
  }

  function parseDate(s) {
    if (!s) return null;
    let d = new Date(String(s).length === 10 ? String(s) + 'T12:00:00' : s);
    return isNaN(d.getTime()) ? null : d;
  }

  function applicationDate(r) {
    return parseDate(
      r.Date_Applied || r.date_applied || r.application_submitted_at || r.applied_at || ''
    );
  }

  function mapRecord(r) {
    let raw = Object.assign({}, r);
    raw.package_owner = packageOwnerFromRecord(r);
    if (raw.package_owner) raw['Package_Owner.name'] = raw.package_owner;

    let daysField = nn(r.days_total_to_fund || r.days_to_fund);
    return {
      funding: nn(r.funding || r.Funded_Amount),
      revenue: nn(r.revenue || r.Total_rev),
      date: parseDate(r.date_funded || r.Date_Funded || ''),
      applied: applicationDate(r),
      daysTotal: daysField > 0 ? daysField : null,
      raw: raw
    };
  }

  function isFundedDeal(d) {
    return d.funding > 0 && d.date;
  }

  function isToday(d) {
    let n = new Date();
    return d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  function isThisMonth(d) {
    let n = new Date();
    return d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  }

  function isThisYear(d) {
    let n = new Date();
    return d && d.getFullYear() === n.getFullYear();
  }

  function sumField(list, key) {
    return list.reduce(function (s, d) { return s + (d[key] || 0); }, 0);
  }

  function recordMatchesRep(record, rep, userId, options) {
    options = options || {};
    if (window.CapMuseRepMatch) {
      return window.CapMuseRepMatch.recordMatchesRep(record, rep, userId, options);
    }
    let owner = record.package_owner || record['Package_Owner.name'] || '';
    let target = (rep && (rep.bookName || rep.name)) || userId || '';
    return owner && target && owner.toLowerCase() === target.toLowerCase();
  }

  function bestMonthLabel(deals) {
    let byMonth = {};
    deals.forEach(function (d) {
      if (!d.date) return;
      let mo = d.date.getMonth() + 1;
      let key = d.date.getFullYear() + '-' + (mo < 10 ? '0' + mo : mo);
      if (!byMonth[key]) byMonth[key] = 0;
      byMonth[key] += d.funding;
    });
    let best = null;
    let bestVol = 0;
    Object.keys(byMonth).forEach(function (k) {
      if (byMonth[k] > bestVol) { bestVol = byMonth[k]; best = k; }
    });
    if (!best) return null;
    let parts = best.split('-');
    let months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
  }

  let MIN_TIME_TO_FUND_DEALS = 5;

  function dealTimeMs(d) {
    if (d.daysTotal != null) return d.daysTotal * 86400000;
    // created_time is Zoho record sync time, not application date — only use explicit apply dates
    if (!d.applied || !d.date) return null;
    let diff = d.date.getTime() - d.applied.getTime();
    if (diff < 86400000 || diff >= 730 * 86400000) return null;
    return diff;
  }

  function formatDuration(ms) {
    if (ms == null || ms < 0) return null;
    let mins = ms / 60000;
    if (mins < 60) {
      let rounded = Math.max(1, Math.round(mins));
      return rounded === 1 ? '1 min' : rounded + ' mins';
    }
    let hours = ms / 3600000;
    if (hours < 24) {
      let h = Math.round(hours * 10) / 10;
      return h === 1 ? '1 hour' : h + ' hours';
    }
    let days = ms / 86400000;
    if (days >= 2) {
      let d = Math.round(days);
      return d === 1 ? '1 day' : d + ' days';
    }
    let d = Math.round(days * 10) / 10;
    return d === 1 ? '1 day' : d + ' days';
  }

  function avgTimeToFund(deals) {
    let times = [];
    deals.forEach(function (d) {
      let ms = dealTimeMs(d);
      if (ms != null) times.push(ms);
    });
    if (times.length < MIN_TIME_TO_FUND_DEALS) return null;
    let avg = times.reduce(function (s, n) { return s + n; }, 0) / times.length;
    return formatDuration(avg);
  }

  function fundedYtd(deals) {
    let ytd = deals.filter(function (d) { return isThisYear(d.date); });
    return sumField(ytd, 'funding');
  }

  function emptyToday() {
    return {
      leads: null, pulls: null, dealsOwned: null, funded: 0,
      volume: 0, commission: null, pipeline: null, calls: null
    };
  }

  function emptyLive() {
    return {
      today: emptyToday(),
      stats: {
        experience: null, age: null, height: null,
        avgDeal: null, timeToFund: null, totalDeals: 0,
        totalApps: 0, totalApprovals: 0,
        volume: null
      },
      kpis: {
        bestMonth: null, largestDeal: null, fundedYtd: null, avgRevenue: null
      },
      hero: { volumeToday: 0, fundedToday: 0, mtdVolume: 0 }
    };
  }

  function isHousePipelineName(name) {
    return normStr(name).replace(/\./g, '').trim() === 'house';
  }

  function pipelineRepName(r) {
    return (r['Puller'] || r['Packages in Process Owner'] || '').trim();
  }

  function pipelineRowMatchesRep(r, rep, userId) {
    let assigned = pipelineRepName(r);
    if (!assigned || isHousePipelineName(assigned)) return false;
    let target = (rep && (rep.bookName || rep.name)) || userId || '';
    if (!target) return false;
    if (window.CapMuseRepMatch) {
      return window.CapMuseRepMatch.namesMatch(assigned, target);
    }
    return normStr(assigned) === normStr(target);
  }

  function countPipelineForRep(userId, rows) {
    let out = { totalApps: 0, totalApprovals: 0 };
    if (!rows || !rows.length || !window.REPS || !window.REPS[userId]) return out;
    let rep = window.REPS[userId];
    if (!rep.bookName && !rep.name) return out;

    rows.forEach(function (r) {
      if (!pipelineRowMatchesRep(r, rep, userId)) return;
      let stage = (r['Stage of Package'] || '').toLowerCase();
      if (r['Date Applied'] || stage.indexOf('pack') > -1 || stage.indexOf('review') > -1 ||
          stage.indexOf('approv') > -1 || stage.indexOf('fund') > -1) {
        out.totalApps++;
      }
      if (stage.indexOf('approv') > -1 || (stage.indexOf('fund') > -1 && stage.indexOf('decline') === -1)) {
        out.totalApprovals++;
      }
    });
    return out;
  }

  function mergePipelineStats(live, userId, pipelineRows) {
    if (!live) live = emptyLive();
    let p = countPipelineForRep(userId, pipelineRows || []);
    live.stats.totalApps = p.totalApps;
    live.stats.totalApprovals = p.totalApprovals;
    return live;
  }

  function computeLive(userId, raw) {
    if (!window.REPS || !window.REPS[userId]) return null;
    let rep = window.REPS[userId];
    if (!rep.bookName) return emptyLive();
    let mapped = raw.filter(function (r) { return r.company || r.Deal_Name; }).map(mapRecord);
    let fundedDeals = mapped.filter(function (d) {
      return isFundedDeal(d) && recordMatchesRep(d.raw, rep, userId, { fundedOnly: true });
    });

    if (!fundedDeals.length) {
      return emptyLive();
    }

    let todayDeals = fundedDeals.filter(function (d) { return isToday(d.date); });
    let mtdDeals = fundedDeals.filter(function (d) { return isThisMonth(d.date); });
    let totalVol = sumField(fundedDeals, 'funding');
    let totalRev = sumField(fundedDeals, 'revenue');
    let totalDeals = fundedDeals.length;
    let avgDeal = totalVol / totalDeals;
    let largest = fundedDeals.reduce(function (m, d) { return d.funding > m ? d.funding : m; }, 0);
    let todayVol = sumField(todayDeals, 'funding');
    let ytdVol = fundedYtd(fundedDeals);

    return {
      today: {
        leads: null,
        pulls: null,
        dealsOwned: null,
        funded: todayDeals.length,
        volume: todayVol,
        commission: null,
        pipeline: null,
        calls: null
      },
      stats: {
        experience: null,
        age: null,
        height: null,
        avgDeal: fmtMoney(avgDeal),
        timeToFund: avgTimeToFund(fundedDeals),
        totalDeals: totalDeals,
        totalApps: 0,
        totalApprovals: 0,
        volume: fmtMoney(totalVol)
      },
      kpis: {
        bestMonth: bestMonthLabel(fundedDeals),
        largestDeal: fmtMoney(largest),
        fundedYtd: ytdVol > 0 ? fmtMoney(ytdVol) : '$0',
        avgRevenue: totalDeals && totalRev ? fmtMoney(totalRev / totalDeals) : null
      },
      hero: {
        volumeToday: todayVol,
        fundedToday: todayDeals.length,
        mtdVolume: sumField(mtdDeals, 'funding')
      }
    };
  }

  function applyLive(userId, live) {
    if (!live || !window.REPS[userId]) return live;
    let rep = window.REPS[userId];
    rep.today = Object.assign({}, live.today);
    rep.stats = Object.assign({}, live.stats);
    rep.kpis = Object.assign({}, live.kpis);
    rep._liveData = true;

    window.dispatchEvent(new CustomEvent('capmuse:rep-stats-updated', {
      detail: { userId: userId, live: live }
    }));

    return live;
  }

  function applyForRep(userId) {
    if (!window.REPS || !window.REPS[userId]) return Promise.resolve(null);
    if (!window.CapMuseData) return Promise.resolve(null);

    let dealsP = window.CapMuseData.getRawDeals();
    let pipelineP = window.CapMuseData.getPipelineRows
      ? window.CapMuseData.getPipelineRows()
      : Promise.resolve([]);

    return Promise.all([dealsP, pipelineP]).then(function (results) {
      let raw = results[0];
      let pipelineRows = results[1];
      let live;

      if (!raw || !raw.length) {
        live = mergePipelineStats(emptyLive(), userId, pipelineRows);
        return applyLive(userId, live);
      }

      live = computeLive(userId, raw);
      if (!live) live = emptyLive();
      live = mergePipelineStats(live, userId, pipelineRows);
      return applyLive(userId, live);
    });
  }

  function refreshOpenProfilePanels(userId, live) {
    if (!live) return;

    let heroRow = document.getElementById('heroQuickStats');
    if (heroRow && document.body.classList.contains('home-page')) {
      let vals = heroRow.querySelectorAll('.hero-qs-val');
      let lbls = heroRow.querySelectorAll('.hero-qs-lbl');
      if (vals[0]) vals[0].textContent = live.hero.volumeToday === 0 ? '$0' : (fmtMoney(live.hero.volumeToday) || '');
      if (vals[1]) vals[1].textContent = String(live.hero.fundedToday != null ? live.hero.fundedToday : 0);
      if (vals[2]) vals[2].textContent = live.hero.mtdVolume === 0 ? '$0' : (fmtMoney(live.hero.mtdVolume) || '');
      if (lbls[0]) lbls[0].textContent = 'Volume today';
      if (lbls[1]) lbls[1].textContent = 'Funded today';
      if (lbls[2]) lbls[2].textContent = 'MTD volume';
    }

    let perfGrid = document.getElementById('perfGrid');
    if (perfGrid && window.renderTodayPerfPanel) {
      window.renderTodayPerfPanel(perfGrid, userId, { animate: false });
    }
  }

  window.CapMuseRepStats = {
    computeLive: computeLive,
    applyLive: applyLive,
    applyForRep: applyForRep,
    refreshOpenProfilePanels: refreshOpenProfilePanels,
    fmtMoney: fmtMoney,
    formatDuration: formatDuration
  };
})();
