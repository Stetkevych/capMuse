require("dotenv").config();

const express = require("express");
const RingCentral = require("@ringcentral/sdk").SDK;

/* ── Upstash Redis (optional — falls back to in-memory if not configured) ── */
let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const { Redis } = require('@upstash/redis');
  redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  console.log('[Redis] Upstash connected');
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const PORT = process.env.PORT || 8002;

const rcsdk = new RingCentral({
  server: process.env.RC_SERVER,
  clientId: process.env.RiNGCENTRAL_CLIENT_ID,
  clientSecret: process.env.RiNGCENTRAL_CLIENT_SECRET,
});

const platform = rcsdk.platform();

let loginPromise = null;
async function login() {
  if (loginPromise) return loginPromise;
  loginPromise = platform.login({ jwt: process.env.RiNGCENTRAL_JWT })
    .catch(function (e) { loginPromise = null; throw e; });
  return loginPromise;
}


function formatSeconds(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;
}

function rcDateStart(date) {
  return `${date}T00:00:00-04:00`;
}

function rcDateEnd(date) {
  return `${date}T23:59:59-04:00`;
}

function getFullName(u) {
  return (
    u.name ||
    `${u.contact?.firstName || ""} ${u.contact?.lastName || ""}`.trim()
  );
}

/* Canonical list of 43 sales reps — only these extensions are fetched */
const SALES_REP_NAMES = new Set([
  'emilio arguello',    'nicholas orchano',   'alejndro manuel',
  'cielo gamarra',      'kevin cohen',        'nikholas lazo',
  'jason mcgory',       'john saldarriaga',   'daniel pineda',
  'anthony diaz',       'dominic basilio',    'frank padilla',
  'gimmy cipriani',     'evan kruer',         'blake fiorito',
  'kip langat',         'rio pampallona',     'jonathan montpeirous',
  'michael cifuentes',  'cristian pina',      'christian quintana',
  "colin o'bryan",      'jay johnson',        'doyle knodel',
  'olivia demarco',     'matthew mejia',      'erik anderson',
  'steven chatfield',   'andy rondon',        'joseph hernandez',
  'ivan ortega',        'ray ortega',         'rodney rabah',
  'richard calderin',   'kevin mcmanus',      'jasmin meza',
  'guillermo loaiza',   'cristopher argueta', 'gabriel sulca',
  'vanessa fernandez',  'brandon gebauer',    'lorenzo podolla',
  'andy balou',
]);

/* Display-name overrides for RC typos */
const DISPLAY_NAMES = { 'alejndro manuel': 'Alejandro Manuel' };

function getDisplayName(u) {
  const name = getFullName(u);
  return DISPLAY_NAMES[name.toLowerCase()] || name;
}

function isRateLimited(err) {
  const msg = String(err && (err.message || err) || '').toLowerCase();
  return msg.includes('rate exceeded') || msg.includes('rate limit') ||
         msg.includes('cmn-301') || msg.includes('429') || msg.includes('too many');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Global RC API serial queue ─────────────────────────────────────
   ALL calls to platform.get() go through here — one at a time, 4.5s apart.
   Gap is 4.5s (not 2.5s) so that Render's rolling deploy (2 overlapping
   processes) still stays well under RC's 10 calls/10s heavy-group limit. */
let _rcQueue = Promise.resolve();
function rcGet(path, params) {
  let resolve, reject;
  const result = new Promise((res, rej) => { resolve = res; reject = rej; });
  _rcQueue = _rcQueue.then(async () => {
    try   { resolve(await platform.get(path, params)); }
    catch (e) { reject(e); }
    await sleep(4500);
  });
  return result;
}

/* ── Server-side cache ───────────────────────────────────────────── */
const summaryCache   = new Map();
const CACHE_TTL_MS   = 5  * 60 * 1000;  // trigger background refresh after 5 min
const CACHE_STALE_MS = 30 * 60 * 1000;  // serve stale for up to 30 min

function isPastRange(key) {
  const today = new Date().toISOString().split('T')[0];
  return key.split('_')[1] < today; // end_date is before today → historical, never changes
}

