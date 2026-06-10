const CONVOSO_AUTH_TOKEN     = process.env.CONVOSO_AUTH_TOKEN;
const CONVOSO_CALL_LOG_TOKEN = (process.env.CONVOSO_CALL_LOG_API || "").trim();
const CONVOSO_BASE_URL       = process.env.CONVOSO_BASE_URL || "https://api.convoso.com";

async function fetchConvosoData(endpoint, params = {}) {
  const url  = `${CONVOSO_BASE_URL}${endpoint}`;
  const body = new URLSearchParams({ auth_token: CONVOSO_AUTH_TOKEN, ...params });
  const res  = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Convoso did not return JSON: ${text.slice(0, 200)}`); }
}

function recordsFromConvoso(data) {
  let records = data.data || data.results || data.records || data.rows || [];
  if (!Array.isArray(records)) records = Object.values(records);
  return records;
}

function getUserCalls(records, targetUser) {
  const target = targetUser.trim().toLowerCase();
  for (const row of records) {
    const userName = String(row.name || row.user || "").trim();
    if (userName.toLowerCase() === target)
      return { user: userName, user_id: String(row.user_id || ""), calls: Number(row.calls || 0) };
  }
  return { user: targetUser, user_id: null, calls: 0 };
}

async function fetchAllRepPages(dateStart, dateEnd, statusId) {
  const users = {};
  let page = 1, totalPages = null;
  while (true) {
    const data    = await fetchConvosoData("/v1/agent-performance/search", { date_start: dateStart, date_end: dateEnd, status_ids: statusId, call_type: "OUTBOUND", page, per_page: 100 });
    const records = recordsFromConvoso(data);
    if (page === 1) totalPages = data.total_pages || data.totalPages || (data.pagination && (data.pagination.total_pages || data.pagination.totalPages)) || null;
    for (const row of records) {
      const userId = String(row.user_id || "").trim(), userName = String(row.name || row.user || "").trim();
      if (!userId || !userName || /^deleted user/i.test(userName)) continue;
      if (!users[userId]) users[userId] = { user: userName, user_id: userId, calls: 0 };
      users[userId].calls += Number(row.calls || 0);
    }
    if (records.length === 0) break;
    if (totalPages !== null && page >= totalPages) break;
    if (totalPages === null && records.length < 100) break;
    page++;
  }
  return users;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = { fetchConvosoData, recordsFromConvoso, getUserCalls, fetchAllRepPages, CONVOSO_CALL_LOG_TOKEN, CONVOSO_BASE_URL, setCors };
