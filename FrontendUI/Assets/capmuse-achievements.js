/* ═══════════════════════════════════════════════════════════════
   capmuse-achievements.js — Rep achievement medals & persistence
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  let STORAGE_PREFIX = 'capmuse-ach-v1:';

  let RARITY = {
    iron: { label: 'Iron', order: 1 },
    bronze: { label: 'Bronze', order: 2 },
    silver: { label: 'Silver', order: 3 },
    gold: { label: 'Gold', order: 4 },
    platinum: { label: 'Platinum', order: 5 },
    diamond: { label: 'Diamond', order: 6 },
    black_diamond: { label: 'Black Diamond', order: 7 },
    red_diamond: { label: 'Red Diamond', order: 8 },
    blue_diamond: { label: 'Blue Diamond', order: 9 }
  };

  let RARITY_ALIASES = {
    ultimate: 'red_diamond',
    ceo: 'blue_diamond'
  };

  function normalizeRarity(rarity) {
    return RARITY_ALIASES[rarity] || rarity || 'bronze';
  }

  function renderGemIcon(rarity, extraClass) {
    let r = normalizeRarity(rarity);
    let cls = 'pmc-ach-gem rarity-' + r + (extraClass ? ' ' + extraClass : '');
    return '<span class="' + cls + '" aria-hidden="true"></span>';
  }

  function achievementAssetBase() {
    let scripts = document.getElementsByTagName('script');
    let i;
    for (i = 0; i < scripts.length; i++) {
      if (scripts[i].src && scripts[i].src.indexOf('capmuse-achievements.js') > -1) {
        return scripts[i].src.replace(/capmuse-achievements\.js.*$/, '');
      }
    }
    return 'Assets/';
  }

  function injectAchievementStyles() {
    if (document.getElementById('capmuse-achievements-css')) return;
    let link = document.createElement('link');
    link.id = 'capmuse-achievements-css';
    link.rel = 'stylesheet';
    link.href = achievementAssetBase() + 'capmuse-achievements.css';
    document.head.appendChild(link);
  }

  function hasRankOne(ctx, key) {
    if (!ctx.rankOnes || !ctx.rankOnes.ones) return false;
    let i;
    for (i = 0; i < ctx.rankOnes.ones.length; i++) {
      if (ctx.rankOnes.ones[i].key === key) return true;
    }
    return false;
  }

  function parseMoney(val) {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') return val;
    let str = String(val).replace(/[$,\s]/g, '');
    if (/m$/i.test(str)) return (parseFloat(str) || 0) * 1000000;
    if (/k$/i.test(str)) return (parseFloat(str) || 0) * 1000;
    return parseFloat(str) || 0;
  }

  function totalDeals(ctx) {
    if (!ctx.stats || ctx.stats.totalDeals == null) return 0;
    return Number(ctx.stats.totalDeals) || 0;
  }

  let DEFINITIONS = [
    {
      id: 'rank_volume',
      name: 'Funding Champion',
      description: 'Ranked #1 in total funded volume for the current leaderboard view.',
      rarity: 'gold',
      check: function (ctx) { return hasRankOne(ctx, 'volume'); }
    },
    {
      id: 'rank_count',
      name: 'Deal Machine',
      description: 'Ranked #1 in funded deal count for the current leaderboard view.',
      rarity: 'gold',
      check: function (ctx) { return hasRankOne(ctx, 'count'); }
    },
    {
      id: 'rank_month',
      name: 'Monthly Closer',
      description: 'Ranked #1 in funded deals this calendar month.',
      rarity: 'silver',
      check: function (ctx) { return hasRankOne(ctx, 'monthCount'); }
    },
    {
      id: 'rank_revenue',
      name: 'Revenue King',
      description: 'Ranked #1 in total revenue for the current leaderboard view.',
      rarity: 'gold',
      check: function (ctx) { return hasRankOne(ctx, 'revenue'); }
    },
    {
      id: 'rank_points',
      name: 'Points Leader',
      description: 'Ranked #1 in points for the current leaderboard view.',
      rarity: 'silver',
      check: function (ctx) { return hasRankOne(ctx, 'points'); }
    },
    {
      id: 'rank_avg_funding',
      name: 'Big Deal Specialist',
      description: 'Ranked #1 in average funding per deal for the current view.',
      rarity: 'silver',
      check: function (ctx) { return hasRankOne(ctx, 'avg'); }
    },
    {
      id: 'rank_avg_revenue',
      name: 'Revenue Per Deal Leader',
      description: 'Ranked #1 in average revenue per deal for the current view.',
      rarity: 'silver',
      check: function (ctx) { return hasRankOne(ctx, 'avgRev'); }
    },
    {
      id: 'first_deal',
      name: 'First Deal Funded',
      description: 'Funded your first deal — welcome to the board.',
      rarity: 'iron',
      check: function (ctx) { return totalDeals(ctx) >= 1; }
    },
    {
      id: 'deals_10',
      name: 'Getting Started',
      description: 'Funded 10 or more deals in your career.',
      rarity: 'bronze',
      check: function (ctx) { return totalDeals(ctx) >= 10; }
    },
    {
      id: 'deals_25',
      name: 'Seasoned Closer',
      description: 'Funded 25 or more deals in your career.',
      rarity: 'silver',
      check: function (ctx) { return totalDeals(ctx) >= 25; }
    },
    {
      id: 'deals_50',
      name: 'Funding Veteran',
      description: 'Funded 100 or more deals in your career.',
      rarity: 'gold',
      check: function (ctx) { return totalDeals(ctx) >= 100; }
    },
    {
      id: 'ceo_badge',
      name: 'Mr. Capital Infusion',
      description: 'Exclusve Capital Infusion CEO recognition badge -- awarded only to Matthew Birnholz.',
      rarity: 'blue_diamond',
      exclusiveRepId: 'matthew',
      check: function () { return true; }
    },
    {
      id: 'volume_500k',
      name: 'Half Million Club',
      description: 'Surpassed $500,000 in total career funded volume.',
      rarity: 'bronze',
      check: function (ctx) { return parseMoney(ctx.stats && ctx.stats.volume) >= 500000; }
    },
    {
      id: 'volume_1m',
      name: 'Million Dollar Funded',
      description: 'Surpassed $1,000,000 in total career funded volume.',
      rarity: 'gold',
      check: function (ctx) { return parseMoney(ctx.stats && ctx.stats.volume) >= 1000000; }
    },
    {
      id: 'volume_5m',
      name: 'Elite Funded Producer',
      description: 'Surpassed $5,000,000 in total career funded volume.',
      rarity: 'platinum',
      check: function (ctx) { return parseMoney(ctx.stats && ctx.stats.volume) >= 5000000; }
    },
    {
      id: 'volume_50m',
      name: 'Fifty Million Funded',
      description: 'Surpassed $50,000,000 in total career funded volume.',
      rarity: 'diamond',
      check: function (ctx) { return parseMoney(ctx.stats && ctx.stats.volume) >= 50000000; }
    },
    {
      id: 'volume_100m',
      name: 'Ultimate Funder',
      description: 'Surpassed $100,000,000 in total career funded volume.',
      rarity: 'red_diamond',
      check: function (ctx) { return parseMoney(ctx.stats && ctx.stats.volume) >= 100000000; }
    },
    {
      id: 'ytd_250k',
      name: 'YTD Powerhouse',
      description: 'Funded $250,000 or more year-to-date.',
      rarity: 'silver',
      check: function (ctx) { return parseMoney(ctx.kpis && ctx.kpis.fundedYtd) >= 250000; }
    }
  ];

  let defById = {};
  DEFINITIONS.forEach(function (d) { defById[d.id] = d; });

  let REP_ID_ALIASES = {
    jimmy: 'gimmy',
    matt: 'matthew',
    schweri: 'mschweri',
    scheweri: 'mschweri'
  };

  function normalizeRepId(repId) {
    if (window.ensureRepProfile) {
      return window.ensureRepProfile(repId);
    }
    let key = String(repId || '').toLowerCase().replace(/\s+/g, '');
    if (!key) return key;
    return REP_ID_ALIASES[key] || key;
  }

  function aliasIdsFor(canonicalId) {
    let aliases = [];
    Object.keys(REP_ID_ALIASES).forEach(function (alias) {
      if (REP_ID_ALIASES[alias] === canonicalId) aliases.push(alias);
    });
    return aliases;
  }

  function storageKey(repId) {
    return STORAGE_PREFIX + normalizeRepId(repId);
  }

  function emptyState() {
    return { version: 1, unlocked: {} };
  }

  function readStoredState(storageId) {
    if (!storageId) return emptyState();
    try {
      let raw = localStorage.getItem(STORAGE_PREFIX + storageId);
      if (!raw) return emptyState();
      let parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyState();
      if (!parsed.unlocked) parsed.unlocked = {};
      return parsed;
    } catch (e) {
      return emptyState();
    }
  }

  function mergeAchievementRecords(base, incoming) {
    if (!incoming || !incoming.unlocked) return base;
    Object.keys(incoming.unlocked).forEach(function (id) {
      let existing = base.unlocked[id];
      let next = incoming.unlocked[id];
      if (!next) return;
      if (!existing) {
        base.unlocked[id] = next;
        return;
      }
      if (next.claimed && !existing.claimed) {
        base.unlocked[id] = next;
      }
    });
    return base;
  }

  function loadState(repId) {
    let canonical = normalizeRepId(repId);
    if (!canonical) return emptyState();
    let state = readStoredState(canonical);
    let migrated = false;
    aliasIdsFor(canonical).forEach(function (alias) {
      let alt = readStoredState(alias);
      if (!alt.unlocked || !Object.keys(alt.unlocked).length) return;
      mergeAchievementRecords(state, alt);
      migrated = true;
      try { localStorage.removeItem(STORAGE_PREFIX + alias); } catch (e) { /* ignore */ }
    });
    if (migrated) saveState(canonical, state);
    return state;
  }

  function saveState(repId, state) {
    if (!repId) return;
    try {
      localStorage.setItem(storageKey(repId), JSON.stringify(state));
    } catch (e) { /* quota */ }
  }

  function buildContext(repId) {
    let canonical = normalizeRepId(repId);
    let ctx = { repId: canonical, stats: {}, kpis: {}, rankOnes: null };
    if (window.getRepData) {
      let rep = window.getRepData(canonical);
      ctx.stats = rep.stats || {};
      ctx.kpis = rep.kpis || {};
    }
    if (window.CapMuseFundingBook && window.CapMuseFundingBook.getRepNumberOnes) {
      ctx.rankOnes = window.CapMuseFundingBook.getRepNumberOnes(canonical);
    }
    return ctx;
  }

  function isExclusiveForRep(def, repId) {
    if (!def.exclusiveRepId) return true;
    return normalizeRepId(repId) === normalizeRepId(def.exclusiveRepId);
  }

  function enrichRecord(def, record) {
    let rarityKey = normalizeRarity(def.rarity);
    let rarity = RARITY[rarityKey] || RARITY.bronze;
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      rarity: rarityKey,
      rarityLabel: rarity.label,
      icon: 'gem',
      unlockedAt: record.unlockedAt,
      claimed: !!record.claimed,
      claimedAt: record.claimedAt || null,
      presentShown: !!record.presentShown
    };
  }

  function getDefinition(id) {
    return defById[id] || null;
  }

  function getAllForRep(repId) {
    let state = loadState(repId);
    let list = [];
    Object.keys(state.unlocked).forEach(function (id) {
      let def = defById[id];
      let rec = state.unlocked[id];
      if (!def || !rec) return;
      if (!isExclusiveForRep(def, repId)) return;
      list.push(enrichRecord(def, rec));
    });
    list.sort(function (a, b) {
      let ra = (RARITY[normalizeRarity(a.rarity)] || RARITY.bronze).order;
      let rb = (RARITY[normalizeRarity(b.rarity)] || RARITY.bronze).order;
      if (ra !== rb) return rb - ra;
      return (b.unlockedAt || '').localeCompare(a.unlockedAt || '');
    });
    return list;
  }

  function getClaimedForRep(repId) {
    return getAllForRep(repId).filter(function (a) { return a.claimed; });
  }

  function getUnclaimedForRep(repId) {
    return getAllForRep(repId).filter(function (a) { return !a.claimed; });
  }

  function scan(repId) {
    if (!repId) return { newlyUnlocked: [], state: emptyState() };
    let state = loadState(repId);
    let ctx = buildContext(repId);
    let newlyUnlocked = [];
    let i;
    let def;
    for (i = 0; i < DEFINITIONS.length; i++) {
      def = DEFINITIONS[i];
      if (state.unlocked[def.id]) continue;
      if (!isExclusiveForRep(def, repId)) continue;
      try {
        if (def.check(ctx)) {
          state.unlocked[def.id] = {
            unlockedAt: new Date().toISOString(),
            claimed: false,
            presentShown: false
          };
          newlyUnlocked.push(enrichRecord(def, state.unlocked[def.id]));
        }
      } catch (e) { /* skip */ }
    }
    if (newlyUnlocked.length) saveState(repId, state);
    return { newlyUnlocked: newlyUnlocked, state: state };
  }

  function claim(repId, achievementId) {
    let def = defById[achievementId];
    if (!def || !repId) return null;
    let state = loadState(repId);
    let rec = state.unlocked[achievementId];
    if (!rec || rec.claimed) return null;
    rec.claimed = true;
    rec.claimedAt = new Date().toISOString();
    saveState(repId, state);
    let enriched = enrichRecord(def, rec);
    window.dispatchEvent(new CustomEvent('capmuse:achievement-claimed', {
      detail: { repId: repId, achievement: enriched }
    }));
    return enriched;
  }

  function dismissPresent(repId, achievementId) {
    let state = loadState(repId);
    let rec = state.unlocked[achievementId];
    if (!rec) return null;
    rec.presentShown = true;
    saveState(repId, state);
    return enrichRecord(defById[achievementId], rec);
  }

  function markPresentShown(repId, achievementId) {
    return dismissPresent(repId, achievementId);
  }

  function nextPresentable(repId) {
    let unclaimed = getUnclaimedForRep(repId);
    let i;
    for (i = 0; i < unclaimed.length; i++) {
      if (!unclaimed[i].presentShown) return unclaimed[i];
    }
    return null;
  }

  injectAchievementStyles();

  window.CapMuseAchievements = {
    RARITY: RARITY,
    RARITY_ALIASES: RARITY_ALIASES,
    DEFINITIONS: DEFINITIONS,
    normalizeRarity: normalizeRarity,
    renderGemIcon: renderGemIcon,
    getDefinition: getDefinition,
    getAllForRep: getAllForRep,
    getClaimedForRep: getClaimedForRep,
    getUnclaimedForRep: getUnclaimedForRep,
    scan: scan,
    claim: claim,
    dismissPresent: dismissPresent,
    markPresentShown: markPresentShown,
    nextPresentable: nextPresentable,
    loadState: loadState
  };
})();
