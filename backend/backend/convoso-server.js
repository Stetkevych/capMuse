require("dotenv").config();
const express = require("express");

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

const PORT = process.env.CONVOSO_PORT || 8001;
const CONVOSO_AUTH_TOKEN      = process.env.CONVOSO_AUTH_TOKEN;
const CONVOSO_CALL_LOG_TOKEN  = (process.env.CONVOSO_CALL_LOG_API || "").trim();
const CONVOSO_BASE_URL =
  process.env.CONVOSO_BASE_URL || "https://api.convoso.com";

async function fetchConvosoData(endpoint, params = {}) {
  const url = `${CONVOSO_BASE_URL}${endpoint}`;

  console.log("Convoso URL:", url);
  console.log("Convoso Params:", params);

  const body = new URLSearchParams({
    auth_token: CONVOSO_AUTH_TOKEN,
    ...params,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const text = await res.text();

  console.log("Convoso status:", res.status);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Convoso did not return JSON: ${text.slice(0, 200)}`);
  }
}

function recordsFromConvoso(data) {
  let records = data.data || data.results || data.records || data.rows || [];

  if (!Array.isArray(records)) {
    records = Object.values(records);
  }

  return records;
}

function getUserCalls(records, targetUser) {
  const target = targetUser.trim().toLowerCase();

  for (const row of records) {
    const userName = String(row.name || row.user || "").trim();

    if (userName.toLowerCase() === target) {
      return {
        user: userName,
        user_id: String(row.user_id || ""),
        calls: Number(row.calls || 0),
      };
    }
  }

  return {
    user: targetUser,
    user_id: null,
    calls: 0,
  };
}

app.get("/", (req, res) => {
  res.json({
    status: "Convoso local server running",
    endpoints: {
      user_summary:      "/convoso/user-summary",
      all_users_summary: "/convoso/all-users-summary",
      call_log:          "/convoso/call-log",
    },
  });
});

app.post("/convoso/user-summary", async (req, res) => {
  try {
    const { user, start_date, end_date } = req.body;

    if (!user || !start_date || !end_date) {
      return res.status(400).json({
        error: "Missing user, start_date, or end_date",
      });
    }

    const statuses = [
      { key: "inst", status_ids: "inst" },
      { key: "ni",   status_ids: "NI"   },
      { key: "nc",   status_ids: "NC"   },
    ];

    const finalResult = {
      user,
      user_id: null,
      inst: 0,
      ni: 0,
      nc: 0,
    };

    for (const item of statuses) {
      const data = await fetchConvosoData("/v1/agent-performance/search", {
        date_start: `${start_date} 00:00:00`,
        date_end: `${end_date} 23:59:59`,
        status_ids: item.status_ids,
        call_type: "OUTBOUND",
      });

      const records = recordsFromConvoso(data);
      const userResult = getUserCalls(records, user);

      finalResult.user = userResult.user || finalResult.user;
      finalResult.user_id = userResult.user_id || finalResult.user_id;
      finalResult[item.key] = userResult.calls;
    }

    res.json(finalResult);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* Parse "HH:MM:SS" or "MM:SS" talk_sec strings from Convoso into total seconds */
function parseHMMSS(str) {
  if (!str) return 0;
  const parts = String(str).split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(str) || 0;
}

async function fetchAllRepPages(dateStart, dateEnd, statusId) {
  const users = {};
  let page = 1;
  let totalPages = null;

  while (true) {
    const data = await fetchConvosoData("/v1/agent-performance/search", {
      date_start: dateStart,
      date_end: dateEnd,
      status_ids: statusId,
      call_type: "OUTBOUND",
      page,
      per_page: 100,
    });

    const records = recordsFromConvoso(data);

    if (page === 1) {
      totalPages = data.total_pages || data.totalPages
        || (data.pagination && (data.pagination.total_pages || data.pagination.totalPages))
        || null;
    }

    for (const row of records) {
      const userId   = String(row.user_id || "").trim();
      const userName = String(row.name || row.user || "").trim();
      if (!userId || !userName) continue;
      if (/^deleted user/i.test(userName)) continue;
      if (!users[userId]) users[userId] = { user: userName, user_id: userId, calls: 0, connects: 0, talk_time: 0 };
      users[userId].calls     += Number(row.calls || 0);
      users[userId].connects  += Number(row.human_answered || row.connects || row.connect || row.num_connects || 0);
      users[userId].talk_time += parseHMMSS(row.talk_sec) || Number(row.talk_time || row.talktime || row.total_talk_time || 0);
    }

    if (records.length === 0) break;
    if (totalPages !== null && page >= totalPages) break;
    if (totalPages === null && records.length < 100) break;
    page++;
  }

  return users;
}

app.post("/convoso/all-users-summary", async (req, res) => {
  try {
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: "Missing start_date or end_date" });
    }

    const dateStart = `${start_date} 00:00:00`;
    const dateEnd   = `${end_date} 23:59:59`;

    const [instMap, niMap, ncMap] = await Promise.all([
      fetchAllRepPages(dateStart, dateEnd, "inst"),
      fetchAllRepPages(dateStart, dateEnd, "NI"),
      fetchAllRepPages(dateStart, dateEnd, "NC"),
    ]);

    const allIds = new Set([
      ...Object.keys(instMap),
      ...Object.keys(niMap),
      ...Object.keys(ncMap),
    ]);

    const users = {};
    for (const uid of allIds) {
      const instRow  = instMap[uid] || {};
      const niRow    = niMap[uid]   || {};
      const ncRow    = ncMap[uid]   || {};
      const userName = instRow.user || niRow.user || ncRow.user || "";
      if (!userName) continue;

      users[uid] = {
        user:     userName,
        user_id:  uid,
        inst:     instRow.calls     || 0,
        inst_con: instRow.connects  || 0,
        inst_tt:  instRow.talk_time || 0,
        ni:       niRow.calls       || 0,
        ni_con:   niRow.connects    || 0,
        ni_tt:    niRow.talk_time   || 0,
        nc:       ncRow.calls       || 0,
        nc_con:   ncRow.connects    || 0,
        nc_tt:    ncRow.talk_time   || 0,
      };
    }

    console.log(`[all-users-summary] ${Object.keys(users).length} reps merged`);

    res.json({
      start_date,
      end_date,
      count: Object.keys(users).length,
      users: Object.values(users).sort((a, b) => a.user.localeCompare(b.user)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* Debug: fetch raw page 1 for NI to inspect what Convoso actually returns */
app.get("/convoso/debug-ni", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = await fetchConvosoData("/v1/agent-performance/search", {
      date_start: `${today} 00:00:00`,
      date_end:   `${today} 23:59:59`,
      status_ids: "NI",
      call_type:  "OUTBOUND",
      page: 1,
      per_page: 10,
    });
    res.json({ note: "Raw Convoso response for NI query today", raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Debug: fetch ONE page with NO status filter to see all fields on each row */
app.get("/convoso/debug-raw", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = await fetchConvosoData("/v1/agent-performance/search", {
      date_start: `${today} 00:00:00`,
      date_end:   `${today} 23:59:59`,
      call_type:  "OUTBOUND",
      page: 1,
      per_page: 3,
    });
    res.json({ note: "Raw Convoso response with NO status_ids filter — shows all row fields", raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Debug: fetch one page with NO status filter to see what status_ids Convoso returns */
app.get("/convoso/debug-statuses", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const data  = await fetchConvosoData("/v1/agent-performance/search", {
      date_start: `2016-01-01 00:00:00`,
      date_end:   `${today} 23:59:59`,
      call_type:  "OUTBOUND",
      per_page:   50,
      page:       1,
    });
    const records = recordsFromConvoso(data);
    /* Collect every unique status_id / disposition value seen across rows */
    const statuses = {};
    for (const r of records) {
      const s = r.status_id ?? r.status ?? r.disposition ?? r.call_status ?? "(unknown)";
      statuses[String(s)] = (statuses[String(s)] || 0) + 1;
    }
    res.json({
      note: "These are the status_id values your Convoso account uses for OUTBOUND calls",
      unique_statuses: statuses,
      sample_records: records.slice(0, 3),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/convoso/call-log", async (req, res) => {
  try {
    const { start_date, end_date, agent, per_page = 100 } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: "Missing start_date or end_date" });
    }

    if (!CONVOSO_CALL_LOG_TOKEN) {
      return res.status(500).json({ error: "CONVOSO_CALL_LOG_API not set in .env" });
    }

    const allCalls = [];
    let page = 1;
    let totalPages = null;

    while (true) {
      const body = new URLSearchParams({
        auth_token: CONVOSO_CALL_LOG_TOKEN,
        date_start: `${start_date} 00:00:00`,
        date_end:   `${end_date} 23:59:59`,
        call_type:  "OUTBOUND",
        page,
        per_page,
        ...(agent ? { agent_name: agent } : {}),
      });

      const response = await fetch(`${CONVOSO_BASE_URL}/v1/calllogs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Convoso call log did not return JSON: ${text.slice(0, 200)}`);
      }

      if (page === 1) {
        console.log("[call-log] status:", response.status);
        console.log("[call-log] sample:", JSON.stringify((data.data || data.results || data.records || []).slice(0, 1)));
        totalPages = data.total_pages || data.totalPages
          || (data.pagination && (data.pagination.total_pages || data.pagination.totalPages))
          || null;
      }

      const records = data.data || data.results || data.records || data.rows || [];
      const arr = Array.isArray(records) ? records : Object.values(records);

      for (const call of arr) {
        allCalls.push({
          call_id:       call.id        || call.call_id       || null,
          agent:         call.agent_name || call.user          || call.agent || null,
          call_type:     call.call_type  || "OUTBOUND",
          disposition:   call.disposition || call.status       || null,
          duration:      Number(call.duration || call.talk_time || 0),
          date:          call.start_time  || call.date         || call.created_at || null,
          campaign:      call.campaign_name || call.campaign   || null,
          phone:         call.phone_number  || call.phone      || null,
        });
      }

      if (arr.length === 0) break;
      if (totalPages !== null && page >= totalPages) break;
      if (totalPages === null && arr.length < per_page) break;
      page++;
    }

    console.log(`[call-log] fetched ${allCalls.length} calls across ${page} page(s)`);

    res.json({
      start_date,
      end_date,
      count: allCalls.length,
      calls: allCalls,
    });
  } catch (err) {
    console.error("[call-log] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Convoso server running on http://127.0.0.1:${PORT}`);
});