async function getCacheEntry(key) {
  if (redis) {
    try {
      const e = await redis.get(`rc:${key}`);
      if (e) { summaryCache.set(key, e); return e; } // warm in-memory
    } catch (err) { console.error('[Redis] get error:', err.message); }
  }
  const e = summaryCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_STALE_MS) { summaryCache.delete(key); return null; }
  return e;
}

async function setCached(key, data) {
  const entry = { ts: Date.now(), data };
  summaryCache.set(key, entry);
  if (redis) {
    try {
      if (isPastRange(key)) {
        await redis.set(`rc:${key}`, entry);            // historical — store permanently
      } else {
        await redis.set(`rc:${key}`, entry, { ex: 7200 }); // rolling — expire after 2h
      }
    } catch (err) { console.error('[Redis] set error:', err.message); }
  }
}

async function loadCacheFromRedis() {
  if (!redis) return;
  try {
    const keys = await redis.keys('rc:*');
    if (!keys.length) { console.log('[Redis] no cached data found'); return; }
    for (const key of keys) {
      const entry = await redis.get(key);
      if (entry) summaryCache.set(key.replace('rc:', ''), entry);
    }
    console.log(`[Redis] loaded ${keys.length} cache entries on startup`);
  } catch (err) { console.error('[Redis] load error:', err.message); }
}

/* ── Batch processing ────────────────────────────────────────────── */
const BATCH_SIZE    = 1;  // one user at a time
const BATCH_POST_MS = 0;  // no extra gap — rcGet's 4.5s covers rate limiting globally

/* If the same cache key is already being fetched, queue this request to wait for it */
const inFlightPromises = new Map();


async function processAllExtensions(extensions, start_date, end_date, days) {
  // One account-level call gets ALL reps' calls — replaces 43 individual calls
  console.log(`[RC] bulk fetching all outbound calls for ${start_date}→${end_date}`);
  const allCallsByExt = await fetchAllOutboundCalls(start_date, end_date);

  const users = [];
  const totalBatches = Math.ceil(extensions.length / BATCH_SIZE);
  for (let i = 0; i < extensions.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = extensions.slice(i, i + BATCH_SIZE);
    console.log(`[RC] batch ${batchNum}/${totalBatches}: ${batch.map(u => getDisplayName(u)).join(', ')}`);

    const results = await Promise.all(batch.map(async u => {
      const prefetchedCalls = allCallsByExt.get(String(u.id)) || [];
      const backoffs = [20000, 40000, 60000];
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          return await processExt(u, start_date, end_date, days, prefetchedCalls);
        } catch (err) {
          if (isRateLimited(err) && attempt <= 3) {
            const wait = backoffs[attempt - 1];
            console.warn(`[RC] rate-limited for "${getDisplayName(u)}", retry ${attempt}/3 in ${wait/1000}s`);
            await sleep(wait);
          } else {
            console.error(`[RC] error for "${getDisplayName(u)}":`, err.message);
            return zeroRow(u);
          }
        }
      }
      return zeroRow(u);
    }));

    users.push(...results);

    /* Sleep AFTER the batch completes so all RC calls are >10s old before the next batch */
    if (i + BATCH_SIZE < extensions.length) {
      await sleep(BATCH_POST_MS);
    }
  }
  return users;
}

async function findRingCentralUser(user) {
  const response = await platform.get("/restapi/v1.0/account/~/extension", {
    perPage: 1000,
  });

  const data = await response.json();

  return (data.records || []).find((u) => {
    const fullName = getFullName(u);
    return fullName.toLowerCase().includes(user.toLowerCase());
  });
}

