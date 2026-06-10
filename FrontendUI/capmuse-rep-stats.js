// Rep career + today stats from funding_book_live.json
(function () {
  'use strict';

  function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }

  function fmtMoney(v) {
    if (v == null || v === '') return '';
    let n = typeof v === 'number' ? v : nn(v);
    if (!n) return '';
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
    let n = new Date();
    return d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  function isThisMonth(d) {
    let n = new Date();
    return d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
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
    let puller = record.puller || record['Puller.name'] || '';
    let target = (rep && (rep.bookName || rep.name)) || userId || '';
    if (options.pullerOnly) {
      return puller && target && puller.toLowerCase() === target.toLowerCase();
    }
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

  function avgTimeToFund(deals) {
    let days = [];
    deals.forEach(function (d) {
      if (!d.created || !d.date) return;
      let diff = (d.date.getTime() - d.created.getTime()) / 86400000;
      if (diff >= 0 && diff < 730) days.push(diff);
    });
    if (!days.length) return null;
    return Math.round((days.reduce(function (s, n) { return s + n; }, 0) / days.length) * 10) / 10;
  }

  function emptyToday() {
    return {
      leads: null, pulls: null, dealsOwned: null, funded: 0,
      volume: 0, commission: null, pipeline: null, calls: null
    };
  }

  function computeLive(userId, raw) {
    if (!window.REPS || !window.REPS[userId]) return null;
    let rep = window.REPS[userId];
    let mapped = raw.filter(function (r) { return r.company || r.Deal_Name; }).map(mapRecord);
    let fundedDeals = mapped.filter(function (d) {
      return recordMatchesRep(d.raw, rep, userId, { fundedOnly: true });
    });
    let pulledDeals = mapped.filter(function (d) {
      return recordMatchesRep(d.raw, rep, userId, { pullerOnly: true });
    });
    let totalPulled = pulledDeals.length;

    if (!fundedDeals.length) {
      return {
        today: emptyToday(),
        stats: {
          experience: null, age: null, height: null,
          avgDeal: null, timeToFund: null, totalDeals: 0,
          totalPulled: totalPulled, volume: '$0', activeClients: null
        },
        kpis: {
          bestMonth: null, largestDeal: null, totalFunded: '$0', avgRevenue: null
        },
        hero: { volumeToday: 0, fundedToday: 0, mtdVolume: 0 }
      };
    }

    let todayDeals = fundedDeals.filter(function (d) { return isToday(d.date); });
    let mtdDeals = fundedDeals.filter(function (d) { return isThisMonth(d.date); });
    let totalVol = sumField(fundedDeals, 'funding');
    let totalRev = sumField(fundedDeals, 'revenue');
    let totalDeals = fundedDeals.length;
    let avgDeal = totalVol / totalDeals;
    let largest = fundedDeals.reduce(function (m, d) { return d.funding > m ? d.funding : m; }, 0);
    let todayVol = sumField(todayDeals, 'funding');
    let timeToFund = avgTimeToFund(fundedDeals);

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
        timeToFund: timeToFund,
        totalDeals: totalDeals,
        totalPulled: totalPulled,
        volume: fmtMoney(totalVol),
        activeClients: null
      },
      kpis: {
        bestMonth: bestMonthLabel(fundedDeals),
        largestDeal: fmtMoney(largest),
        totalFunded: fmtMoney(totalVol),
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

    return window.CapMuseData.getRawDeals().then(function (raw) {
      if (!raw || !raw.length) return null;
      let live = computeLive(userId, raw);
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
    fmtMoney: fmtMoney
  };
})();
