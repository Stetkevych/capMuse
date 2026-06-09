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
const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;
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
      user_summary: "/convoso/user-summary",
      all_users_summary: "/convoso/all-users-summary",
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
      { key: "ni", status_ids: "ni" },
      { key: "nc", status_ids: "nc" },
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

app.post("/convoso/all-users-summary", async (req, res) => {
  try {
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({
        error: "Missing start_date or end_date",
      });
    }

    const statuses = [
      { key: "inst", status_ids: "inst" },
      { key: "ni", status_ids: "ni" },
      { key: "nc", status_ids: "nc" },
    ];

    const users = {};

    for (const item of statuses) {
      const data = await fetchConvosoData("/v1/agent-performance/search", {
        date_start: `${start_date} 00:00:00`,
        date_end: `${end_date} 23:59:59`,
        status_ids: item.status_ids,
      });

      const records = recordsFromConvoso(data);

      for (const row of records) {
        const userId = String(row.user_id || "").trim();
        const userName = String(row.name || row.user || "").trim();

        if (!userId || !userName) continue;

        if (!users[userId]) {
          users[userId] = {
            user: userName,
            user_id: userId,
            inst: 0,
            ni: 0,
            nc: 0,
          };
        }

        users[userId][item.key] = Number(row.calls || 0);
      }
    }

    res.json({
      start_date,
      end_date,
      count: Object.keys(users).length,
      users: Object.values(users).sort((a, b) =>
        a.user.localeCompare(b.user)
      ),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Convoso server running on http://127.0.0.1:${PORT}`);
});
