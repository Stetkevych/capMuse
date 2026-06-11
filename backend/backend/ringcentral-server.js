require("dotenv").config();

const express = require("express");
const RingCentral = require("@ringcentral/sdk").SDK;

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

/* ── Server-side cache (5-min TTL) ─────────────────────────────── */
const summaryCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
  const e = summaryCache.get(key);
  if (!e || Date.now() - e.ts > CACHE_TTL_MS) { summaryCache.delete(key); return null; }
  return e.data;
}
function setCached(key, data) { summaryCache.set(key, { ts: Date.now(), data }); }

/* ── Parallel batch processing ──────────────────────────────────── */
/* 5 users × 2 RC calls = 10 concurrent calls per batch.
   RC heavy-group limit is 10 calls / 10 s, so we enforce an 11-second
   minimum window per batch so the limit always resets before the next batch. */
const BATCH_SIZE       = 1;     // one user at a time — eliminates any possibility of concurrent-call bursts
const BATCH_POST_MS    = 7000;  // 7s gap between users (RC heavy-group limit: 10 calls/10s)

/* If the same cache key is already being fetched, queue this request to wait for it */
const inFlightPromises = new Map();

async function processAllExtensions(extensions, start_date, end_date, days) {
  const users = [];
  const totalBatches = Math.ceil(extensions.length / BATCH_SIZE);
  for (let i = 0; i < extensions.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = extensions.slice(i, i + BATCH_SIZE);
    console.log(`[RC] batch ${batchNum}/${totalBatches}: ${batch.map(u => getDisplayName(u)).join(', ')}`);

    const results = await Promise.all(batch.map(async u => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          return await processExt(u, start_date, end_date, days);
        } catch (err) {
          if (isRateLimited(err) && attempt === 1) {
            console.warn(`[RC] rate-limited for "${getDisplayName(u)}", retry in 20s`);
            await sleep(20000);
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

async function fetchOutboundCalls(extensionId, start_date, end_date) {
  let allCalls = [];
  let page = 1;

  while (true) {
    const response = await platform.get(
      `/restapi/v1.0/account/~/extension/${extensionId}/call-log`,
      {
        dateFrom: rcDateStart(start_date),
        dateTo: rcDateEnd(end_date),
        direction: "Outbound",
        perPage: 1000,
        page,
      }
    );

    const data = await response.json();
    allCalls.push(...(data.records || []));

    if (!data.navigation?.nextPage) break;
    page++;
  }

  return allCalls;
}

async function fetchOutboundMessages(extensionId, start_date, end_date) {
  let allMessages = [];
  let page = 1;

  while (true) {
    const response = await platform.get(
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
async function processExt(user, start_date, end_date, days) {
  const name = getDisplayName(user);
  try {
    const [calls, outboundMsgs] = await Promise.all([
      fetchOutboundCalls(user.id, start_date, end_date),
      fetchOutboundMessages(user.id, start_date, end_date),
    ]);

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

/* ── Shared fetch logic (used by endpoint AND startup pre-fetch) ─── */
async function fetchAndCachePeriod(start_date, end_date) {
  const cacheKey = `${start_date}_${end_date}`;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  if (inFlightPromises.has(cacheKey)) {
    console.log(`[RC] coalescing onto in-flight: ${cacheKey}`);
    return inFlightPromises.get(cacheKey);
  }

  const fetchPromise = (async () => {
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

    setCached(cacheKey, result);
    inFlightPromises.delete(cacheKey);
    return result;
  })();

  inFlightPromises.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } catch (err) {
    inFlightPromises.delete(cacheKey);
    throw err;
  }
}

/* ── Endpoint ────────────────────────────────────────────────────── */
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

app.listen(PORT, () => {
  console.log(`RingCentral server running on port ${PORT}`);
});