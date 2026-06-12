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

const PORT = process.env.CONVOSO_PORT || 8000;
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

function extractRecords(data) {
  if (Array.isArray(data)) return data;
  const raw =
    data.data      || data.results  || data.records ||
    data.rows      || data.campaigns || data.lists   || [];
  return Array.isArray(raw) ? raw : Object.values(raw);
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

function parseHMMSS(str) {
  if (!str) return 0;
  const parts = String(str).split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(str) || 0;
}

async function fetchAllRepPages(dateStart, dateEnd, statusId, extraParams = {}) {
  const users = {};
  let page = 1;
  let totalPages = null;

  while (true) {
    const data = await fetchConvosoData("/v1/agent-performance/search", {
      date_start: dateStart,
      date_end: dateEnd,
      ...(statusId ? { status_ids: statusId } : {}),
      call_type: "OUTBOUND",
      ...extraParams,
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
      if (!users[userId]) users[userId] = { user: userName, user_id: userId, calls: 0, connects: 0, talk_time: 0, pause_time: 0, wait_time: 0, wrap_time: 0, total_time: 0 };
      const t_talk  = parseHMMSS(row.talk_sec)  || Number(row.talk_time  || row.talktime || row.total_talk_time || 0);
      const t_pause = parseHMMSS(row.pause_sec) || Number(row.pause_time || row.agent_pause_time || row.on_pause_sec || row.total_pause || 0);
      const t_wait  = parseHMMSS(row.wait_sec)  || Number(row.wait_time  || row.hold_time   || row.on_hold_sec  || 0);
      const t_wrap  = parseHMMSS(row.wrap_sec)  || Number(row.wrap_time  || row.wrapup_time || row.acw_time     || row.after_call_work || row.disposition_sec || 0);
      const t_total = parseHMMSS(row.total_time) || (t_talk + t_wait + t_pause + t_wrap);
      users[userId].calls      += Number(row.calls || 0);
      users[userId].connects   += Number(row.human_answered || row.connects || row.connect || row.num_connects || 0);
      users[userId].talk_time  += t_talk;
      users[userId].pause_time += t_pause;
      users[userId].wait_time  += t_wait;
      users[userId].wrap_time  += t_wrap;
      users[userId].total_time += t_total;
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
    const { start_date, end_date, campaign_id } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: "Missing start_date or end_date" });
    }

    const dateStart = `${start_date} 00:00:00`;
    const dateEnd   = `${end_date} 23:59:59`;
    const extraParams = {};
    if (campaign_id) extraParams.campaign_id = campaign_id;

    const [instMap, niMap, ncMap, inboundMap, manualMap, allOutboundMap] = await Promise.all([
      fetchAllRepPages(dateStart, dateEnd, "inst",  extraParams),
      fetchAllRepPages(dateStart, dateEnd, "NI",    extraParams),
      fetchAllRepPages(dateStart, dateEnd, "NC",    extraParams),
      fetchAllRepPages(dateStart, dateEnd, null,    { ...extraParams, call_type: "INBOUND" }),
      fetchAllRepPages(dateStart, dateEnd, null,    { ...extraParams, call_type: "MANUAL"  }),
      fetchAllRepPages(dateStart, dateEnd, null,    extraParams),
    ]);

    const allIds = new Set([
      ...Object.keys(instMap),
      ...Object.keys(niMap),
      ...Object.keys(ncMap),
      ...Object.keys(inboundMap),
      ...Object.keys(manualMap),
      ...Object.keys(allOutboundMap),
    ]);

    const users = {};
    for (const uid of allIds) {
      const instRow        = instMap[uid]        || {};
      const niRow          = niMap[uid]          || {};
      const ncRow          = ncMap[uid]          || {};
      const inboundRow     = inboundMap[uid]     || {};
      const manualRow      = manualMap[uid]      || {};
      const allOutboundRow = allOutboundMap[uid] || {};
      const userName = instRow.user || niRow.user || ncRow.user || inboundRow.user || manualRow.user || allOutboundRow.user || "";
      if (!userName) continue;

      users[uid] = {
        user:       userName,
        user_id:    uid,
        inst:       instRow.calls      || 0,
        inst_con:   instRow.connects   || 0,
        inst_tt:    instRow.talk_time  || 0,
        inst_pt:    instRow.pause_time || 0,
        inst_wt:    instRow.wait_time  || 0,
        inst_wr:    instRow.wrap_time  || 0,
        ni:         niRow.calls        || 0,
        ni_con:     niRow.connects     || 0,
        ni_tt:      niRow.talk_time    || 0,
        ni_pt:      niRow.pause_time   || 0,
        ni_wt:      niRow.wait_time    || 0,
        ni_wr:      niRow.wrap_time    || 0,
        nc:         ncRow.calls        || 0,
        nc_con:     ncRow.connects     || 0,
        nc_tt:      ncRow.talk_time    || 0,
        nc_pt:      ncRow.pause_time   || 0,
        nc_wt:      ncRow.wait_time    || 0,
        nc_wr:      ncRow.wrap_time    || 0,
        total_time:     (instRow.total_time || 0) + (niRow.total_time || 0) + (ncRow.total_time || 0),
        outbound_con:   allOutboundRow.connects || 0,
        inbound_calls:  inboundRow.calls     || 0,
        inbound_tt:     inboundRow.talk_time || 0,
        manual_calls:   manualRow.calls      || 0,
        manual_tt:      manualRow.talk_time  || 0,
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

app.get("/convoso/debug-time-fields", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0, 10);
    const raw = await fetchConvosoData("/v1/agent-performance/search", {
      date_start: `${sevenDaysAgo} 00:00:00`,
      date_end:   `${today} 23:59:59`,
      call_type:  "OUTBOUND",
      page: 1, per_page: 5,
    });
    const records = extractRecords(raw);
    const timeKeys = ['talk_sec','pause_sec','wait_sec','wrap_sec','hold_sec',
                      'talk_time','pause_time','wait_time','wrap_time','hold_time',
                      'total_time','acw_time','after_call_work','wrapup_time',
                      'disposition_sec','on_hold_sec','agent_pause_time'];
    const sample = records.slice(0,5).map(function(r){
      var out = { user: r.user_name||r.username||r.user };
      timeKeys.forEach(function(k){ if(r[k] !== undefined) out[k] = r[k]; });
      return out;
    });
    res.json({ note:"Time fields actually returned by Convoso — use this to verify wait/wrap field names", sample });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

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

app.get("/convoso/debug-talktime", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const results = {};
    for (const sid of ["inst", "NI", "NC"]) {
      const raw = await fetchConvosoData("/v1/agent-performance/search", {
        date_start: `${today} 00:00:00`,
        date_end:   `${today} 23:59:59`,
        status_ids: sid,
        call_type:  "OUTBOUND",
        page: 1,
        per_page: 5,
      });
      const records = recordsFromConvoso(raw);
      results[sid] = records.slice(0, 5).map(r => ({
        name:            r.name || r.user,
        calls:           r.calls,
        talk_sec_raw:    r.talk_sec,
        talk_sec_parsed: parseHMMSS(r.talk_sec),
        human_answered:  r.human_answered,
      }));
    }
    res.json({ note: "talk_sec raw vs parsed per disposition (today)", results });
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
          call_id:     call.id        || call.call_id       || null,
          agent:       call.agent_name || call.user          || call.agent || null,
          call_type:   call.call_type  || "OUTBOUND",
          disposition: call.disposition || call.status       || null,
          duration:    Number(call.duration || call.talk_time || 0),
          date:        call.start_time  || call.date         || call.created_at || null,
          campaign:    call.campaign_name || call.campaign   || null,
          phone:       call.phone_number  || call.phone      || null,
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

async function fetchConvosoGet(endpoint, params = {}) {
  const searchParams = new URLSearchParams({ auth_token: CONVOSO_AUTH_TOKEN, ...params });
  const url = `${CONVOSO_BASE_URL}${endpoint}?${searchParams}`;
  console.log("Convoso GET:", url);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  try { return { ok: true, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: false, status: res.status, error: text.slice(0, 300) }; }
}

async function fetchCampaignList() {
  const paths = [
    "/v1/campaign",
    "/v1/campaigns",
    "/v1/campaign/list",
    "/v1/campaigns/list",
    "/v1/campaign/search",
  ];

  for (const path of paths) {
    // Try GET first, then POST
    for (const method of ["GET", "POST"]) {
      try {
        let data;
        if (method === "GET") {
          const r = await fetchConvosoGet(path, {});
          if (!r.ok || !r.data) continue;
          data = r.data;
        } else {
          data = await fetchConvosoData(path, {});
        }
        const records = extractRecords(data);
        const campaigns = records
          .map(c => ({ id: String(c.id || c.campaign_id || ""), name: c.name || c.campaign_name || c.title || "" }))
          .filter(c => c.id && c.name);
        if (campaigns.length > 0) {
          console.log(`[campaigns] found ${campaigns.length} via ${method} ${path}`);
          return { campaigns, path, method };
        }
      } catch (e) {
        console.log(`[campaigns] ${method} ${path} error: ${e.message}`);
      }
    }
  }
  return { campaigns: [], path: null, method: null };
}

app.get("/convoso/campaigns", async (req, res) => {
  try {
    const { campaigns } = await fetchCampaignList();
    res.json({ campaigns });
  } catch (err) {
    console.error("[campaigns]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/convoso/debug-campaigns", async (req, res) => {
  try {
    const paths = ["/v1/campaign", "/v1/campaigns", "/v1/campaign/list", "/v1/campaigns/list", "/v1/campaign/search"];
    const results = {};
    for (const path of paths) {
      for (const method of ["GET", "POST"]) {
        const key = `${method} ${path}`;
        try {
          let data;
          if (method === "GET") {
            const r = await fetchConvosoGet(path, {});
            results[key] = { status: r.status, ok: r.ok, keys: r.data ? Object.keys(r.data) : null, records_count: r.data ? extractRecords(r.data).length : 0, sample: r.data ? extractRecords(r.data).slice(0,2) : null, error: r.error };
            continue;
          } else {
            data = await fetchConvosoData(path, {});
          }
          const records = extractRecords(data);
          results[key] = { keys: Object.keys(data), records_count: records.length, sample: records.slice(0, 2) };
        } catch (e) {
          results[key] = { error: e.message };
        }
      }
    }
    res.json({ note: "Probing all known Convoso campaign paths", results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/convoso/debug-campaign-filter", async (req, res) => {
  try {
    const { campaign_id } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const withFilter = await fetchConvosoData("/v1/agent-performance/search", {
      date_start: `${today} 00:00:00`, date_end: `${today} 23:59:59`,
      call_type: "OUTBOUND", status_ids: "inst",
      ...(campaign_id ? { campaign_id } : {}),
      page: 1, per_page: 5,
    });
    const noFilter = await fetchConvosoData("/v1/agent-performance/search", {
      date_start: `${today} 00:00:00`, date_end: `${today} 23:59:59`,
      call_type: "OUTBOUND", status_ids: "inst",
      page: 1, per_page: 5,
    });
    const wRecords = recordsFromConvoso(withFilter);
    const nRecords = recordsFromConvoso(noFilter);
    res.json({
      note: "Pass ?campaign_id=X to test filtering",
      campaign_id_tested: campaign_id || "(none — use ?campaign_id=X)",
      with_filter_count:  withFilter.total_count || withFilter.total || wRecords.length,
      no_filter_count:    noFilter.total_count   || noFilter.total   || nRecords.length,
      with_filter_sample: wRecords.slice(0, 3).map(r => ({ name: r.name, calls: r.calls })),
      no_filter_sample:   nRecords.slice(0, 3).map(r => ({ name: r.name, calls: r.calls })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/convoso/rep-history", async (req, res) => {
  try {
    const { user_id, start_date, end_date, campaign_id } = req.body;
    if (!user_id || !start_date || !end_date) {
      return res.status(400).json({ error: "Missing user_id, start_date, or end_date" });
    }

    const startDt  = new Date(start_date);
    const endDt    = new Date(end_date);
    const diffDays = Math.ceil((endDt - startDt) / 86400000) + 1;
    const MON      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const periods  = [];

    if (diffDays <= 14) {
      for (let d = new Date(startDt); d <= endDt; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue; // skip Sun/Sat
        const s = d.toISOString().slice(0, 10);
        periods.push({ start: s, end: s, label: MON[d.getMonth()] + ' ' + d.getDate() });
      }
    } else if (diffDays <= 90) {
      for (let d = new Date(startDt); d <= endDt; d.setDate(d.getDate() + 7)) {
        const wS = new Date(d), wE = new Date(d);
        wE.setDate(wE.getDate() + 6);
        if (wE > endDt) wE.setTime(endDt.getTime());
        periods.push({ start: wS.toISOString().slice(0,10), end: wE.toISOString().slice(0,10), label: MON[wS.getMonth()] + ' ' + wS.getDate() });
      }
    } else {
      for (let d = new Date(startDt.getFullYear(), startDt.getMonth(), 1); d <= endDt; d.setMonth(d.getMonth() + 1)) {
        const mS = new Date(d), mE = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        if (mE > endDt) mE.setTime(endDt.getTime());
        periods.push({ start: mS.toISOString().slice(0,10), end: mE.toISOString().slice(0,10), label: MON[mS.getMonth()] + " '" + String(mS.getFullYear()).slice(2) });
      }
    }

    const extraParams = {};
    if (campaign_id) extraParams.campaign_id = campaign_id;

    const results = [];
    const BATCH = 3;
    for (let i = 0; i < periods.length; i += BATCH) {
      const batchOut = await Promise.all(periods.slice(i, i + BATCH).map(async (p) => {
        const ds = `${p.start} 00:00:00`, de = `${p.end} 23:59:59`;
        const [iMap, nMap, cMap] = await Promise.all([
          fetchAllRepPages(ds, de, "inst", extraParams),
          fetchAllRepPages(ds, de, "NI",   extraParams),
          fetchAllRepPages(ds, de, "NC",   extraParams),
        ]);
        const ir = iMap[user_id] || {}, nr = nMap[user_id] || {}, cr = cMap[user_id] || {};
        return {
          label:           p.label,
          inst:            (ir.calls      || 0),
          ni:              (nr.calls      || 0),
          nc:              (cr.calls      || 0),
          total_calls:     (ir.calls      || 0) + (nr.calls      || 0) + (cr.calls      || 0),
          inst_talk_time:  (ir.talk_time  || 0),
          contacts:        (ir.connects   || 0) + (nr.connects   || 0) + (cr.connects   || 0),
          talk_time:       (ir.talk_time  || 0) + (nr.talk_time  || 0) + (cr.talk_time  || 0),
          pause_time:      (ir.pause_time || 0) + (nr.pause_time || 0) + (cr.pause_time || 0),
          total_time:      (ir.total_time || 0) + (nr.total_time || 0) + (cr.total_time || 0),
        };
      }));
      results.push(...batchOut);
    }

    console.log(`[rep-history] ${results.length} periods for user ${user_id}`);
    res.json({ user_id, periods: results });
  } catch (err) {
    console.error("[rep-history]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Microsoft Graph / Newsletter ───────────────────────────────────────────

const OUTLOOK_TENANT_ID     = process.env.OUTLOOK_TENANT_ID;
const OUTLOOK_CLIENT_ID     = process.env.OUTLOOK_CLIENT_ID;
const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET;
const OUTLOOK_USER_EMAIL    = process.env.OUTLOOK_USER_EMAIL || 'capmuse@capital-infusion.com';
const GRAPH_BASE            = 'https://graph.microsoft.com/v1.0';

let _graphTokenCache = null;

async function getGraphToken() {
  if (_graphTokenCache && _graphTokenCache.expiresAt > Date.now() + 60000) {
    return _graphTokenCache.token;
  }
  if (!OUTLOOK_TENANT_ID || !OUTLOOK_CLIENT_ID || !OUTLOOK_CLIENT_SECRET) {
    throw new Error('Microsoft Graph credentials not configured (OUTLOOK_TENANT_ID, OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET)');
  }
  const url = `https://login.microsoftonline.com/${OUTLOOK_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id:     OUTLOOK_CLIENT_ID,
    client_secret: OUTLOOK_CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  });
  const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await res.json();
  if (!data.access_token) throw new Error('Graph token error: ' + JSON.stringify(data));
  _graphTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

function normalizeContentId(cid) {
  return String(cid || '').replace(/^<|>$/g, '').trim();
}

function embedInlineImages(html, attachments) {
  if (!html || !attachments || !attachments.length) return html;
  let out = html;
  attachments.forEach(function (att) {
    if (!att || !att.contentBytes) return;
    let cid = normalizeContentId(att.contentId);
    if (!cid) return;
    let mime = att.contentType || 'image/png';
    let dataUri = 'data:' + mime + ';base64,' + att.contentBytes;
    let escaped = cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('cid:' + escaped, 'gi'), dataUri);
    out = out.replace(new RegExp('cid:&lt;' + escaped + '&gt;', 'gi'), dataUri);
    let cidBase = cid.split('@')[0];
    if (cidBase && cidBase !== cid) {
      let baseEsc = cidBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp('cid:' + baseEsc + '(?:@[^"\'\\s>]*)?', 'gi'), dataUri);
    }
  });
  return out;
}

async function fetchMessageAttachments(token, messageId) {
  let url = GRAPH_BASE + '/users/' + OUTLOOK_USER_EMAIL + '/messages/' + messageId + '/attachments?$top=40';
  let res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  let data = await res.json();
  if (!res.ok) {
    console.warn('[newsletter] attachments error for', messageId, data);
    return [];
  }
  return (data.value || []).filter(function (att) {
    return att && att.contentBytes && (att.isInline || att.contentId);
  });
}

function mapGraphEmail(e, bodyHtml) {
  let bodyType = e.body && String(e.body.contentType || '').toLowerCase() === 'html' ? 'html' : 'text';
  return {
    id:       e.id,
    subject:  e.subject || '(No subject)',
    sender:   (e.from && e.from.emailAddress && e.from.emailAddress.name) || '',
    email:    (e.from && e.from.emailAddress && e.from.emailAddress.address) || '',
    date:     e.receivedDateTime,
    preview:  e.bodyPreview || '',
    body:     bodyHtml != null ? bodyHtml : ((e.body && e.body.content) || ''),
    bodyType: bodyType,
    unread:   !e.isRead,
  };
}

// GET /newsletter/emails?limit=50&folder=inbox&skip=0&search=lender+name
app.get('/newsletter/emails', async (req, res) => {
  try {
    const token  = await getGraphToken();
    const limit  = Math.min(parseInt(req.query.limit)  || 30, 100);
    const skip   = Math.max(parseInt(req.query.skip)   || 0,  0);
    const folder = req.query.folder || 'inbox';
    const search = (req.query.search || '').trim();

    // Fetch extra to cover thread deduplication loss
    const fetchTop = Math.min(limit * 5, 100);
    const select = 'id,subject,from,receivedDateTime,bodyPreview,body,isRead,conversationId';
    let url = `${GRAPH_BASE}/users/${OUTLOOK_USER_EMAIL}/mailFolders/${folder}/messages` +
              `?$top=${fetchTop}&$skip=${skip}&$orderby=receivedDateTime desc&$select=${select}`;
    if (search) url += `&$search="${encodeURIComponent(search)}"`;

    const emailRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data     = await emailRes.json();

    if (!emailRes.ok) {
      console.error('[newsletter] Graph error:', data);
      return res.status(emailRes.status).json({ error: (data.error && data.error.message) || 'Graph API error' });
    }

    // Deduplicate by conversationId — one card per thread (newest message in thread wins)
    const seen = new Set();
    const emails = [];
    for (const e of (data.value || [])) {
      const key = e.conversationId || e.id;
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(mapGraphEmail(e));
      if (emails.length >= limit) break;
    }

    res.json({ emails, total: emails.length });
  } catch (err) {
    console.error('[newsletter]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /newsletter/emails/:id — full message with inline images resolved
app.get('/newsletter/emails/:id', async (req, res) => {
  try {
    let token = await getGraphToken();
    let messageId = req.params.id;
    let select = 'id,subject,from,receivedDateTime,bodyPreview,body,isRead';
    let msgUrl = GRAPH_BASE + '/users/' + OUTLOOK_USER_EMAIL + '/messages/' + messageId + '?$select=' + select;
    let msgRes = await fetch(msgUrl, { headers: { Authorization: 'Bearer ' + token } });
    let msgData = await msgRes.json();
    if (!msgRes.ok) {
      return res.status(msgRes.status).json({ error: (msgData.error && msgData.error.message) || 'Message not found' });
    }
    let rawBody = (msgData.body && msgData.body.content) || '';
    let attachments = await fetchMessageAttachments(token, messageId);
    let resolvedBody = embedInlineImages(rawBody, attachments);
    res.json({ email: mapGraphEmail(msgData, resolvedBody) });
  } catch (err) {
    console.error('[newsletter/detail]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /newsletter/emails/:id/read — mark as read
app.patch('/newsletter/emails/:id/read', async (req, res) => {
  try {
    const token = await getGraphToken();
    const url   = `${GRAPH_BASE}/users/${OUTLOOK_USER_EMAIL}/messages/${req.params.id}`;
    await fetch(url, {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isRead: true }),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[newsletter/read]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Convoso server running on port ${PORT}`);
});