/* Fetch ALL reps' outbound calls in one account-level API call, grouped by extensionId */
async function fetchAllOutboundCalls(start_date, end_date) {
  const callsByExt = new Map();
  let page = 1;
  let total = 0;

  while (true) {
    const response = await rcGet('/restapi/v1.0/account/~/call-log', {
      dateFrom: rcDateStart(start_date),
      dateTo:   rcDateEnd(end_date),
      direction: 'Outbound',
      type:      'Voice',
      perPage:   1000,
      page,
    });

    const data = await response.json();
    for (const record of (data.records || [])) {
      const extId = String(record.from?.extensionId || '');
      if (!extId) continue;
      if (!callsByExt.has(extId)) callsByExt.set(extId, []);
      callsByExt.get(extId).push(record);
      total++;
    }

    if (!data.navigation?.nextPage) break;
    page++;
  }

  console.log(`[RC] bulk call-log: ${page} page(s), ${total} calls across all reps`);
  return callsByExt;
}

async function fetchOutboundMessages(extensionId, start_date, end_date) {
  let allMessages = [];
  let page = 1;

  while (true) {
    const response = await rcGet(
      `/restapi/v1.0/account/~/extension/${extensionId}/message-store`,
      {
        dateFrom: rcDateStart(start_date),
        dateTo: rcDateEnd(end_date),
        direction: "Outbound",
        availability: "Alive",
        perPage: 1000,
        page,
      }
    );

    const data = await response.json();

    const messages = (data.records || []).filter((m) =>
      ["SMS", "MMS", "Pager", "Text"].includes(m.type)
    );

    allMessages.push(...messages);

    if (!data.navigation?.nextPage) break;
    page++;
  }

  return allMessages;
}

async function fetchTotalMessages(extensionId, start_date, end_date) {
  let allMessages = [];
  let page = 1;

  while (true) {
    const response = await platform.get(
      `/restapi/v1.0/account/~/extension/${extensionId}/message-store`,
      {
        dateFrom: rcDateStart(start_date),
        dateTo: rcDateEnd(end_date),
        availability: "Alive",
        perPage: 1000,
        page,
      }
    );

    const data = await response.json();

    const messages = (data.records || []).filter((m) =>
      ["SMS", "MMS", "Pager", "Text"].includes(m.type)
    );

    allMessages.push(...messages);

    if (!data.navigation?.nextPage) break;
    page++;
  }

  return allMessages;
}

