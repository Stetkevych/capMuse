require("dotenv").config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
    }),
  });

  const data = await res.json();

  if (!data.access_token) {
    console.log("TOKEN ERROR:", data);
    throw new Error("Failed to get Zoho access token");
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + 55 * 60 * 1000;
  return cachedToken;
}

const FETCH_LIMIT = 10000;

async function fetchAllPages(endpoint, fields, accessToken) {
  let allRecords = [];
  let page = 1;
  let pageToken = null;

  while (true) {
    const params = new URLSearchParams({ fields, per_page: "200" });

    if (pageToken) params.set("page_token", pageToken);
    else params.set("page", String(page));

    const res = await fetch(
      `https://www.zohoapis.com/crm/v8/${endpoint}?${params}`,
      {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      }
    );

    const data = await res.json();

    if (data.status === "error" || !data.data) {
      const msg = data.message || data.code || JSON.stringify(data);
      throw new Error(`Zoho API error: ${msg}`);
    }

    allRecords = allRecords.concat(data.data);

    if (!data.info?.more_records || allRecords.length >= FETCH_LIMIT) break;

    pageToken = data.info?.next_page_token || null;
    if (!pageToken) page++;
  }

  return { data: allRecords };
}

async function getLeads() {
  const accessToken = await getAccessToken();

  const fields = [
    "Full_Name",
    "First_Name",
    "Last_Name",
    "Company",
    "Owner",
    "Lead_Status",
    "Created_Time",
    "Modified_Time",
  ].join(",");

  return fetchAllPages("Leads", fields, accessToken);
}

async function getAccounts() {
  const accessToken = await getAccessToken();

  const fields = [
    "Account_Name",
    "Owner",
    "Created_Time",
    "Modified_Time",
  ].join(",");

  return fetchAllPages("Accounts", fields, accessToken);
}

async function getDeals() {
  const accessToken = await getAccessToken();

  const fields = [
    "Deal_Name",
    "Owner",
    "Stage",
    "Amount",
    "Created_Time",
    "Modified_Time",
    "Closing_Date",
  ].join(",");

  return fetchAllPages("Deals", fields, accessToken);
}

module.exports = {
  getAccessToken,
  getLeads,
  getAccounts,
  getDeals,
};