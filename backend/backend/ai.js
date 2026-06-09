require("dotenv").config();

const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function makeQueryPlan(question) {
  const prompt = `
You are a CRM AI assistant.

Convert the user's question into structured JSON.

IMPORTANT:
- Return RAW JSON only
- Do NOT use markdown
- Do NOT wrap in \`\`\`
- Do NOT explain anything

Available modules:
- Accounts
- Deals

Available actions:
- count
- list
- sum
- lookup
- top_rep

Important business rules:
- "funded" means Stage = "Closed Won"
- "closed won" means Stage = "Closed Won"
- "rep", "sales rep", "owner", and "salesperson" all mean Owner
- "merchant", "business", and "account" usually mean Account_Name
- For "this month" or "MTD", use date_range = "this_month"
- For "last month", use date_range = "last_month"
- For "today", use date_range = "today"
- For "last N months" (any number), use date_range = "last_N_months" (e.g. "last 3 months" → "last_3_months", "last 6 months" → "last_6_months")
- For "last two months" or "last 2 months", use date_range = "last_2_months"
- For "last year" or "last 12 months", use date_range = "last_12_months"
- For "last 30 days", use date_range = "last_30_days"
- For "year to date" or "YTD", use date_range = "last_12_months"

Available fields:

Accounts:
- Account_Name
- Owner
- Created_Time
- Modified_Time

Deals:
- Deal_Name
- Owner
- Stage
- Amount
- Closing_Date
- Created_Time
- Modified_Time

Examples:

Question:
Who owns GW SNEAKS LLC?

Response:
{
  "module": "Accounts",
  "action": "lookup",
  "filters": {
    "Account_Name": "GW SNEAKS LLC"
  }
}

Question:
Show all accounts owned by Ken Pflug

Response:
{
  "module": "Accounts",
  "action": "list",
  "filters": {
    "Owner": "Ken Pflug"
  }
}

Question:
How many deals has Ivan funded in the last two months?

Response:
{
  "module": "Deals",
  "action": "count",
  "filters": {
    "Owner": "Ivan",
    "Stage": "Closed Won",
    "date_range": "last_2_months"
  }
}

Question:
How many deals has Ken funded in the last 6 months?

Response:
{
  "module": "Deals",
  "action": "count",
  "filters": {
    "Owner": "Ken",
    "Stage": "Closed Won",
    "date_range": "last_6_months"
  }
}

Question:
How much has Blake funded this year?

Response:
{
  "module": "Deals",
  "action": "sum",
  "metric": "Amount",
  "filters": {
    "Owner": "Blake",
    "Stage": "Closed Won",
    "date_range": "last_12_months"
  }
}

Question:
Who funded the most this month?

Response:
{
  "module": "Deals",
  "action": "top_rep",
  "metric": "Amount",
  "filters": {
    "Stage": "Closed Won",
    "date_range": "this_month"
  }
}

User Question:
${question}
`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const raw = msg.content[0].text;

  console.log("\n========== RAW AI RESPONSE ==========");
  console.log(raw);

  const cleaned = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(cleaned);
}

module.exports = {
  makeQueryPlan,
};