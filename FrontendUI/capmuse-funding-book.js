// Funding Book — live CRM metrics from funding_book_live.json
(function () {
  if (!document.body.classList.contains('funding-book-page')) return;

  var DEALS = [];
  var REP_PHOTOS = {
    anderson: 'Assets/reps/anderson.png',
    matthew: 'Assets/reps/matthew.png',
    frank: 'Assets/reps/frank.png',
    blake: 'Assets/reps/blake.png',
    ivan: 'Assets/reps/ivan.png',
    colin: 'Assets/reps/colin.png',
    gabriel: 'Assets/reps/gabriel.png',
    dominic: 'Assets/reps/dominic.png',
    cipriani: 'Assets/reps/Cartoon/cipriani.png',
    kip: 'Assets/reps/kip.png',
    santi: 'Assets/reps/santi.png',
    rondon: 'Assets/reps/rondon.png',
    rio: 'Assets/reps/rio.png',
    juan: 'Assets/reps/juan.png',
    pina: 'Assets/reps/pina.png',
    ray: 'Assets/reps/ray.png'
  };

  function nn(v) { return parseFloat(String(v || '').replace(/[$,]/g, '')) || 0; }
  function fmt(v) {
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(v).toLocaleString();
  }
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function parseDate(s) {
    if (!s) return null;
    var d = new Date(s.length === 10 ? s + 'T12:00:00' : s);
    return isNaN(d.getTime()) ? null : d;
  }
  function formatDate(s) {
    var d = parseDate(s);
    if (!d) return s || '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function firstName(name) {
    return (name || '').split(' ')[0] || name || '—';
  }
  function repPersonId(name) {
    var n = (name || '').toLowerCase();
    var keys = Object.keys(REP_PHOTOS);
    for (var i = 0; i < keys.length; i++) {
      if (n.indexOf(keys[i]) > -1) return keys[i];
    }
    return null;
  }
  function mapRecord(r) {
    return {
      company: r.company || r.Deal_Name || '',
      funding: nn(r.funding || r.Funded_Amount),
      dateFunded: r.date_funded || r.Date_Funded || '',
      lender: r.lender || r.Lender || '',
      rep: r.package_owner || r.puller || r['Owner.name'] || '',
      rate: r.buy_rate || r.Buy_Rate || '',
      industry: r.industry || r.Industry || '',
      state: r.state || r.State || '',
      position: r.position || r.Position || '',
      date: parseDate(r.date_funded || r.Date_Funded || '')
    };
  }
  function isToday(d) {
    var n = new Date();
    return d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }
  function isThisWeek(d) {
    if (!d) return false;
    var n = new Date();
    var start = new Date(n.getFullYear(), n.getMonth(), n.getDate() - n.getDay());
    return d >= start;
  }
  function isThisMonth(d) {
    var n = new Date();
    return d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  }
  function isYtd(d) {
    return d && d.getFullYear() === new Date().getFullYear();
  }
  function isQ2(d) {
    return d && d.getFullYear() === new Date().getFullYear() && d.getMonth() >= 3 && d.getMonth() <= 5;
  }
  function sameDay(a, b) {
    return a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }
  function mostRecentDate(list) {
    var max = null;
    list.forEach(function (d) {
      if (d.date && (!max || d.date > max)) max = d.date;
    });
    return max;
  }
  function dealsOnDay(list, day) {
    if (!day) return [];
    return list.filter(function (d) { return sameDay(d.date, day); });
  }
  function shortDayLabel(d) {
    if (!d) return 'today';
    if (isToday(d)) return 'today';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function sumFunding(list) {
    return list.reduce(function (s, d) { return s + d.funding; }, 0);
  }

  function topRep(list) {
    var by = {};
    list.forEach(function (d) {
      if (!d.rep) return;
      if (!by[d.rep]) by[d.rep] = 0;
      by[d.rep] += d.funding;
    });
    var entries = Object.keys(by).map(function (k) { return { name: k, volume: by[k] }; });
    entries.sort(function (a, b) { return b.volume - a.volume; });
    return entries[0] || null;
  }

  function topLender(list) {
    var by = {};
    list.forEach(function (d) {
      if (!d.lender) return;
      if (!by[d.lender]) by[d.lender] = 0;
      by[d.lender] += d.funding;
    });
    var entries = Object.keys(by).map(function (k) { return { name: k, volume: by[k] }; });
    entries.sort(function (a, b) { return b.volume - a.volume; });
    return entries[0] || null;
  }

  function lenderRank(list) {
    var by = {};
    list.forEach(function (d) {
      if (!d.lender) return;
      if (!by[d.lender]) by[d.lender] = { name: d.lender, volume: 0 };
      by[d.lender].volume += d.funding;
    });
    return Object.values(by).sort(function (a, b) { return b.volume - a.volume; });
  }

  function topCompany(list) {
    var by = {};
    list.forEach(function (d) {
      if (!d.company) return;
      by[d.company] = (by[d.company] || 0) + 1;
    });
    var entries = Object.keys(by).map(function (k) { return { name: k, count: by[k] }; });
    entries.sort(function (a, b) { return b.count - a.count; });
    return entries[0] || null;
  }

  function setKpis() {
    var ytd = DEALS.filter(function (d) { return isYtd(d.date); });
    var mtd = DEALS.filter(function (d) { return isThisMonth(d.date); });
    var totalVol = sumFunding(DEALS);
    var values = document.querySelectorAll('.kpi-strip .kpi-value');
    if (values[0]) values[0].textContent = fmt(sumFunding(ytd));
    if (values[1]) values[1].textContent = fmt(sumFunding(mtd));
    if (values[2]) values[2].textContent = DEALS.length.toLocaleString();
    if (values[3]) values[3].textContent = DEALS.length ? fmt(totalVol / DEALS.length) : '—';
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function updateRepCard(card, rep, volume) {
    if (!card || !rep) return;
    var pid = repPersonId(rep);
    if (pid) card.setAttribute('data-person-id', pid);
    setText(card.querySelector('.card-name'), firstName(rep));
    setText(card.querySelector('.card-big-single'), fmt(volume));
    var img = card.querySelector('.card-rep-photo');
    if (img && pid && REP_PHOTOS[pid]) {
      img.src = REP_PHOTOS[pid];
      img.alt = firstName(rep);
    }
  }

  function updateLenderCard(card, lender, volume) {
    if (!card || !lender) return;
    setText(card.querySelector('.card-name'), lender);
    setText(card.querySelector('.card-big-single'), fmt(volume));
  }

  function renderLeaderboard() {
    var rank = {};
    DEALS.forEach(function (d) {
      if (!d.rep) return;
      if (!rank[d.rep]) rank[d.rep] = { name: d.rep, volume: 0 };
      rank[d.rep].volume += d.funding;
    });
    var sorted = Object.values(rank).sort(function (a, b) { return b.volume - a.volume; }).slice(0, 8);
    if (!sorted.length) return;

    var hero = document.querySelector('.rep-hero');
    if (hero) {
      var top = sorted[0];
      var pid = repPersonId(top.name);
      if (pid) hero.setAttribute('data-person-id', pid);
      setText(hero.querySelector('.rep-hero-name'), firstName(top.name));
      setText(hero.querySelector('.rep-hero-amount'), fmt(top.volume));
      var img = hero.querySelector('.rep-photo');
      if (img && pid && REP_PHOTOS[pid]) {
        img.src = REP_PHOTOS[pid];
        img.alt = firstName(top.name);
      }
    }

    var grid = document.querySelector('.rep-grid');
    if (!grid) return;
    var medals = ['r-gold', 'r-silver', 'r-bronze'];
    var icons = ['🥇', '🥈', '🥉'];
    grid.innerHTML = sorted.map(function (r, i) {
      var pid = repPersonId(r.name);
      var cls = i < 3 ? 'rep-row ' + medals[i] : 'rep-row';
      var pos = i < 3
        ? '<span class="rep-pos medal">' + icons[i] + '</span>'
        : '<span class="rep-pos num">' + (i + 1) + '</span>';
      return '<div class="' + cls + '"' + (pid ? ' data-person-id="' + pid + '"' : '') + '>' +
        pos + '<span class="rep-name">' + esc(r.name) + '</span><span class="rep-amt">' + fmt(r.volume) + '</span></div>';
    }).join('');
  }

  function renderStatCards() {
    var cards = document.querySelectorAll('#statCards > .stat-card');
    var todayDeals = DEALS.filter(function (d) { return isToday(d.date); });
    var todayDay = new Date();
    if (!todayDeals.length) {
      var latest = mostRecentDate(DEALS);
      if (latest) {
        todayDeals = dealsOnDay(DEALS, latest);
        todayDay = latest;
      }
    }
    var week = DEALS.filter(function (d) { return isThisWeek(d.date); });
    var month = DEALS.filter(function (d) { return isThisMonth(d.date); });

    var repToday = topRep(todayDeals);
    var repWeek = topRep(week);
    var repMonth = topRep(month);
    if (cards[1]) {
      var headline = cards[1].querySelector('.card-headline');
      if (headline) {
        headline.innerHTML = isToday(todayDay)
          ? 'Most funded<br />today:'
          : 'Most funded<br />' + shortDayLabel(todayDay) + ':';
      }
      if (repToday) updateRepCard(cards[1], repToday.name, repToday.volume);
      else setText(cards[1].querySelector('.card-big-single'), '—');
    }
    if (cards[2] && repWeek) updateRepCard(cards[2], repWeek.name, repWeek.volume);
    if (cards[3] && repMonth) updateRepCard(cards[3], repMonth.name, repMonth.volume);

    var company = topCompany(DEALS);
    if (cards[4] && company) {
      setText(cards[4].querySelector('.card-name'), company.name.length > 28 ? company.name.substring(0, 28) + '…' : company.name);
      setText(cards[4].querySelector('.card-big-single'), company.count + ' deals');
    }

    var lenderAll = topLender(DEALS);
    var lenderMonth = topLender(month);
    var lenderWeek = topLender(week);
    if (cards[5] && lenderAll) updateLenderCard(cards[5], lenderAll.name, lenderAll.volume);
    if (cards[6] && lenderMonth) updateLenderCard(cards[6], lenderMonth.name, lenderMonth.volume);
    if (cards[7] && lenderWeek) updateLenderCard(cards[7], lenderWeek.name, lenderWeek.volume);
  }

  function renderLenderBars() {
    var ytd = DEALS.filter(function (d) { return isYtd(d.date); });
    var rank = lenderRank(ytd.length ? ytd : DEALS).slice(0, 6);
    var total = sumFunding(ytd.length ? ytd : DEALS);
    var container = document.querySelector('.lender-bars');
    if (!container || !rank.length) return;
    var max = rank[0].volume || 1;
    var gradients = [
      'linear-gradient(90deg,#2563EB,#34D399)',
      'linear-gradient(90deg,#0F4C81,#2563EB)',
      'linear-gradient(90deg,#10B981,#0F4C81)',
      'linear-gradient(90deg,#F59E0B,#EF4444)',
      'linear-gradient(90deg,#8B5CF6,#2563EB)',
      'linear-gradient(90deg,#6366F1,#8B5CF6)'
    ];
    container.innerHTML = rank.map(function (l, i) {
      var width = Math.max(8, Math.round(l.volume / max * 100));
      var pct = total ? Math.round(l.volume / total * 100) : 0;
      return '<div class="lender-bar-row">' +
        '<span class="lender-bar-name">' + esc(l.name) + '</span>' +
        '<div class="lender-bar-track"><div class="lender-bar-fill" style="width:' + width + '%;background:' + gradients[i % gradients.length] + '"></div></div>' +
        '<span class="lender-bar-amt">' + fmt(l.volume) + '</span>' +
        '<span class="lender-bar-pct">' + pct + '%</span></div>';
    }).join('');
  }

  function positionChip(pos) {
    var p = String(pos || '').replace(/[^0-9]/g, '');
    if (!p) return { cls: 'chip-gray', label: '—' };
    var suffix = p === '1' ? 'st' : p === '2' ? 'nd' : p === '3' ? 'rd' : 'th';
    var cls = p === '1' ? 'chip-green' : p === '2' ? 'chip-amber' : 'chip-gray';
    return { cls: cls, label: p + suffix };
  }

  function renderTable() {
    var tbody = document.querySelector('.data-table tbody');
    if (!tbody) return;
    var rows = DEALS.slice().sort(function (a, b) {
      var da = a.date ? a.date.getTime() : 0;
      var db = b.date ? b.date.getTime() : 0;
      return db - da;
    }).slice(0, 75);
    tbody.innerHTML = rows.map(function (d, i) {
      var ini = esc((d.company || '??').substring(0, 2).toUpperCase());
      var chip = positionChip(d.position);
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><div class="biz-cell"><div class="biz-dot" style="background:linear-gradient(135deg,#2563EB,#34D399)">' + ini + '</div>' +
        '<span class="biz-cell-name">' + esc(d.company) + '</span></div></td>' +
        '<td><span class="amount-cell">' + fmt(d.funding) + '</span></td>' +
        '<td>' + formatDate(d.dateFunded) + '</td>' +
        '<td>' + esc(d.lender) + '</td>' +
        '<td>' + esc(firstName(d.rep)) + '</td>' +
        '<td><span class="factor-rate">' + esc(d.rate || '—') + '</span></td>' +
        '<td>' + esc(d.industry) + '</td>' +
        '<td>' + esc(d.state) + '</td>' +
        '<td><span class="status-chip ' + chip.cls + '">' + chip.label + '</span></td>' +
        '</tr>';
    }).join('');
  }

  function renderTabCounts() {
    var tabs = document.querySelectorAll('.tab-bar .tab');
    var counts = [
      DEALS.length,
      DEALS.filter(function (d) { return isThisMonth(d.date); }).length,
      DEALS.filter(function (d) { return isQ2(d.date); }).length,
      DEALS.filter(function (d) { return d.date && d.date.getFullYear() === new Date().getFullYear(); }).length
    ];
    tabs.forEach(function (tab, i) {
      var el = tab.querySelector('.tab-count');
      if (el && counts[i] !== undefined) el.textContent = counts[i].toLocaleString();
    });
  }

  function renderTicker() {
    var ytd = sumFunding(DEALS.filter(function (d) { return isYtd(d.date); }));
    var msg = document.querySelector('.ticker-msg');
    if (msg) {
      msg.textContent = 'YTD ' + fmt(ytd) + ' funded · ' + DEALS.length.toLocaleString() + ' deals · Live from Zoho';
    }
  }

  function render() {
    setKpis();
    renderLeaderboard();
    renderStatCards();
    renderLenderBars();
    renderTable();
    renderTabCounts();
    renderTicker();
  }

  function load(raw) {
    if (!raw || !raw.length) return;
    DEALS = raw.filter(function (r) { return r.company || r.Deal_Name; }).map(mapRecord);
    render();
  }

  function init() {
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
