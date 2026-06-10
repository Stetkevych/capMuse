const { CONVOSO_CALL_LOG_TOKEN, CONVOSO_BASE_URL, setCors } = require("../_convoso");

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { start_date, end_date, agent, per_page = 100 } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: "Missing start_date or end_date" });
    if (!CONVOSO_CALL_LOG_TOKEN) return res.status(500).json({ error: "CONVOSO_CALL_LOG_API not set" });

    const allCalls = [];
    let page = 1, totalPages = null;

    while (true) {
      const body = new URLSearchParams({ auth_token: CONVOSO_CALL_LOG_TOKEN, date_start: `${start_date} 00:00:00`, date_end: `${end_date} 23:59:59`, call_type: "OUTBOUND", page, per_page, ...(agent ? { agent_name: agent } : {}) });
      const response = await fetch(`${CONVOSO_BASE_URL}/v1/calllogs`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`Convoso call log did not return JSON: ${text.slice(0, 200)}`); }

      if (page === 1) totalPages = data.total_pages || data.totalPages || (data.pagination && (data.pagination.total_pages || data.pagination.totalPages)) || null;

      const records = data.data || data.results || data.records || data.rows || [];
      const arr     = Array.isArray(records) ? records : Object.values(records);

      for (const call of arr) allCalls.push({ call_id: call.id || call.call_id || null, agent: call.agent_name || call.user || call.agent || null, call_type: call.call_type || "OUTBOUND", disposition: call.disposition || call.status || null, duration: Number(call.duration || call.talk_time || 0), date: call.start_time || call.date || call.created_at || null, campaign: call.campaign_name || call.campaign || null, phone: call.phone_number || call.phone || null });

      if (arr.length === 0) break;
      if (totalPages !== null && page >= totalPages) break;
      if (totalPages === null && arr.length < per_page) break;
      page++;
    }

    res.json({ start_date, end_date, count: allCalls.length, calls: allCalls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
