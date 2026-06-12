// Landing page — company MTD new-deal funding vs $6M monthly goal
(function () {
  'use strict';

  if (!document.getElementById('dashTrendingCard')) return;

  let MONTHLY_GOAL = 6000000;

  function normStr(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim()
      .toLowerCase();
  }

  function nn(v) {
    let n = parseFloat(String(v || '').replace(/[$,]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function parseDate(raw) {
    if (!raw) return null;
    let str = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      let d = new Date(str + 'T12:00:00');
      return isNaN(d.getTime()) ? null : d;
    }
    let d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function fundedDateKey(raw, parsedDate) {
    let m = String(raw || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    if (!parsedDate) return '';
    return parsedDate.getFullYear() + '-' +
      String(parsedDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(parsedDate.getDate()).padStart(2, '0');
  }

  function monthKeyFromDateKey(dateKey) {
    if (!dateKey || dateKey.length < 7) return '';
    return dateKey.slice(0, 7);
  }

  function currentMonthKey() {
    let now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  function isNewDealRecord(r) {
    let dt = normStr(r.deal_type || r.Deal_Type || '');
    if (dt.indexOf('renewal') === 0) return false;

    let pos = String(r.position || r.Position || '').trim();
    if (pos && pos !== '0' && pos !== '1') return false;

    if (dt === 'new deal' || dt === 'new') return true;
    if (!dt && (!pos || pos === '0' || pos === '1')) return true;

    return false;
  }

  function mapDeal(r) {
    if (!r || (!r.company && !r.Deal_Name)) return null;
    if (!isNewDealRecord(r)) return null;

    let dateFundedRaw = (r.date_funded || r.Date_Funded || '').trim();
    let date = parseDate(dateFundedRaw);
    let funding = nn(r.funding || r.Funded_Amount);
    if (funding <= 0) return null;

    return {
      funding: funding,
      dateKey: fundedDateKey(dateFundedRaw, date)
    };
  }

  function mtdNewDealVolume(deals) {
    let cur = currentMonthKey();
    let total = 0;
    deals.forEach(function (d) {
      if (monthKeyFromDateKey(d.dateKey) === cur) total += d.funding;
    });
    return total;
  }

  function fmtMoneyShort(n) {
    if (n >= 1000000) {
      let m = n / 1000000;
      return '$' + (m >= 10 ? m.toFixed(1) : m.toFixed(2)).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') + 'M';
    }
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function paceLabel(mtd, goal) {
    let now = new Date();
    let day = now.getDate();
    let daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let elapsedPct = day / daysInMonth;
    let fundedPct = goal > 0 ? mtd / goal : 0;

    if (fundedPct >= 1) return 'Goal reached — keep the momentum going';
    if (fundedPct >= elapsedPct * 1.05) return 'Ahead of pace this month';
    if (fundedPct >= elapsedPct * 0.85) return 'On track for the monthly goal';
    return fmtMoneyShort(Math.max(0, goal - mtd)) + ' to hit goal';
  }

  function render(mtd) {
    let goal = MONTHLY_GOAL;
    let pct = goal > 0 ? Math.min(100, (mtd / goal) * 100) : 0;

    let mtdEl = document.getElementById('dashTrendingMtd');
    let pctEl = document.getElementById('dashTrendingPct');
    let goalEl = document.getElementById('dashTrendingGoal');
    let barEl = document.getElementById('dashTrendingBar');
    let paceEl = document.getElementById('dashTrendingPace');
    let subEl = document.getElementById('dashTrendingSub');

    if (!mtdEl || !pctEl || !goalEl || !barEl || !paceEl) return;

    mtdEl.textContent = fmtMoneyShort(mtd);
    pctEl.textContent = Math.round(pct) + '%';
    goalEl.textContent = fmtMoneyShort(goal) + ' goal';
    barEl.style.width = pct + '%';
    paceEl.textContent = paceLabel(mtd, goal);

    if (subEl) {
      subEl.textContent = 'New deals funded vs. monthly goal';
    }
  }

  function renderError() {
    let mtdEl = document.getElementById('dashTrendingMtd');
    let paceEl = document.getElementById('dashTrendingPace');
    if (mtdEl) mtdEl.textContent = '$0';
    if (paceEl) paceEl.textContent = 'Could not load funding data';
    render(0);
  }

  function loadAndRender() {
    if (!window.CapMuseData || !window.CapMuseData.getRawDeals) {
      renderError();
      return;
    }

    window.CapMuseData.getRawDeals()
      .then(function (raw) {
        let deals = (raw || []).map(mapDeal).filter(Boolean);
        render(mtdNewDealVolume(deals));
      })
      .catch(function (err) {
        console.warn('[Dashboard Trending]', err);
        renderError();
      });
  }

  function init() {
    loadAndRender();
    window.addEventListener('capmuse:deals-updated', loadAndRender);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
