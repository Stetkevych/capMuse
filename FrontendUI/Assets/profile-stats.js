/* ═══════════════════════════════════════════════════════════════
   profile-stats.js — Global Profile Stats Card System
   Single source of truth for all rep data and modal logic.
   Include this script on every CapMuse page.
   Trigger: add  data-person-id="<key>"  to any clickable element.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     REP DATA — add / update reps here only
  ═══════════════════════════════════════════════════════════════ */
  var REPS = {
    anderson: {
      name: 'Anderson',
      role: 'Senior Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Top Performer',
      photo: 'Assets/reps/anderson.png',
      stats: { experience: 11, age: 30, height: "6'2\"", avgDeal: 85, timeToFund: 3.4, totalDeals: 427, volume: 34.8, approvalRate: 82, activeClients: 127 },
      kpis:  { bestMonth: 'March 2024', largestDeal: '$8.1M', avgCommission: '$4,200', retention: '91%' }
    },
    matthew: {
      name: 'Matthew',
      role: 'Senior Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Top Closer',
      photo: 'Assets/reps/matthew.png',
      stats: { experience: 8, age: 32, height: "5'11\"", avgDeal: 78, timeToFund: 4.1, totalDeals: 312, volume: 24.3, approvalRate: 78, activeClients: 98 },
      kpis:  { bestMonth: 'June 2024', largestDeal: '$5.4M', avgCommission: '$3,800', retention: '88%' }
    },
    ivan: {
      name: 'Ivan',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Fast Closer',
      photo: 'Assets/reps/ivan.png',
      stats: { experience: 6, age: 28, height: "6'0\"", avgDeal: 72, timeToFund: 2.9, totalDeals: 289, volume: 20.8, approvalRate: 79, activeClients: 84 },
      kpis:  { bestMonth: 'January 2024', largestDeal: '$4.2M', avgCommission: '$3,400', retention: '85%' }
    },
    blake: {
      name: 'Blake',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'High Volume',
      photo: 'Assets/reps/blake.png',
      stats: { experience: 9, age: 35, height: "6'1\"", avgDeal: 91, timeToFund: 3.8, totalDeals: 341, volume: 31.0, approvalRate: 76, activeClients: 105 },
      kpis:  { bestMonth: 'August 2023', largestDeal: '$7.2M', avgCommission: '$4,100', retention: '87%' }
    },
    frank: {
      name: 'Frank',
      role: 'Senior Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Elite Closer',
      photo: 'Assets/reps/frank.png',
      stats: { experience: 12, age: 38, height: "5'10\"", avgDeal: 96, timeToFund: 3.6, totalDeals: 398, volume: 38.2, approvalRate: 84, activeClients: 119 },
      kpis:  { bestMonth: 'November 2023', largestDeal: '$9.3M', avgCommission: '$4,700', retention: '92%' }
    },
    colin: {
      name: 'Colin',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Rising Star',
      photo: 'Assets/reps/colin.png',
      stats: { experience: 5, age: 26, height: "6'3\"", avgDeal: 68, timeToFund: 4.5, totalDeals: 198, volume: 13.5, approvalRate: 74, activeClients: 62 },
      kpis:  { bestMonth: 'April 2024', largestDeal: '$3.1M', avgCommission: '$2,900', retention: '82%' }
    },
    kip: {
      name: 'Kip',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Consistent',
      photo: 'Assets/reps/kip.png',
      stats: { experience: 7, age: 31, height: "5'9\"", avgDeal: 76, timeToFund: 4.0, totalDeals: 267, volume: 20.3, approvalRate: 77, activeClients: 79 },
      kpis:  { bestMonth: 'October 2023', largestDeal: '$4.8M', avgCommission: '$3,500', retention: '86%' }
    },
    juan: {
      name: 'Juan',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Deal Maker',
      photo: 'Assets/reps/juan.png',
      stats: { experience: 4, age: 27, height: "5'8\"", avgDeal: 65, timeToFund: 4.8, totalDeals: 187, volume: 12.2, approvalRate: 71, activeClients: 58 },
      kpis:  { bestMonth: 'February 2024', largestDeal: '$2.8M', avgCommission: '$2,700', retention: '79%' }
    },
    rio: {
      name: 'Rio',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Hustler',
      photo: 'Assets/reps/rio.png',
      stats: { experience: 3, age: 25, height: "6'0\"", avgDeal: 61, timeToFund: 5.1, totalDeals: 142, volume: 8.7, approvalRate: 68, activeClients: 45 },
      kpis:  { bestMonth: 'March 2024', largestDeal: '$2.1M', avgCommission: '$2,400', retention: '76%' }
    },
    santi: {
      name: 'Santi',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Steady Closer',
      photo: 'Assets/reps/santi.png',
      stats: { experience: 4, age: 26, height: "5'11\"", avgDeal: 63, timeToFund: 5.3, totalDeals: 156, volume: 9.8, approvalRate: 69, activeClients: 48 },
      kpis:  { bestMonth: 'May 2024', largestDeal: '$2.4M', avgCommission: '$2,500', retention: '78%' }
    },
    rondon: {
      name: 'Rondon',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'On The Rise',
      photo: 'Assets/reps/rondon.png',
      stats: { experience: 3, age: 24, height: "5'10\"", avgDeal: 59, timeToFund: 5.6, totalDeals: 134, volume: 7.9, approvalRate: 65, activeClients: 41 },
      kpis:  { bestMonth: 'April 2024', largestDeal: '$1.9M', avgCommission: '$2,200', retention: '74%' }
    },
    ray: {
      name: 'Ray',
      role: 'Junior Advisor',
      company: 'Capital Infusion',
      badge: 'New Blood',
      photo: 'Assets/reps/ray.png',
      stats: { experience: 2, age: 23, height: "5'9\"", avgDeal: 55, timeToFund: 5.8, totalDeals: 98, volume: 5.4, approvalRate: 62, activeClients: 31 },
      kpis:  { bestMonth: 'May 2024', largestDeal: '$1.6M', avgCommission: '$2,000', retention: '72%' }
    },
    dominic: {
      name: 'Dominic',
      bookName: 'Dominic Basilio',
      role: 'Junior Advisor',
      company: 'Capital Infusion',
      badge: 'Learning Fast',
      photo: 'Assets/reps/dominic.png',
      stats: { experience: 2, age: 24, height: "5'11\"", avgDeal: 52, timeToFund: 6.0, totalDeals: 89, volume: 4.6, approvalRate: 60, activeClients: 28 },
      kpis:  { bestMonth: 'June 2024', largestDeal: '$1.4M', avgCommission: '$1,900', retention: '70%' }
    },
    gabriel: {
      name: 'Gabriel Sulca',
      bookName: 'Gabriel Sulca',
      bookRoles: ['package_owner', 'puller'],
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Momentum',
      stats: { experience: 3, age: 26, height: "6'1\"", avgDeal: 34, timeToFund: 4.9, totalDeals: 1, volume: 0.03, approvalRate: 70, activeClients: 52 },
      kpis:  { bestMonth: 'May 2026', largestDeal: '$34K', avgCommission: '$2,600', retention: '80%' }
    },
    gabe: {
      name: 'Gabriel Sulca',
      bookName: 'Gabriel Sulca',
      bookRoles: ['package_owner', 'puller'],
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Momentum',
      stats: { experience: 3, age: 26, height: "6'1\"", avgDeal: 34, timeToFund: 4.9, totalDeals: 1, volume: 0.03, approvalRate: 70, activeClients: 52 },
      kpis:  { bestMonth: 'May 2026', largestDeal: '$34K', avgCommission: '$2,600', retention: '80%' }
    },
    cipriani: {
      name: 'Cipriani',
      role: 'Senior Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Mega Deals',
      photo: 'Assets/reps/Cartoon/cipriani.png',
      stats: { experience: 10, age: 37, height: "5'9\"", avgDeal: 130, timeToFund: 3.2, totalDeals: 289, volume: 37.6, approvalRate: 85, activeClients: 88 },
      kpis:  { bestMonth: 'December 2023', largestDeal: '$12.4M', avgCommission: '$6,200', retention: '93%' }
    },
    pina: {
      name: 'Pina',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Team Player',
      photo: 'Assets/reps/pina.png',
      stats: { experience: 5, age: 29, height: "5'7\"", avgDeal: 70, timeToFund: 4.2, totalDeals: 221, volume: 15.5, approvalRate: 75, activeClients: 68 },
      kpis:  { bestMonth: 'July 2023', largestDeal: '$3.4M', avgCommission: '$3,100', retention: '84%' }
    },
    careem: {
      name: 'Careem',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Deal Pro',
      photo: 'Assets/reps/careem.png',
      stats: { experience: 5, age: 30, height: "5'10\"", avgDeal: 67, timeToFund: 4.4, totalDeals: 201, volume: 13.5, approvalRate: 73, activeClients: 63 },
      kpis:  { bestMonth: 'March 2024', largestDeal: '$3.0M', avgCommission: '$2,900', retention: '82%' }
    },
    daniel: {
      name: 'Daniel',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Consistent',
      photo: 'Assets/reps/daniel.png',
      stats: { experience: 6, age: 31, height: "5'11\"", avgDeal: 69, timeToFund: 4.3, totalDeals: 218, volume: 15.0, approvalRate: 74, activeClients: 67 },
      kpis:  { bestMonth: 'September 2023', largestDeal: '$3.2M', avgCommission: '$3,000', retention: '83%' }
    },
    diaz: {
      name: 'Diaz',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Deal Maker',
      photo: 'Assets/reps/diaz.png',
      stats: { experience: 4, age: 27, height: "5'8\"", avgDeal: 62, timeToFund: 5.0, totalDeals: 176, volume: 10.9, approvalRate: 70, activeClients: 55 },
      kpis:  { bestMonth: 'April 2024', largestDeal: '$2.6M', avgCommission: '$2,600', retention: '79%' }
    },
    edward: {
      name: 'Edward',
      role: 'Senior Advisor',
      company: 'Capital Infusion',
      badge: 'Vet',
      photo: 'Assets/reps/edward.png',
      stats: { experience: 9, age: 36, height: "6'0\"", avgDeal: 82, timeToFund: 3.9, totalDeals: 301, volume: 24.7, approvalRate: 80, activeClients: 92 },
      kpis:  { bestMonth: 'January 2024', largestDeal: '$5.8M', avgCommission: '$3,900', retention: '89%' }
    },
    emilio: {
      name: 'Emilio',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'High Energy',
      photo: 'Assets/reps/emilio.png',
      stats: { experience: 4, age: 28, height: "5'10\"", avgDeal: 64, timeToFund: 4.7, totalDeals: 182, volume: 11.6, approvalRate: 71, activeClients: 57 },
      kpis:  { bestMonth: 'March 2024', largestDeal: '$2.7M', avgCommission: '$2,700', retention: '80%' }
    },
    evan: {
      name: 'Evan',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'On Fire',
      photo: 'Assets/reps/evan.png',
      stats: { experience: 5, age: 29, height: "6'2\"", avgDeal: 71, timeToFund: 4.1, totalDeals: 226, volume: 16.0, approvalRate: 75, activeClients: 70 },
      kpis:  { bestMonth: 'February 2024', largestDeal: '$3.5M', avgCommission: '$3,100', retention: '84%' }
    },
    gimmy: {
      name: 'Gimmy',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Closer',
      photo: 'Assets/reps/gimmy.png',
      stats: { experience: 4, age: 27, height: "5'9\"", avgDeal: 63, timeToFund: 4.8, totalDeals: 179, volume: 11.3, approvalRate: 70, activeClients: 56 },
      kpis:  { bestMonth: 'May 2024', largestDeal: '$2.5M', avgCommission: '$2,600', retention: '79%' }
    },
    guillermo: {
      name: 'Guillermo',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Team Lead',
      photo: 'Assets/reps/guillermo.png',
      stats: { experience: 7, age: 33, height: "5'11\"", avgDeal: 77, timeToFund: 4.0, totalDeals: 258, volume: 19.8, approvalRate: 77, activeClients: 80 },
      kpis:  { bestMonth: 'October 2023', largestDeal: '$4.5M', avgCommission: '$3,500', retention: '86%' }
    },
    jamar: {
      name: 'Jamar',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Rising',
      photo: 'Assets/reps/jamar.png',
      stats: { experience: 3, age: 25, height: "6'1\"", avgDeal: 60, timeToFund: 5.2, totalDeals: 139, volume: 8.3, approvalRate: 67, activeClients: 43 },
      kpis:  { bestMonth: 'June 2024', largestDeal: '$1.8M', avgCommission: '$2,300', retention: '75%' }
    },
    jonathan: {
      name: 'Jonathan',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Networker',
      photo: 'Assets/reps/jonathan.png',
      stats: { experience: 5, age: 30, height: "6'0\"", avgDeal: 68, timeToFund: 4.4, totalDeals: 207, volume: 14.1, approvalRate: 73, activeClients: 65 },
      kpis:  { bestMonth: 'January 2024', largestDeal: '$3.1M', avgCommission: '$2,900', retention: '82%' }
    },
    joseph: {
      name: 'Joseph',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Solid',
      photo: 'Assets/reps/joseph.png',
      stats: { experience: 6, age: 32, height: "5'10\"", avgDeal: 72, timeToFund: 4.2, totalDeals: 234, volume: 16.8, approvalRate: 75, activeClients: 72 },
      kpis:  { bestMonth: 'August 2023', largestDeal: '$3.6M', avgCommission: '$3,200', retention: '84%' }
    },
    ken: {
      name: 'Ken',
      role: 'Senior Advisor',
      company: 'Capital Infusion',
      badge: 'Vet',
      photo: 'Assets/reps/ken.png',
      stats: { experience: 11, age: 40, height: "5'9\"", avgDeal: 88, timeToFund: 3.7, totalDeals: 362, volume: 31.9, approvalRate: 82, activeClients: 111 },
      kpis:  { bestMonth: 'December 2023', largestDeal: '$7.8M', avgCommission: '$4,300', retention: '90%' }
    },
    kevin: {
      name: 'Kevin',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Hustler',
      photo: 'Assets/reps/kevin.png',
      stats: { experience: 4, age: 27, height: "5'11\"", avgDeal: 64, timeToFund: 4.7, totalDeals: 188, volume: 12.0, approvalRate: 71, activeClients: 59 },
      kpis:  { bestMonth: 'April 2024', largestDeal: '$2.6M', avgCommission: '$2,700', retention: '80%' }
    },
    michael: {
      name: 'Michael',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Power Closer',
      photo: 'Assets/reps/michael.png',
      stats: { experience: 7, age: 33, height: "6'0\"", avgDeal: 79, timeToFund: 3.9, totalDeals: 271, volume: 21.4, approvalRate: 78, activeClients: 84 },
      kpis:  { bestMonth: 'November 2023', largestDeal: '$4.9M', avgCommission: '$3,600', retention: '87%' }
    },
    nicholas: {
      name: 'Nicholas',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Sharp',
      photo: 'Assets/reps/nicholas.png',
      stats: { experience: 5, age: 29, height: "6'1\"", avgDeal: 70, timeToFund: 4.3, totalDeals: 213, volume: 14.9, approvalRate: 74, activeClients: 66 },
      kpis:  { bestMonth: 'February 2024', largestDeal: '$3.3M', avgCommission: '$3,000', retention: '83%' }
    },
    nikholas: {
      name: 'Nikholas',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Driven',
      photo: 'Assets/reps/nikholas.png',
      stats: { experience: 3, age: 26, height: "5'10\"", avgDeal: 62, timeToFund: 5.0, totalDeals: 151, volume: 9.4, approvalRate: 68, activeClients: 47 },
      kpis:  { bestMonth: 'June 2024', largestDeal: '$2.2M', avgCommission: '$2,400', retention: '77%' }
    },
    q: {
      name: 'Q',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Bold',
      photo: 'Assets/reps/q.png',
      stats: { experience: 4, age: 27, height: "6'2\"", avgDeal: 65, timeToFund: 4.9, totalDeals: 176, volume: 11.4, approvalRate: 70, activeClients: 55 },
      kpis:  { bestMonth: 'March 2024', largestDeal: '$2.7M', avgCommission: '$2,700', retention: '80%' }
    },
    rondon2: { /* alias */ name: 'Rondon', role: 'Funding Advisor', company: 'Capital Infusion', badge: 'On The Rise', photo: 'Assets/reps/rondon.png', stats: { experience: 3, age: 24, height: "5'10\"", avgDeal: 59, timeToFund: 5.6, totalDeals: 134, volume: 7.9, approvalRate: 65, activeClients: 41 }, kpis: { bestMonth: 'April 2024', largestDeal: '$1.9M', avgCommission: '$2,200', retention: '74%' } },
    jason: {
      name: 'Jason',
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Clutch',
      photo: 'Assets/reps/Cartoon/IvanCartoon.png',
      stats: { experience: 4, age: 28, height: "5'11\"", avgDeal: 66, timeToFund: 4.6, totalDeals: 191, volume: 12.6, approvalRate: 72, activeClients: 60 },
      kpis:  { bestMonth: 'June 2024', largestDeal: '$2.9M', avgCommission: '$2,800', retention: '81%' }
    },
    matt: {
      name: 'Matt',
      role: 'Senior Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Top Closer',
      photo: 'Assets/reps/matthew.png',
      stats: { experience: 8, age: 32, height: "5'11\"", avgDeal: 78, timeToFund: 4.1, totalDeals: 312, volume: 24.3, approvalRate: 78, activeClients: 98 },
      kpis:  { bestMonth: 'June 2024', largestDeal: '$5.4M', avgCommission: '$3,800', retention: '88%' }
    }
  };

  function hashCode(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function buildTodayStats(id, rep) {
    var h = hashCode(id);
    var s = rep.stats || {};
    return {
      leads:      3 + (h % 12),
      pulls:      2 + (h % 8),
      dealsOwned: 5 + (h % 15),
      funded:     1 + (h % 4),
      volume:     Math.round((s.avgDeal || 70) * 1000 * (1 + (h % 5))),
      commission: 2000 + (h % 7000),
      pipeline:   3 + (h % 10),
      calls:      15 + (h % 35)
    };
  }

  Object.keys(REPS).forEach(function (id) {
    if (!REPS[id].today) REPS[id].today = buildTodayStats(id, REPS[id]);
  });

  REPS.anderson.today = {
    leads: 8, pulls: 5, dealsOwned: 12, funded: 2,
    volume: 420000, commission: 8400, pipeline: 6, calls: 34
  };
  REPS.gimmy.today = {
    leads: 5, pulls: 3, dealsOwned: 7, funded: 1,
    volume: 185000, commission: 3700, pipeline: 4, calls: 22
  };

  /* Expose REPS globally so other page scripts can read rep data */
  window.REPS = REPS;

  var REP_ALIASES = { jimmy: 'gimmy' };

  function defaultRepProfile(id) {
    var h = hashCode(id);
    var name = id.charAt(0).toUpperCase() + id.slice(1);
    return {
      name: name,
      role: 'Funding Advisor',
      company: 'Capital Infusion',
      badge: 'Rising Star',
      photo: 'Assets/reps/' + id + '.png',
      stats: {
        experience: 3 + (h % 8),
        age: 24 + (h % 14),
        height: "5'10\"",
        avgDeal: 55 + (h % 40),
        timeToFund: 3.5 + (h % 30) / 10,
        totalDeals: 80 + (h % 200),
        volume: 5 + (h % 25) / 1,
        approvalRate: 62 + (h % 20),
        activeClients: 30 + (h % 80)
      },
      kpis: {
        bestMonth: 'May 2024',
        largestDeal: '$2.0M',
        totalFunded: null,
        avgRevenue: null
      }
    };
  }

  function ensureRepProfile(personId) {
    var key = String(personId || '').toLowerCase().replace(/\s+/g, '');
    if (!key) key = 'anderson';
    if (REP_ALIASES[key] && REPS[REP_ALIASES[key]]) key = REP_ALIASES[key];

    var rep = REPS[key];
    if (!rep) {
      rep = defaultRepProfile(key);
      rep.today = buildTodayStats(key, rep);
      REPS[key] = rep;
      return key;
    }

    if (!rep.stats || !rep.kpis) {
      var defaults = defaultRepProfile(key);
      rep.stats = rep.stats || defaults.stats;
      rep.kpis  = rep.kpis  || defaults.kpis;
      if (!rep.role)    rep.role    = defaults.role;
      if (!rep.badge)   rep.badge   = defaults.badge;
      if (!rep.photo)   rep.photo   = defaults.photo;
      if (!rep.company) rep.company = defaults.company;
    }
    if (!rep.today) rep.today = buildTodayStats(key, rep);
    return key;
  }

  window.ensureRepProfile = ensureRepProfile;

  var SKIP_COMPARE_KEYS = { gabe: 1, matt: 1, rondon2: 1, jimmy: 1 };

  function getRepData(personId) {
    var key = ensureRepProfile(personId);
    var data = REPS[key];
    return {
      id: key,
      name: data.name || key,
      role: data.role || 'Funding Advisor',
      company: data.company || 'Capital Infusion',
      badge: data.badge || 'Funding Pro',
      photo: data.photo || '',
      stats: data.stats || {},
      kpis: data.kpis || {},
      today: data.today || {}
    };
  }

  function listComparableReps(excludeId) {
    var excludeKey = ensureRepProfile(excludeId);
    var seen = {};
    var list = [];
    Object.keys(REPS).forEach(function (id) {
      if (id === excludeKey) return;
      if (SKIP_COMPARE_KEYS[id]) return;
      if (REP_ALIASES[id]) return;
      var rep = REPS[id];
      if (!rep || !rep.name) return;
      if (seen[rep.name]) return;
      seen[rep.name] = true;
      list.push({ id: id, name: rep.name });
    });
    list.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  function profileStatsPanelHTML(kpis) {
    var k = kpis || {};
    return '' +
      '<div class="pmc-stats-row">' +
        '<div class="pmc-stat"><span class="pmc-stat-val"></span><span class="pmc-stat-lbl">Experience</span></div>' +
        '<div class="pmc-stat"><span class="pmc-stat-val"></span><span class="pmc-stat-lbl">Age</span></div>' +
        '<div class="pmc-stat"><span class="pmc-stat-val"></span><span class="pmc-stat-lbl">Height</span></div>' +
      '</div>' +
      '<div class="pmc-div slim"></div>' +
      '<div class="pmc-stats-row">' +
        '<div class="pmc-stat"><span class="pmc-stat-val"></span><span class="pmc-stat-lbl">Avg Deal Size</span></div>' +
        '<div class="pmc-stat"><span class="pmc-stat-val"></span><span class="pmc-stat-lbl">Avg Time to Fund</span></div>' +
        '<div class="pmc-stat"><span class="pmc-stat-val"></span><span class="pmc-stat-lbl">Total Deals Funded</span></div>' +
      '</div>' +
      '<div class="pmc-div slim"></div>' +
      '<div class="pmc-stats-row">' +
        '<div class="pmc-stat s-green"><span class="pmc-stat-val"></span><span class="pmc-stat-lbl">Total Pulled Apps</span></div>' +
        '<div class="pmc-stat s-gold"><span class="pmc-stat-val"></span><span class="pmc-stat-lbl">Total Volume</span></div>' +
        '<div class="pmc-stat"><span class="pmc-stat-val"></span><span class="pmc-stat-lbl">Active Clients</span></div>' +
      '</div>' +
      '<div class="pmc-div"></div>' +
      '<div class="pmc-kpis pmc-kpis-visible">' +
        '<div class="pmc-kpi"><div class="pmc-kpi-icon">📅</div><div class="pmc-kpi-val"></div><div class="pmc-kpi-lbl">Best Funding Month</div></div>' +
        '<div class="pmc-kpi"><div class="pmc-kpi-icon">🏆</div><div class="pmc-kpi-val"></div><div class="pmc-kpi-lbl">Largest Deal Funded</div></div>' +
        '<div class="pmc-kpi"><div class="pmc-kpi-icon">💵</div><div class="pmc-kpi-val"></div><div class="pmc-kpi-lbl">Total Amount Funded</div></div>' +
        '<div class="pmc-kpi"><div class="pmc-kpi-icon">💰</div><div class="pmc-kpi-val"></div><div class="pmc-kpi-lbl">Average Revenue</div></div>' +
      '</div>';
  }

  function fmtPerfMoney(v) {
    if (v == null || v === '' || v === '—') return '';
    if (typeof v === 'string' && v.indexOf('$') === 0) return v;
    var n = parseFloat(v) || 0;
    if (!n) return '';
    if (n >= 1e6 || Math.round(n / 1000) >= 1000) {
      return '$' + (n / 1e6).toFixed(2) + 'M';
    }
    if (n >= 1e3) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n).toLocaleString();
  }

  function emptyStat(val) {
    return val == null || val === '' || val === '—';
  }

  function formatProfileStat(key, val) {
    if (emptyStat(val)) return '';
    if (key === 'experience') return val + ' yrs';
    if (key === 'timeToFund') return val + ' days';
    if (key === 'approvalRate') return val + '%';
    return String(val);
  }

  var TODAY_FIELD_KEYS = ['leads', 'pulls', 'dealsOwned', 'funded', 'volume', 'commission', 'pipeline', 'calls'];
  var BOOK_TODAY_KEYS = { funded: 1, volume: 1 };

  function formatTodayMetric(key, val) {
    if (val == null || val === '' || val === '—') return '';
    if (key === 'volume' || key === 'commission') return val === 0 ? '$0' : fmtPerfMoney(val);
    return String(val);
  }

  function fillTodayPerfValues(container, personId, compact) {
    if (!container) return;
    var rep = getRepData(personId);
    var t = rep.today || {};
    var sel = compact ? '.pmc-compare-perf-val' : '.perf-val';
    var cards = container.querySelectorAll(sel);
    TODAY_FIELD_KEYS.forEach(function (key, i) {
      if (!cards[i]) return;
      if (!BOOK_TODAY_KEYS[key]) {
        cards[i].textContent = '';
        return;
      }
      cards[i].textContent = formatTodayMetric(key, t[key]);
    });
    if (cards[8]) cards[8].textContent = '';
  }

  function fillProfileStatsValues(container, personId) {
    if (!container) return;
    var rep = getRepData(personId);
    var s = rep.stats || {};
    var k = rep.kpis || {};
    var statVals = container.querySelectorAll('.pmc-stat-val');
    var statTexts = [
      '',
      '',
      '',
      s.avgDeal || '',
      formatProfileStat('timeToFund', s.timeToFund),
      s.totalDeals != null ? String(s.totalDeals) : '',
      s.totalPulled != null ? String(s.totalPulled) : '',
      s.volume || '',
      ''
    ];
    statVals.forEach(function (el, i) {
      el.textContent = statTexts[i] || '';
    });
    var kpiVals = container.querySelectorAll('.pmc-kpi-val');
    var kpiTexts = [
      k.bestMonth || '',
      k.largestDeal || '',
      k.totalFunded || s.volume || '',
      k.avgRevenue || ''
    ];
    kpiVals.forEach(function (el, i) {
      el.textContent = kpiTexts[i] || '';
    });
  }

  function renderProfileStatsPanel(container, personId) {
    if (!container) return;
    var rep = getRepData(personId);
    container.innerHTML = profileStatsPanelHTML(rep.kpis);
    fillProfileStatsValues(container, personId);
  }

  var TODAY_METRICS = [
    { icon: 'pi-blue',   lbl: 'Leads submitted',     svg: '<path d="M4 4h12v12H4z" stroke-linecap="round"/><path d="M8 8h4M8 11h4" stroke-linecap="round"/>' },
    { icon: 'pi-green',  lbl: 'Applications pulled', svg: '<path d="M10 3v14M6 7l4-4 4 4M6 13l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/>' },
    { icon: 'pi-purple', lbl: 'Deals owned',         svg: '<rect x="3" y="5" width="14" height="12" rx="2"/><path d="M7 5V3h6v2" stroke-linecap="round"/>' },
    { icon: 'pi-gold',   lbl: 'Funded today',        svg: '<path d="M4 10l4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/>' },
    { icon: 'pi-teal',   lbl: 'Volume',              svg: '<path d="M10 3v14M6 10h8" stroke-linecap="round"/>' },
    { icon: 'pi-crimson',lbl: 'Commission',          svg: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2 2" stroke-linecap="round"/>' },
    { icon: 'pi-blue',   lbl: 'Active pipeline',     svg: '<path d="M3 14h14M5 10h10M7 6h6" stroke-linecap="round"/>' },
    { icon: 'pi-green',  lbl: 'Calls made',          svg: '<path d="M5 4c4 6 6 8 10 12M5 16l2-5 3 1 4-6" stroke-linecap="round" stroke-linejoin="round"/>' },
    { icon: 'pi-purple', lbl: 'Approval rate',       svg: '<path d="M4 14l4-5 3 3 5-7" stroke-linecap="round" stroke-linejoin="round"/>' }
  ];

  function renderTodayPerfPanel(container, personId, options) {
    if (!container) return;
    options = options || {};
    var compact = !!options.compact;
    var animate = options.animate !== false && !compact;
    ensureRepProfile(personId);

    container.innerHTML = '';
    TODAY_METRICS.forEach(function (card, i) {
      var el = document.createElement('div');
      el.className = compact ? 'pmc-compare-perf-item' : 'perf-card';
      if (animate) el.style.animationDelay = (0.18 + i * 0.05) + 's';
      el.innerHTML =
        '<div class="' + (compact ? 'pmc-compare-perf-icon' : 'perf-icon') + ' ' + card.icon + '">' +
          '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7">' + card.svg + '</svg>' +
        '</div>' +
        '<div class="' + (compact ? 'pmc-compare-perf-details' : 'perf-details') + '">' +
          '<div class="' + (compact ? 'pmc-compare-perf-val' : 'perf-val') + '"></div>' +
          '<div class="' + (compact ? 'pmc-compare-perf-lbl' : 'perf-lbl') + '">' + card.lbl + '</div>' +
        '</div>';
      container.appendChild(el);
    });
    fillTodayPerfValues(container, personId, compact);
  }

  var PLACEHOLDER_REP_PHOTOS = {
    'assets/reps/cartoon/andersoncartoon.png': 1,
    'assets/reps/anderson.png': 1
  };

  function normalizePhotoPath(photo) {
    return String(photo || '').trim().toLowerCase();
  }

  function hasRepPhoto(photo) {
    var path = normalizePhotoPath(photo);
    if (!path) return false;
    return !PLACEHOLDER_REP_PHOTOS[path];
  }

  function setHeroRepPhoto(ringEl, imgEl, rep) {
    if (!ringEl || !imgEl) return;
    var placeholder = ringEl.querySelector('.hero-photo-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'hero-photo-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.textContent = '?';
      ringEl.appendChild(placeholder);
    }

    function showPlaceholder() {
      imgEl.hidden = true;
      imgEl.removeAttribute('src');
      placeholder.hidden = false;
    }

    function showPhoto(src) {
      placeholder.hidden = true;
      imgEl.hidden = false;
      imgEl.onerror = showPlaceholder;
      imgEl.src = src;
      imgEl.alt = (rep && rep.name) || 'Profile';
    }

    if (rep && hasRepPhoto(rep.photo)) {
      showPhoto(rep.photo);
    } else {
      showPlaceholder();
    }
  }

  window.getRepData = getRepData;
  window.hasRepPhoto = hasRepPhoto;
  window.setHeroRepPhoto = setHeroRepPhoto;
  window.fillTodayPerfValues = fillTodayPerfValues;
  window.fillProfileStatsValues = fillProfileStatsValues;
  window.listComparableReps = listComparableReps;
  window.renderProfileStatsPanel = renderProfileStatsPanel;
  window.renderTodayPerfPanel = renderTodayPerfPanel;

  /* ═══════════════════════════════════════════════════════════════
     Modal DOM — injected once on page load
  ═══════════════════════════════════════════════════════════════ */
  var overlay, flipEl, closeBtn;
  var compareOverlay, compareSelect, compareSelfCol, compareOtherCol, compareCloseBtn;
  var compareSelfId = '';
  var currentProfileId = '';

  function setModalRepPhoto(imgEl, rep) {
    if (!imgEl) return;
    var ring = imgEl.parentElement;
    if (hasRepPhoto(rep.photo)) {
      imgEl.hidden = false;
      imgEl.onerror = function () { setModalRepPhoto(imgEl, { name: rep.name, photo: '' }); };
      imgEl.src = rep.photo;
      imgEl.alt = rep.name;
      if (ring) ring.classList.remove('pmc-photo-missing');
    } else {
      imgEl.hidden = true;
      imgEl.removeAttribute('src');
      imgEl.alt = rep.name || '';
      if (ring) ring.classList.add('pmc-photo-missing');
    }
  }

  function loadLiveStatsForRep(personId) {
    if (!window.CapMuseRepStats) return Promise.resolve(null);
    return window.CapMuseRepStats.applyForRep(personId);
  }

  function buildModal() {
    var html = '' +
      '<div id="pmcOverlay" class="pmc-overlay" role="dialog" aria-modal="true" aria-labelledby="pmcPersonName" hidden>' +
        '<div class="pmc-card-wrap">' +
          '<div class="pmc-flip" id="pmcFlip">' +

            '<div class="pmc-face-front">' +
              '<div class="pmc-front-crown" id="pmcFrontCrown">🥇</div>' +
              '<div class="pmc-front-photo-ring">' +
                '<img id="pmcFrontPhoto" src="" alt="" />' +
              '</div>' +
              '<div class="pmc-front-name" id="pmcFrontName"></div>' +
              '<div class="pmc-front-role" id="pmcFrontRole"></div>' +
              '<div class="pmc-front-co"   id="pmcFrontCo"></div>' +
            '</div>' +

            '<div class="pmc-face-back">' +
              '<div class="pmc-back-header">' +
                '<div class="pmc-back-header-left">' +
                  '<div class="pmc-back-photo-ring">' +
                    '<img id="pmcBackPhoto" src="" alt="" />' +
                  '</div>' +
                  '<div>' +
                    '<div class="pmc-back-name" id="pmcPersonName"></div>' +
                    '<div class="pmc-back-role" id="pmcBackRole"></div>' +
                    '<div class="pmc-back-co"   id="pmcBackCo"></div>' +
                  '</div>' +
                '</div>' +
                '<div class="pmc-back-header-right">' +
                  '<span class="pmc-badge" id="pmcBadge"></span>' +
                  '<button class="pmc-close" id="pmcClose" aria-label="Close">' +
                    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">' +
                      '<path d="M5 5l10 10M15 5L5 15" stroke-linecap="round"/>' +
                    '</svg>' +
                  '</button>' +
                '</div>' +
              '</div>' +

              '<div class="pmc-div"></div>' +
              '<div id="pmcStatsPanel"></div>' +
            '</div>' +

          '</div>' +
        '</div>' +
      '</div>';

    document.body.insertAdjacentHTML('beforeend', html);
    overlay  = document.getElementById('pmcOverlay');
    flipEl   = document.getElementById('pmcFlip');
    closeBtn = document.getElementById('pmcClose');

    closeBtn.addEventListener('click', closeProfile);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeProfile();
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     Populate modal with person data
  ═══════════════════════════════════════════════════════════════ */
  function renderProfileView(personId) {
    var rep = getRepData(personId);

    setModalRepPhoto(document.getElementById('pmcFrontPhoto'), rep);
    document.getElementById('pmcFrontName').textContent = rep.name;
    document.getElementById('pmcFrontRole').textContent = rep.role;
    document.getElementById('pmcFrontCo').textContent   = rep.company;

    setModalRepPhoto(document.getElementById('pmcBackPhoto'), rep);
    document.getElementById('pmcPersonName').textContent = rep.name;
    document.getElementById('pmcBackRole').textContent   = rep.role;
    document.getElementById('pmcBackCo').textContent     = rep.company;
    document.getElementById('pmcBadge').textContent      = rep.badge;

    renderProfileStatsPanel(document.getElementById('pmcStatsPanel'), rep.id);
  }

  function populate(personId) {
    currentProfileId = ensureRepProfile(personId);
    if (window.CapMuseRepStats && window.CapMuseData) {
      loadLiveStatsForRep(currentProfileId).then(function () {
        if (currentProfileId === ensureRepProfile(personId)) {
          renderProfileView(currentProfileId);
        }
      });
      return;
    }
    renderProfileView(currentProfileId);
  }

  function renderCompareColumn(colEl, personId, columnLabel) {
    if (!colEl) return;
    var rep = getRepData(personId);
    colEl.innerHTML =
      '<div class="pmc-compare-col-label">' + columnLabel + '</div>' +
      '<div class="pmc-compare-header">' +
        '<div class="pmc-back-photo-ring"><img src="' + rep.photo + '" alt="' + rep.name + '" /></div>' +
        '<div class="pmc-compare-header-text">' +
          '<div class="pmc-back-name">' + rep.name + '</div>' +
          '<div class="pmc-back-role">' + rep.role + '</div>' +
          '<span class="pmc-badge">' + rep.badge + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="pmc-compare-section-title">Career Stats</div>' +
      '<div class="pmc-compare-stats"></div>' +
      '<div class="pmc-compare-section-title">Today\'s Performance</div>' +
      '<div class="pmc-compare-today-grid"></div>';

    renderProfileStatsPanel(colEl.querySelector('.pmc-compare-stats'), rep.id);
    renderTodayPerfPanel(colEl.querySelector('.pmc-compare-today-grid'), rep.id, { compact: true, animate: false });

    var compareImg = colEl.querySelector('.pmc-back-photo-ring img');
    if (compareImg) setModalRepPhoto(compareImg, rep);
  }

  function buildCompareModal() {
    var html = '' +
      '<div id="pmcCompareOverlay" class="pmc-overlay pmc-compare-overlay" role="dialog" aria-modal="true" aria-labelledby="pmcCompareTitle" hidden>' +
        '<div class="pmc-compare-shell">' +
          '<div class="pmc-compare-toolbar">' +
            '<h2 class="pmc-compare-title" id="pmcCompareTitle">Compare Stats</h2>' +
            '<div class="pmc-compare-picker">' +
              '<label for="pmcCompareSelect" class="pmc-compare-picker-label">Compare with</label>' +
              '<select id="pmcCompareSelect" class="pmc-compare-select" aria-label="Select rep to compare"></select>' +
            '</div>' +
            '<button type="button" class="pmc-close pmc-compare-close" id="pmcCompareClose" aria-label="Close comparison">' +
              '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">' +
                '<path d="M5 5l10 10M15 5L5 15" stroke-linecap="round"/>' +
              '</svg>' +
            '</button>' +
          '</div>' +
          '<div class="pmc-compare-body">' +
            '<div class="pmc-compare-columns">' +
              '<div class="pmc-compare-col" id="pmcCompareSelf"></div>' +
              '<div class="pmc-compare-col" id="pmcCompareOther"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.insertAdjacentHTML('beforeend', html);
    compareOverlay   = document.getElementById('pmcCompareOverlay');
    compareSelect    = document.getElementById('pmcCompareSelect');
    compareSelfCol   = document.getElementById('pmcCompareSelf');
    compareOtherCol  = document.getElementById('pmcCompareOther');
    compareCloseBtn  = document.getElementById('pmcCompareClose');

    compareCloseBtn.addEventListener('click', closeCompare);
    compareOverlay.addEventListener('click', function (e) {
      if (e.target === compareOverlay) closeCompare();
    });
    compareSelect.addEventListener('change', function () {
      var otherId = compareSelect.value;
      renderCompareColumn(compareOtherCol, otherId, compareSelect.options[compareSelect.selectedIndex].text);
      loadLiveStatsForRep(otherId).then(function () {
        renderCompareColumn(compareOtherCol, otherId, compareSelect.options[compareSelect.selectedIndex].text);
      });
    });
  }

  function openCompare(preselectedId) {
    if (window.CapMuseAuth && !window.CapMuseAuth.getUserId()) {
      window.location.href = 'login.html';
      return;
    }
    var selfId = window.CapMuseAuth ? window.CapMuseAuth.getUserId() : null;
    if (!selfId) {
      window.location.href = 'login.html';
      return;
    }
    compareSelfId = ensureRepProfile(selfId);

    var reps = listComparableReps(compareSelfId);
    compareSelect.innerHTML = '';
    reps.forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      compareSelect.appendChild(opt);
    });

    if (!reps.length) return;

    var otherId = preselectedId && reps.some(function (r) { return r.id === preselectedId; })
      ? preselectedId
      : reps[0].id;
    compareSelect.value = otherId;

    function renderCompareView() {
      renderCompareColumn(compareSelfCol, compareSelfId, 'You');
      renderCompareColumn(compareOtherCol, compareSelect.value, compareSelect.options[compareSelect.selectedIndex].text);
    }

    renderCompareView();

    Promise.all([
      loadLiveStatsForRep(compareSelfId),
      loadLiveStatsForRep(compareSelect.value)
    ]).then(renderCompareView);

    compareOverlay.removeAttribute('hidden');
    requestAnimationFrame(function () {
      compareOverlay.classList.add('pmc-open');
      document.body.style.overflow = 'hidden';
    });
  }

  function closeCompare() {
    if (!compareOverlay) return;
    compareOverlay.classList.remove('pmc-open');
    document.body.style.overflow = '';
    setTimeout(function () {
      compareOverlay.setAttribute('hidden', '');
    }, 330);
  }

  window.CapMuseCompare = { open: openCompare, close: closeCompare };

  /* ═══════════════════════════════════════════════════════════════
     Open / close
  ═══════════════════════════════════════════════════════════════ */
  function openProfile(personId) {
    populate(personId);

    flipEl.classList.remove('pmc-flipped');
    overlay.removeAttribute('hidden');

    requestAnimationFrame(function () {
      overlay.classList.add('pmc-open');
      document.body.style.overflow = 'hidden';

      setTimeout(function () {
        flipEl.classList.add('pmc-flipped');
      }, 80);
    });
  }

  function closeProfile() {
    if (!overlay) return;
    overlay.classList.remove('pmc-open');
    document.body.style.overflow = '';
    setTimeout(function () {
      flipEl.classList.remove('pmc-flipped');
      overlay.setAttribute('hidden', '');
    }, 330);
  }

  /* ═══════════════════════════════════════════════════════════════
     Event delegation — works on every page automatically
  ═══════════════════════════════════════════════════════════════ */
  document.addEventListener('click', function (e) {
    if (compareOverlay && compareOverlay.contains(e.target) && e.target !== compareOverlay) return;
    if (overlay && overlay.contains(e.target) && e.target !== overlay) return;
    if (e.target.closest('#btnCompareStats')) return;
    var trigger = e.target.closest('[data-person-id]');
    if (trigger) openProfile(trigger.dataset.personId);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (compareOverlay && compareOverlay.classList.contains('pmc-open')) {
      closeCompare();
      return;
    }
    if (overlay && overlay.classList.contains('pmc-open')) {
      closeProfile();
    }
  });

  function initModals() {
    buildModal();
    buildCompareModal();
  }

  window.addEventListener('capmuse:rep-stats-updated', function (e) {
    var uid = e.detail && e.detail.userId;
    if (!uid) return;
    if (overlay && overlay.classList.contains('pmc-open') && currentProfileId === uid) {
      renderProfileView(currentProfileId);
    }
    if (compareOverlay && compareOverlay.classList.contains('pmc-open')) {
      if (uid === compareSelfId) {
        renderCompareColumn(compareSelfCol, compareSelfId, 'You');
      }
      if (compareSelect && uid === compareSelect.value) {
        renderCompareColumn(compareOtherCol, compareSelect.value, compareSelect.options[compareSelect.selectedIndex].text);
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModals);
  } else {
    initModals();
  }

})();
