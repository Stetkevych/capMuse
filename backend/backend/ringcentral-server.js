require("dotenv").config();

const express = require("express");
const RingCentral = require("@ringcentral/sdk").SDK;

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8002;

const rcsdk = new RingCentral({
  server: process.env.RC_SERVER,
  clientId: process.env.RiNGCENTRAL_CLIENT_ID,
  clientSecret: process.env.RiNGCENTRAL_CLIENT_SECRET,
});

const platform = rcsdk.platform();

async function login() {
  await platform.login({
    jwt: process.env.RiNGCENTRAL_JWT,
  });
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

  for (const availability of ["Alive", "Deleted", "Purged"]) {
    let page = 1;
    while (true) {
      const response = await platform.get(
        `/restapi/v1.0/account/~/extension/${extensionId}/message-store`,
        {
          dateFrom: rcDateStart(start_date),
          dateTo: rcDateEnd(end_date),
          direction: "Outbound",
          availability,
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

app.listen(PORT, () => {
  console.log(`RingCentral server running on port ${PORT}`);
});