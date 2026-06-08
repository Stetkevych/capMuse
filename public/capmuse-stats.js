// CapMuse Stats Engine - adds tabularized metric views to all nav items
// This file supplements capmuse-engine.js with rich stat cards

(function(){
  var BUCKET = 'https://capmuse-data-882611632216.s3.amazonaws.com';
  var DATA = [];

  function load() {
    fetch(BUCKET + '/funding_book_live.json')
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(records){
        if (!records || !records.length) return;
        DATA = records.filter(function(r){ return r.company; });
        buildStatCards();
      });
  }

  function nn(v){ return parseFloat(String(v||'').replace(/[$,]/g,''))||0; }
  function fmt(v){ if(v>=1e6)return'$'+(v/1e6).toFixed(1)+'M'; if(v>=1e3)return'$'+(v/1e3).toFixed(0)+'K'; return'$'+Math.round(v).toLocaleString(); }
  function pct(a,b){ return b?Math.round(a/b*100)+'%':'0%'; }

  function buildStatCards() {
    var totalFunding = 0, totalPayback = 0, totalRevenue = 0, totalDeals = DATA.length;
    var byRep = {}, byLender = {}, byState = {}, bySource = {}, byMonth = {}, byPosition = {}, byType = {};
    var usdCount = 0, cadCount = 0, usdVol = 0, cadVol = 0;
    var rates = [], terms = [];

    DATA.forEach(function(d){
      var funding = nn(d.funding || d.Funded_Amount);
      var payback = nn(d.payback || d.Payback_Amount);
      var rev = nn(d.revenue || d.Total_rev);
      var rate = nn(d.buy_rate || d.Buy_Rate);
      var rep = d.package_owner || d.puller || d['Owner.name'] || '';
      var lender = d.lender || d.Lender || '';
      var state = d.state || d.State || '';
      var source = d.lead_source || d.Lead_Source2 || '';
      var pos = d.position || d.Position || '';
      var type = d.deal_type || d.Deal_Type || '';
      var dateFunded = d.date_funded || d.Date_Funded || '';
      var currency = d.usd_cad || d.USD_CAD || '';

      totalFunding += funding;
      totalPayback += payback;
      totalRevenue += rev;
      if (rate > 0) rates.push(rate);
      if (d.term || d.Term) terms.push(d.term || d.Term);

      // By rep
      if (rep) {
        if (!byRep[rep]) byRep[rep] = {name:rep, deals:0, volume:0, revenue:0, rates:[]};
        byRep[rep].deals++;
        byRep[rep].volume += funding;
        byRep[rep].revenue += rev;
        if (rate > 0) byRep[rep].rates.push(rate);
      }

      // By lender
      if (lender) {
        if (!byLender[lender]) byLender[lender] = {name:lender, deals:0, volume:0, rates:[]};
        byLender[lender].deals++;
        byLender[lender].volume += funding;
        if (rate > 0) byLender[lender].rates.push(rate);
      }

      // By state
      if (state) {
        if (!byState[state]) byState[state] = {name:state, deals:0, volume:0};
        byState[state].deals++;
        byState[state].volume += funding;
      }

      // By source
      if (source && source !== '0.0%') {
        if (!bySource[source]) bySource[source] = {name:source, deals:0, volume:0};
        bySource[source].deals++;
        bySource[source].volume += funding;
      }

      // By month
      if (dateFunded) {
        var month = dateFunded.substring(0,7);
        if (!byMonth[month]) byMonth[month] = {month:month, deals:0, volume:0};
        byMonth[month].deals++;
        byMonth[month].volume += funding;
      }

      // By position
      if (pos) {
        var p = String(pos).replace(/[^0-9]/g,'') || 'Other';
        if (!byPosition[p]) byPosition[p] = {pos:p, deals:0, volume:0};
        byPosition[p].deals++;
        byPosition[p].volume += funding;
      }

      // By deal type
      if (type) {
        if (!byType[type]) byType[type] = {type:type, deals:0, volume:0};
        byType[type].deals++;
        byType[type].volume += funding;
      }

      // USD vs CAD
      if (currency.toUpperCase().indexOf('CAD') > -1) { cadCount++; cadVol += funding; }
      else { usdCount++; usdVol += funding; }
    });

    var avgRate = rates.length ? (rates.reduce(function(s,v){return s+v;},0)/rates.length).toFixed(4) : '—';
    var avgDeal = totalDeals ? fmt(totalFunding / totalDeals) : '—';

    // Sort rankings
    var repRank = Object.values(byRep).sort(function(a,b){return b.volume-a.volume;});
    var lenderRank = Object.values(byLender).sort(function(a,b){return b.volume-a.volume;});
    var stateRank = Object.values(byState).sort(function(a,b){return b.volume-a.volume;});
    var sourceRank = Object.values(bySource).sort(function(a,b){return b.deals-a.deals;});
    var monthRank = Object.values(byMonth).sort(function(a,b){return a.month>b.month?-1:1;});
    var posRank = Object.values(byPosition).sort(function(a,b){return b.deals-a.deals;});
    var typeRank = Object.values(byType).sort(function(a,b){return b.volume-a.volume;});

    // Inject stats into the stat cards area if it exists
    var cardsCol = document.querySelector('.cards-col');
    if (!cardsCol) return;

    // Build a stats summary section below the existing cards
    var statsHTML = '<div class="capmuse-stats" style="margin-top:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">';

    // KPI summary row
    statsHTML += kpiCard('Total Funded', fmt(totalFunding), totalDeals + ' deals');
    statsHTML += kpiCard('Total Payback', fmt(totalPayback), 'Avg Rate: ' + avgRate);
    statsHTML += kpiCard('Total Revenue', fmt(totalRevenue), 'Avg Deal: ' + avgDeal);
    statsHTML += kpiCard('USD vs CAD', usdCount + ' USD / ' + cadCount + ' CAD', fmt(usdVol) + ' / ' + fmt(cadVol));
    statsHTML += kpiCard('New vs Renewal', (typeRank.find(function(t){return t.type.toLowerCase().indexOf('new')>-1;})||{deals:0}).deals + ' New', (typeRank.find(function(t){return t.type.toLowerCase().indexOf('renew')>-1;})||{deals:0}).deals + ' Renewal');
    statsHTML += kpiCard('Positions', posRank.map(function(p){return p.pos+'st:'+p.deals;}).slice(0,4).join(' | '), '');

    statsHTML += '</div>';

    // Tables section
    statsHTML += '<div class="capmuse-tables" style="margin-top:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px">';

    // Rep leaderboard
    statsHTML += tableCard('Rep Leaderboard', ['Rep','Deals','Volume','Avg Rate'], repRank.slice(0,15).map(function(r){
      var ar = r.rates.length ? (r.rates.reduce(function(s,v){return s+v;},0)/r.rates.length).toFixed(3) : '—';
      return [r.name, r.deals, fmt(r.volume), ar];
    }));

    // Lender breakdown
    statsHTML += tableCard('Lender Breakdown', ['Lender','Deals','Volume','Avg Rate'], lenderRank.slice(0,15).map(function(l){
      var ar = l.rates.length ? (l.rates.reduce(function(s,v){return s+v;},0)/l.rates.length).toFixed(3) : '—';
      return [l.name, l.deals, fmt(l.volume), ar];
    }));

    // Monthly trend
    statsHTML += tableCard('Monthly Trend', ['Month','Deals','Volume'], monthRank.slice(0,12).map(function(m){
      return [m.month, m.deals, fmt(m.volume)];
    }));

    // State breakdown
    statsHTML += tableCard('By State', ['State','Deals','Volume'], stateRank.slice(0,15).map(function(s){
      return [s.name, s.deals, fmt(s.volume)];
    }));

    // Lead source
    statsHTML += tableCard('Lead Sources', ['Source','Deals','Volume'], sourceRank.slice(0,15).map(function(s){
      return [s.name, s.deals, fmt(s.volume)];
    }));

    // Position breakdown
    statsHTML += tableCard('By Position', ['Position','Deals','Volume'], posRank.map(function(p){
      return [p.pos + (p.pos==='1'?'st':p.pos==='2'?'nd':p.pos==='3'?'rd':'th'), p.deals, fmt(p.volume)];
    }));

    // Deal type
    statsHTML += tableCard('Deal Type', ['Type','Deals','Volume'], typeRank.map(function(t){
      return [t.type, t.deals, fmt(t.volume)];
    }));

    // Revenue by rep
    statsHTML += tableCard('Revenue by Rep', ['Rep','Revenue','Deals','Rev/Deal'], repRank.filter(function(r){return r.revenue>0;}).slice(0,15).map(function(r){
      return [r.name, fmt(r.revenue), r.deals, fmt(r.deals?r.revenue/r.deals:0)];
    }));

    statsHTML += '</div>';

    // Append after the cards column
    var statsContainer = document.getElementById('capmuseStats');
    if (statsContainer) {
      statsContainer.innerHTML = statsHTML;
    } else {
      var div = document.createElement('div');
      div.id = 'capmuseStats';
      div.innerHTML = statsHTML;
      cardsCol.parentNode.insertBefore(div, cardsCol.nextSibling);
    }
  }

  function kpiCard(title, value, sub) {
    return '<div style="background:var(--surface,#fff);border:1px solid var(--border,#e8e8e8);border-radius:12px;padding:16px 20px">' +
      '<div style="font-size:11px;font-weight:600;color:var(--text-muted,#999);text-transform:uppercase;letter-spacing:0.05em">' + title + '</div>' +
      '<div style="font-size:22px;font-weight:700;color:var(--text-primary,#111);margin-top:4px">' + value + '</div>' +
      (sub ? '<div style="font-size:12px;color:var(--text-secondary,#555);margin-top:2px">' + sub + '</div>' : '') +
      '</div>';
  }

  function tableCard(title, headers, rows) {
    var h = '<div style="background:var(--surface,#fff);border:1px solid var(--border,#e8e8e8);border-radius:12px;overflow:hidden">';
    h += '<div style="padding:12px 16px;font-size:13px;font-weight:700;color:var(--text-primary,#111);border-bottom:1px solid var(--border,#e8e8e8)">' + title + '</div>';
    h += '<div style="max-height:300px;overflow-y:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    h += '<thead><tr style="background:var(--table-head,#f8f8f8)">';
    headers.forEach(function(col){ h += '<th style="padding:6px 10px;text-align:left;font-weight:600;color:var(--text-muted,#999);font-size:10px;text-transform:uppercase;letter-spacing:0.04em">' + col + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function(row, i){
      h += '<tr style="border-bottom:1px solid var(--table-border,#eee)">';
      row.forEach(function(cell, j){
        var align = j >= 2 ? 'right' : 'left';
        var weight = j === 0 ? '600' : '400';
        h += '<td style="padding:7px 10px;text-align:'+align+';font-weight:'+weight+';color:var(--text-'+(j===0?'primary':'secondary')+',#333)">' + cell + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  // Load when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
