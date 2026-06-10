// CapMuse Stats Engine — live KPI panels for analytics (and legacy pages)

(function () {
  let DATA = [];
  let isAnalytics = document.body.classList.contains('analytics-page');
  let KPI_ACCENTS = ['#10B981', '#06B6D4', '#8B5CF6', '#F59E0B', '#EC4899', '#6366F1'];

  function load(records) {
    if (records && records.length) {
      DATA = records.filter(function (r) { return r.company; });
      buildStatCards();
      return;
    }
    let loader = window.CapMuseData ? window.CapMuseData.getRawDeals() : null;
    if (!loader) return;
    loader.then(function (raw) {
      if (!raw || !raw.length) return;
      DATA = raw.filter(function (r) { return r.company; });
      buildStatCards();
    });
  }

  function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }
  function fmt(v) { if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'; if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'; return '$' + Math.round(v).toLocaleString(); }

  function computeMetrics() {
    let totalFunding = 0, totalPayback = 0, totalRevenue = 0, totalDeals = DATA.length;
    let byRep = {}, byLender = {}, byState = {}, bySource = {}, byMonth = {}, byPosition = {}, byType = {};
    let usdCount = 0, cadCount = 0, usdVol = 0, cadVol = 0;
    let rates = [];

    DATA.forEach(function (d) {
      let funding = nn(d.funding || d.Funded_Amount);
      let payback = nn(d.payback || d.Payback_Amount);
      let rev = nn(d.revenue || d.Total_rev);
      let rate = nn(d.buy_rate || d.Buy_Rate);
      let rep = d.package_owner || d.puller || d['Owner.name'] || '';
      let lender = d.lender || d.Lender || '';
      let state = d.state || d.State || '';
      let source = d.lead_source || d.Lead_Source2 || '';
      let pos = d.position || d.Position || '';
      let type = d.deal_type || d.Deal_Type || '';
      let dateFunded = d.date_funded || d.Date_Funded || '';
      let currency = d.usd_cad || d.USD_CAD || '';

      totalFunding += funding;
      totalPayback += payback;
      totalRevenue += rev;
      if (rate > 0) rates.push(rate);

      if (rep) {
        if (!byRep[rep]) byRep[rep] = { name: rep, deals: 0, volume: 0, revenue: 0, rates: [] };
        byRep[rep].deals++;
        byRep[rep].volume += funding;
        byRep[rep].revenue += rev;
        if (rate > 0) byRep[rep].rates.push(rate);
      }
      if (lender) {
        if (!byLender[lender]) byLender[lender] = { name: lender, deals: 0, volume: 0, rates: [] };
        byLender[lender].deals++;
        byLender[lender].volume += funding;
        if (rate > 0) byLender[lender].rates.push(rate);
      }
      if (state) {
        if (!byState[state]) byState[state] = { name: state, deals: 0, volume: 0 };
        byState[state].deals++;
        byState[state].volume += funding;
      }
      if (source && source !== '0.0%') {
        if (!bySource[source]) bySource[source] = { name: source, deals: 0, volume: 0 };
        bySource[source].deals++;
        bySource[source].volume += funding;
      }
      if (dateFunded) {
        let month = dateFunded.substring(0, 7);
        if (!byMonth[month]) byMonth[month] = { month: month, deals: 0, volume: 0 };
        byMonth[month].deals++;
        byMonth[month].volume += funding;
      }
      if (pos) {
        let p = String(pos).replace(/[^0-9]/g, '') || 'Other';
        if (!byPosition[p]) byPosition[p] = { pos: p, deals: 0, volume: 0 };
        byPosition[p].deals++;
        byPosition[p].volume += funding;
      }
      if (type) {
        if (!byType[type]) byType[type] = { type: type, deals: 0, volume: 0 };
        byType[type].deals++;
        byType[type].volume += funding;
      }
      if (currency.toUpperCase().indexOf('CAD') > -1) { cadCount++; cadVol += funding; }
      else { usdCount++; usdVol += funding; }
    });

    return {
      totalFunding: totalFunding,
      totalPayback: totalPayback,
      totalRevenue: totalRevenue,
      totalDeals: totalDeals,
      avgRate: rates.length ? (rates.reduce(function (s, v) { return s + v; }, 0) / rates.length).toFixed(4) : '—',
      avgDeal: totalDeals ? fmt(totalFunding / totalDeals) : '—',
      usdCount: usdCount,
      cadCount: cadCount,
      usdVol: usdVol,
      cadVol: cadVol,
      repRank: Object.values(byRep).sort(function (a, b) { return b.volume - a.volume; }),
      lenderRank: Object.values(byLender).sort(function (a, b) { return b.volume - a.volume; }),
      stateRank: Object.values(byState).sort(function (a, b) { return b.volume - a.volume; }),
      sourceRank: Object.values(bySource).sort(function (a, b) { return b.deals - a.deals; }),
      monthRank: Object.values(byMonth).sort(function (a, b) { return a.month > b.month ? -1 : 1; }),
      posRank: Object.values(byPosition).sort(function (a, b) { return b.deals - a.deals; }),
      typeRank: Object.values(byType).sort(function (a, b) { return b.volume - a.volume; })
    };
  }

  function buildStatCards() {
    let statsContainer = document.getElementById('capmuseStats');
    if (!statsContainer) {
      let cardsCol = document.querySelector('.cards-col');
      if (!cardsCol) return;
      statsContainer = document.createElement('div');
      statsContainer.id = 'capmuseStats';
      let mainGrid = cardsCol.closest('.content-grid') || cardsCol.parentNode;
      statsContainer.style.gridColumn = '1 / -1';
      mainGrid.appendChild(statsContainer);
    }

    let m = computeMetrics();
    let kpis = [
      ['Total Funded', fmt(m.totalFunding), m.totalDeals + ' deals'],
      ['Total Payback', fmt(m.totalPayback), 'Avg Rate: ' + m.avgRate],
      ['Total Revenue', fmt(m.totalRevenue), 'Avg Deal: ' + m.avgDeal],
      ['USD vs CAD', m.usdCount + ' USD / ' + m.cadCount + ' CAD', fmt(m.usdVol) + ' / ' + fmt(m.cadVol)],
      ['New vs Renewal', (m.typeRank.find(function (t) { return t.type.toLowerCase().indexOf('new') > -1; }) || { deals: 0 }).deals + ' New', (m.typeRank.find(function (t) { return t.type.toLowerCase().indexOf('renew') > -1; }) || { deals: 0 }).deals + ' Renewal'],
      ['Positions', m.posRank.map(function (p) { return p.pos + 'st:' + p.deals; }).slice(0, 4).join(' | '), '']
    ];

    let kpiHTML = isAnalytics
      ? '<div class="analytics-kpi-grid">' + kpis.map(function (k, i) { return kpiCard(k[0], k[1], k[2], KPI_ACCENTS[i % KPI_ACCENTS.length]); }).join('') + '</div>'
      : '<div class="capmuse-stats" style="margin-top:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">' + kpis.map(function (k) { return kpiCard(k[0], k[1], k[2]); }).join('') + '</div>';

    statsContainer.innerHTML = kpiHTML;
    statsContainer.classList.remove('is-loading');
    statsContainer.classList.add('analytics-loaded');

    let tablesHTML = buildTablesHTML(m);
    requestAnimationFrame(function () {
      let wrap = document.createElement('div');
      wrap.className = isAnalytics ? 'analytics-tables' : 'capmuse-tables';
      if (!isAnalytics) wrap.style.cssText = 'margin-top:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px';
      wrap.innerHTML = tablesHTML;
      statsContainer.appendChild(wrap);
    });
  }

  function buildTablesHTML(m) {
    let h = '';
    h += tableCard('Rep Leaderboard', ['Rep', 'Deals', 'Volume', 'Avg Rate'], m.repRank.slice(0, 15).map(function (r) {
      let ar = r.rates.length ? (r.rates.reduce(function (s, v) { return s + v; }, 0) / r.rates.length).toFixed(3) : '—';
      return [r.name, r.deals, fmt(r.volume), ar];
    }));
    h += tableCard('Lender Breakdown', ['Lender', 'Deals', 'Volume', 'Avg Rate'], m.lenderRank.slice(0, 15).map(function (l) {
      let ar = l.rates.length ? (l.rates.reduce(function (s, v) { return s + v; }, 0) / l.rates.length).toFixed(3) : '—';
      return [l.name, l.deals, fmt(l.volume), ar];
    }));
    h += tableCard('Monthly Trend', ['Month', 'Deals', 'Volume'], m.monthRank.slice(0, 12).map(function (mo) {
      return [mo.month, mo.deals, fmt(mo.volume)];
    }));
    h += tableCard('By State', ['State', 'Deals', 'Volume'], m.stateRank.slice(0, 15).map(function (s) {
      return [s.name, s.deals, fmt(s.volume)];
    }));
    h += tableCard('Lead Sources', ['Source', 'Deals', 'Volume'], m.sourceRank.slice(0, 15).map(function (s) {
      return [s.name, s.deals, fmt(s.volume)];
    }));
    h += tableCard('By Position', ['Position', 'Deals', 'Volume'], m.posRank.map(function (p) {
      return [p.pos + (p.pos === '1' ? 'st' : p.pos === '2' ? 'nd' : p.pos === '3' ? 'rd' : 'th'), p.deals, fmt(p.volume)];
    }));
    h += tableCard('Deal Type', ['Type', 'Deals', 'Volume'], m.typeRank.map(function (t) {
      return [t.type, t.deals, fmt(t.volume)];
    }));
    h += tableCard('Revenue by Rep', ['Rep', 'Revenue', 'Deals', 'Rev/Deal'], m.repRank.filter(function (r) { return r.revenue > 0; }).slice(0, 15).map(function (r) {
      return [r.name, fmt(r.revenue), r.deals, fmt(r.deals ? r.revenue / r.deals : 0)];
    }));
    return h;
  }

  function kpiCard(title, value, sub, accent) {
    if (isAnalytics) {
      return '<div class="analytics-kpi" style="--kpi-accent:' + (accent || '#10B981') + '">' +
        '<div class="analytics-kpi-label">' + title + '</div>' +
        '<div class="analytics-kpi-value">' + value + '</div>' +
        (sub ? '<div class="analytics-kpi-sub">' + sub + '</div>' : '') +
        '</div>';
    }
    return '<div style="background:var(--surface,#fff);border:1px solid var(--border,#e8e8e8);border-radius:12px;padding:16px 20px">' +
      '<div style="font-size:11px;font-weight:600;color:var(--text-muted,#999);text-transform:uppercase;letter-spacing:0.05em">' + title + '</div>' +
      '<div style="font-size:22px;font-weight:700;color:var(--text-primary,#111);margin-top:4px">' + value + '</div>' +
      (sub ? '<div style="font-size:12px;color:var(--text-secondary,#555);margin-top:2px">' + sub + '</div>' : '') +
      '</div>';
  }

  function tableCard(title, headers, rows) {
    if (isAnalytics) {
      let h = '<div class="analytics-table-card">';
      h += '<div class="analytics-table-head">' + title + '</div>';
      h += '<div class="analytics-table-scroll"><table class="analytics-table">';
      h += '<thead><tr>';
      headers.forEach(function (col) { h += '<th>' + col + '</th>'; });
      h += '</tr></thead><tbody>';
      rows.forEach(function (row) {
        h += '<tr>';
        row.forEach(function (cell, j) {
          h += '<td class="' + (j >= 2 ? 'num' : '') + (j === 0 ? ' primary' : '') + '">' + cell + '</td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table></div></div>';
      return h;
    }
    let leg = '<div style="background:var(--surface,#fff);border:1px solid var(--border,#e8e8e8);border-radius:12px;overflow:hidden">';
    leg += '<div style="padding:12px 16px;font-size:13px;font-weight:700;color:var(--text-primary,#111);border-bottom:1px solid var(--border,#e8e8e8)">' + title + '</div>';
    leg += '<div style="max-height:300px;overflow-y:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    leg += '<thead><tr style="background:var(--table-head,#f8f8f8)">';
    headers.forEach(function (col) { leg += '<th style="padding:6px 10px;text-align:left;font-weight:600;color:var(--text-muted,#999);font-size:10px;text-transform:uppercase;letter-spacing:0.04em">' + col + '</th>'; });
    leg += '</tr></thead><tbody>';
    rows.forEach(function (row) {
      leg += '<tr style="border-bottom:1px solid var(--table-border,#eee)">';
      row.forEach(function (cell, j) {
        let align = j >= 2 ? 'right' : 'left';
        let weight = j === 0 ? '600' : '400';
        leg += '<td style="padding:7px 10px;text-align:' + align + ';font-weight:' + weight + ';color:var(--text-' + (j === 0 ? 'primary' : 'secondary') + ',#333)">' + cell + '</td>';
      });
      leg += '</tr>';
    });
    leg += '</tbody></table></div></div>';
    return leg;
  }

  window.CapMuseStats = {
    refresh: function () {
      if (DATA.length) buildStatCards();
      else load();
    },
    setData: function (records) {
      load(records);
    }
  };

  window.addEventListener('capmuse:deals-updated', function (e) {
    if (e.detail && e.detail.length) {
      DATA = e.detail.filter(function (r) { return r.company; });
      buildStatCards();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { load(); });
  } else {
    load();
  }
})();