app.post("/ringcentral/analytics-summary", async (req, res) => {
  try {
    const { user, start_date, end_date } = req.body;

    if (!user || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "user, start_date, end_date required",
      });
    }

    await login();

    const foundUser = await findRingCentralUser(user);

    if (!foundUser) {
      return res.json({
        success: false,
        message: `User not found: ${user}`,
      });
    }

    const allCalls = await fetchOutboundCalls(
      foundUser.id,
      start_date,
      end_date
    );

    const allMessages = await fetchOutboundMessages(
      foundUser.id,
      start_date,
      end_date
    );

    const outboundCalls = allCalls.length;
    const outboundMessages = allMessages.length;

    const totalHandleSeconds = allCalls.reduce(
      (sum, c) => sum + (c.duration || 0),
      0
    );

    const avgHandleSeconds =
      outboundCalls > 0 ? Math.round(totalHandleSeconds / outboundCalls) : 0;

    const days =
      (new Date(`${end_date}T00:00:00`) -
        new Date(`${start_date}T00:00:00`)) /
        (1000 * 60 * 60 * 24) +
      1;

    res.json({
      user: getFullName(foundUser),
      extension: foundUser.extensionNumber,

      outbound_calls: outboundCalls,
      avg_calls_per_day: Number((outboundCalls / days).toFixed(1)),

      outbound_messages: outboundMessages,
      avg_messages_per_day: Number((outboundMessages / days).toFixed(1)),

      total_outbound_activity: outboundCalls + outboundMessages,
      avg_total_activity_per_day: Number(
        ((outboundCalls + outboundMessages) / days).toFixed(1)
      ),

      avg_handle_time_seconds: avgHandleSeconds,
      avg_handle_time: formatSeconds(avgHandleSeconds),
    });
  } catch (err) {
    console.error("ANALYTICS SUMMARY ERROR:", err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

function zeroRow(user) {
  return {
    user: getDisplayName(user), extension: user.extensionNumber,
    outbound_calls: 0, avg_calls_per_day: 0,
    connects: 0, pitch: 0,
    outbound_messages: 0, avg_messages_per_day: 0,
    total_outbound_activity: 0, avg_total_activity_per_day: 0,
    avg_handle_time_seconds: 0, avg_handle_time: '00:00',
  };
}

/* Compute stats for one extension — re-throws rate-limit errors; returns zeros on other errors */
async function processExt(user, start_date, end_date, days, prefetchedCalls = null) {
  const name = getDisplayName(user);
  try {
    const calls        = prefetchedCalls ?? await fetchOutboundCalls(user.id, start_date, end_date);
    const outboundMsgs = await fetchOutboundMessages(user.id, start_date, end_date);

    const outboundCalls    = calls.length;
    const connects         = calls.filter(c => (c.duration || 0) > 0).length;
    const pitch            = calls.filter(c => (c.duration || 0) > 45).length;
    const totalHandleSecs  = calls.reduce((s, c) => s + (c.duration || 0), 0);
    const avgHandleSecs    = outboundCalls > 0 ? Math.round(totalHandleSecs / outboundCalls) : 0;
    const outboundMessages = outboundMsgs.length;

    return {
      user:                       name,
      extension:                  user.extensionNumber,
      outbound_calls:             outboundCalls,
      avg_calls_per_day:          Number((outboundCalls    / days).toFixed(1)),
      connects:                   connects,
      pitch:                      pitch,
      avg_handle_time_seconds:    avgHandleSecs,
      avg_handle_time:            formatSeconds(avgHandleSecs),
      outbound_messages:          outboundMessages,
      avg_messages_per_day:       Number((outboundMessages / days).toFixed(1)),
      total_outbound_activity:    outboundCalls + outboundMessages,
      avg_total_activity_per_day: Number(((outboundCalls + outboundMessages) / days).toFixed(1)),
    };
  } catch (err) {
    if (isRateLimited(err)) throw err; // outer loop will retry with backoff
    console.error(`RC processExt error (${name}):`, err.message);
    return zeroRow(user);
  }
}

/* ── Core fetch (deduplicates concurrent requests via inFlightPromises) ── */
async function doFetch(start_date, end_date) {
  const cacheKey = `${start_date}_${end_date}`;

  if (inFlightPromises.has(cacheKey)) {
    console.log(`[RC] coalescing onto in-flight: ${cacheKey}`);
    return inFlightPromises.get(cacheKey);
  }

  const fetchPromise = (async () => {
    try {
      await login();
      const extResp = await platform.get("/restapi/v1.0/account/~/extension", {
        perPage: 1000, type: "User", status: "Enabled",
      });
      const extData = await extResp.json();
      const extensions = (extData.records || []).filter(u =>
        SALES_REP_NAMES.has(getFullName(u).toLowerCase())
      );
      const days =
        (new Date(`${end_date}T00:00:00`) - new Date(`${start_date}T00:00:00`)) /
        (1000 * 60 * 60 * 24) + 1;

      console.log(`[RC] fetching ${start_date} → ${end_date} · ${extensions.length} users`);

      const allUsers = await processAllExtensions(extensions, start_date, end_date, days);
      const sorted   = allUsers.sort((a, b) => a.user.localeCompare(b.user));
      const result   = { start_date, end_date, count: sorted.length, users: sorted };

      await setCached(cacheKey, result);
      return result;
    } finally {
      inFlightPromises.delete(cacheKey);
    }
  })();

  inFlightPromises.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/* ── Stale-while-revalidate: serve cached data immediately (up to 30 min
   old), kick off background refresh when older than 5 min ─────────── */
async function fetchAndCachePeriod(start_date, end_date) {
  const cacheKey = `${start_date}_${end_date}`;
  const entry    = await getCacheEntry(cacheKey);

  if (entry) {
    const age = Date.now() - entry.ts;
    if (age > CACHE_TTL_MS && !inFlightPromises.has(cacheKey)) {
      console.log(`[RC] SWR: ${Math.round(age / 60000)}min-old cache for ${cacheKey}, refreshing in background`);
      doFetch(start_date, end_date).catch(err =>
        console.error(`[RC] SWR background refresh failed ${cacheKey}:`, err.message)
      );
    }
    return entry.data;  // serve immediately (fresh or stale)
  }

  return doFetch(start_date, end_date);  // no cache at all — must wait
}

/* ── Scheduled pre-fetch (warms cache for common date ranges) ─────── */
function getPreFetchRanges() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(now);

  const d7 = new Date(now); d7.setDate(d7.getDate() - 6);

  const dow = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));

  const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;

  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);

  return [
    [today,          today],        // today
    [fmt(yesterday), fmt(yesterday)], // yesterday
    [fmt(d7),        today],        // last 7 days
    [fmt(mon),       today],        // this week (Mon–today)
    [monthStart,     today],        // this month
  ];
}

