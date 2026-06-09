// Rep career + today stats from funding_book_live.json
(function () {
  'use strict';

  function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }

  function fmtMoney(v) {
    if (v == null || v === '') return '';
    var n = typeof v === 'number' ? v : nn(v);
    if (!n) return '';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n).toLocaleString();
  }

  function parseDate(s) {
    if (!s) return null;
    var d = new Date(String(s).length === 10 ? String(s) + 'T12:00:00' : s);
    return isNaN(d.getTime()) ? null : d;
  }

  function mapRecord(r) {
    return {
      funding: nn(r.funding || r.Funded_Amount),
      revenue: nn(r.revenue || r.Total_rev),
      date: parseDate(r.date_funded || r.Date_Funded || ''),
      created: parseDate(r.created_time || r.Created_Time || ''),
      raw: r
    };
  }

  function isToday(d) {
    var n = new Date();
    return d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  function isThisMonth(d) {
    var n = new Date();
    return d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  }

  function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function mostRecentDate(list) {
    var max = null;
    list.forEach(function (d) {
      if (d.date && (!max || d.date > max)) max = d.date;
    });
    return max;
  }

  function sumField(list, key) {
    return list.reduce(function (s, d) { return s + (d[key] || 0); }, 0);
  }

  function recordMatchesRep(record, rep, userId) {
    if (window.CapMuseRepMatch) {
      return window.CapMuseRepMatch.recordMatchesRep(record, rep, userId, {});
    }
    var owner = record.package_owner || record['Package_Owner.name'] || '';
    var target = (rep && (rep.bookName || rep.name)) || userId || '';
    return owner && target && owner.toLowerCase() === target.toLowerCase();
  }

  function bestMonthLabel(deals) {
    var byMonth = {};
    deals.forEach(function (d) {
      if (!d.date) return;
      var mo = d.date.getMonth() + 1;
      var key = d.date.getFullYear() + '-' + (mo < 10 ? '0' + mo : mo);
      if (!byMonth[key]) byMonth[key] = 0;
      byMonth[key] += d.funding;
    });
    var best = null;
    var bestVol = 0;
    Object.keys(byMonth).forEach(function (k) {
      if (byMonth[k] > bestVol) { bestVol = byMonth[k]; best = k; }
    });
    if (!best) return null;
    var parts = best.split('-');
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
  }

  function avgTimeToFund(deals) {
    var days = [];
    deals.forEach(function (d) {
      if (!d.created || !d.date) return;
      var diff = (d.date.getTime() - d.created.getTime()) / 86400000;
      if (diff >= 0 && diff < 730) days.push(diff);
    });
    if (!days.length) return null;
    return Math.round((days.reduce(function (s, n) { return s + n; }, 0) / days.length) * 10) / 10;
  }

  function emptyToday() {
    return {
      leads: null, pulls: null, dealsOwned: null, funded: null,
      volume: null, commission: null, pipeline: null, calls: null
    };
  }

  function computeLive(userId, raw) {
    if (!window.REPS || !window.REPS[userId]) return null;
    var rep = window.REPS[userId];
    var deals = raw.filter(function (r) { return r.company || r.Deal_Name; }).map(mapRecord).filter(function (d) {
      return recordMatchesRep(d.raw, rep, userId);
    });

    if (!deals.length) {
      return {
        usedLatestDay: false,
        today: emptyToday(),
        stats: {
          experience: null, age: null, height: null,
          avgDeal: null, timeToFund: null, totalDeals: null,
          approvalRate: null, volume: null, activeClients: null
        },
        kpis: {
          bestMonth: null, largestDeal: null, avgCommission: null, retention: null
        },
        hero: { volumeToday: null, fundedToday: null, mtdVolume: null }
      };
    }

    var todayDeals = deals.filter(function (d) { return isToday(d.date); });
    var usedLatestDay = false;
    if (!todayDeals.length) {
      var latest = mostRecentDate(deals);
      if (latest) {
        todayDeals = deals.filter(function (d) { return sameDay(d.date, latest); });
        usedLatestDay = todayDeals.length > 0;
      }
    }

    var mtdDeals = deals.filter(function (d) { return isThisMonth(d.date); });
    var totalVol = sumField(deals, 'funding');
    var totalRev = sumField(deals, 'revenue');
    var totalDeals = deals.length;
    var avgDeal = totalVol / totalDeals;
    var largest = deals.reduce(function (m, d) { return d.funding > m ? d.funding : m; }, 0);
    var todayVol = sumField(todayDeals, 'funding');
    var todayRev = sumField(todayDeals, 'revenue');
    var timeToFund = avgTimeToFund(deals);

    return {
      usedLatestDay: usedLatestDay,
      today: {
        leads: null,
        pulls: null,
        dealsOwned: null,
        funded: todayDeals.length || null,
        volume: todayVol || null,
        commission: todayRev || null,
        pipeline: null,
        calls: null
      },
      stats: {
        experience: null,
        age: null,
        height: null,
        avgDeal: fmtMoney(avgDeal),
        timeToFund: timeToFund,
        totalDeals: totalDeals,
        approvalRate: null,
        volume: fmtMoney(totalVol),
        activeClients: null
      },
      kpis: {
        bestMonth: bestMonthLabel(deals),
        largestDeal: fmtMoney(largest),
        avgCommission: totalDeals && totalRev ? fmtMoney(totalRev / totalDeals) : null,
        retention: null
      },
      hero: {
        volumeToday: todayVol || null,
        fundedToday: todayDeals.length || null,
        mtdVolume: sumField(mtdDeals, 'funding') || null
      }
    };
  }

  function applyLive(userId, live) {
    if (!live || !window.REPS[userId]) return live;
    var rep = window.REPS[userId];
    rep.today = live.today;
    rep.stats = live.stats;
    rep.kpis = live.kpis;
    rep._liveData = true;

    window.dispatchEvent(new CustomEvent('capmuse:rep-stats-updated', {
      detail: { userId: userId, live: live }
    }));

    return live;
  }

  function applyForRep(userId) {
    if (!window.REPS || !window.REPS[userId]) return Promise.resolve(null);
    if (!window.CapMuseData) return Promise.resolve(null);

    return window.CapMuseData.getRawDeals().then(function (raw) {
      if (!raw || !raw.length) return null;
      var live = computeLive(userId, raw);
      return applyLive(userId, live);
    });
  }

  function refreshOpenProfilePanels(userId, live) {
    if (!live) return;

    var heroRow = document.getElementById('heroQuickStats');
    if (heroRow && document.body.classList.contains('home-page')) {
      var vals = heroRow.querySelectorAll('.hero-qs-val');
      var lbls = heroRow.querySelectorAll('.hero-qs-lbl');
      if (vals[0]) vals[0].textContent = fmtMoney(live.hero.volumeToday) || '';
      if (vals[1]) vals[1].textContent = live.hero.fundedToday != null ? String(live.hero.fundedToday) : '';
      if (vals[2]) vals[2].textContent = fmtMoney(live.hero.mtdVolume) || '';
      if (lbls[0]) lbls[0].textContent = live.usedLatestDay ? 'Volume (latest day)' : 'Volume today';
      if (lbls[1]) lbls[1].textContent = live.usedLatestDay ? 'Funded (latest day)' : 'Funded today';
      if (lbls[2]) lbls[2].textContent = 'MTD volume';
    }

    var perfGrid = document.getElementById('perfGrid');
    if (perfGrid && window.renderTodayPerfPanel) {
      window.renderTodayPerfPanel(perfGrid, userId, { animate: false });
    }

    var dateEl = document.getElementById('todayDate');
    if (dateEl && live.usedLatestDay) {
      dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
        ' · showing latest funded day (live book sync)';
    }
  }

  window.CapMuseRepStats = {
    computeLive: computeLive,
    applyLive: applyLive,
    applyForRep: applyForRep,
    refreshOpenProfilePanels: refreshOpenProfilePanels,
    fmtMoney: fmtMoney
  };
})();