/* ── Historical months pre-fetch (run once, stored permanently in Redis) ── */
function getCompletedMonths() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const months = [];
  for (let m = 0; m < now.getMonth(); m++) {
    const start = `${now.getFullYear()}-${pad(m + 1)}-01`;
    const lastDay = new Date(now.getFullYear(), m + 1, 0).getDate();
    const end = `${now.getFullYear()}-${pad(m + 1)}-${pad(lastDay)}`;
    months.push([start, end]);
  }
  return months;
}

async function preloadHistoricalMonths() {
  const months = getCompletedMonths();
  if (!months.length) return;
  console.log(`[RC] checking ${months.length} historical months`);
  for (const [start, end] of months) {
    const key = `${start}_${end}`;
    const cached = await getCacheEntry(key);
    if (cached) { console.log(`[RC] historical ${start}→${end} already cached`); continue; }
    console.log(`[RC] pre-loading historical month ${start}→${end}`);
    try {
      await doFetch(start, end);
    } catch (err) {
      console.error(`[RC] historical month error ${start}→${end}:`, err.message);
    }
  }
  console.log('[RC] historical months complete');
}

async function runScheduledPreFetch() {
  console.log('[RC] scheduled pre-fetch starting');
  for (const [start_date, end_date] of getPreFetchRanges()) {
    const cacheKey = `${start_date}_${end_date}`;
    if (inFlightPromises.has(cacheKey)) {
      console.log(`[RC] pre-fetch skipping ${cacheKey} (already in-flight)`);
      continue;
    }
    const entry = summaryCache.get(cacheKey);
    if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
      console.log(`[RC] pre-fetch skipping ${cacheKey} (still fresh)`);
      continue;
    }
    try {
      console.log(`[RC] pre-fetching ${start_date} → ${end_date}`);
      await doFetch(start_date, end_date);
    } catch (err) {
      console.error(`[RC] pre-fetch error ${start_date}→${end_date}:`, err.message);
    }
  }
  console.log('[RC] scheduled pre-fetch complete');
}


/* ── Endpoints ───────────────────────────────────────────────────── */
app.get("/health", (req, res) => res.json({ status: "ok", cached: summaryCache.size }));

app.post("/ringcentral/all-users-summary", async (req, res) => {
  try {
    const { start_date, end_date, force } = req.body;
    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, message: "start_date and end_date required" });
    }

    if (force) {
      summaryCache.delete(`${start_date}_${end_date}`);
      inFlightPromises.delete(`${start_date}_${end_date}`);
    }

    const result = await fetchAndCachePeriod(start_date, end_date);
    res.json(result);
  } catch (err) {
    console.error("RC all-users-summary ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`RingCentral server running on port ${PORT}`);

  // Load Redis cache into memory immediately — instant page loads right away
  await loadCacheFromRedis();

  // Start RC API fetches 30s after startup
  setTimeout(() => {
    runScheduledPreFetch().catch(err => console.error('[RC] pre-fetch crash:', err));
    preloadHistoricalMonths().catch(err => console.error('[RC] historical months crash:', err));
    setInterval(() => {
      runScheduledPreFetch().catch(err => console.error('[RC] scheduled pre-fetch crash:', err));
    }, 25 * 60 * 1000);
  }, 30_000);
});