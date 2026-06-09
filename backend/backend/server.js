require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { getAccounts, getDeals } = require("./zoho_pull");
const { makeQueryPlan } = require("./ai");
const { loadAccountCsv } = require("./csv_data");

const app = express();

app.use(cors());
app.use(express.json());

const REP_ALIASES = {
  ivan: "Ivan Ortega",
  ken: "Ken Pflug",
  matthew: "Matthew Birnholz",
  michael: "Michael Cifuentes",
  ray: "Ray Ortega",
  rio: "Rio Pampallona",
  blake: "Blake Fiorito",
  erik: "Erik Anderson",
  dominic: "Dominic Basilio",
  kip: "Kip Langat",
  colin: "Colin O'Bryan",
  christian: "Christian Quintana",
  nikholas: "Nikholas Lazo",
  anthony: "Anthony Diaz",
};

function normalizeOwnerName(name) {
  if (!name) return name;

  const key = String(name).toLowerCase().trim();

  return REP_ALIASES[key] || name;
}

function matchesText(value, search) {
  if (!search) return true;
  if (!value) return false;

  return String(value)
    .toLowerCase()
    .includes(String(search).toLowerCase());
}

function getOwnerName(record) {
  return (
    record.Owner?.name ||
    record.Owner ||
    record["Owner"] ||
    record["Account Owner"] ||
    record["Deal Owner"] ||
    ""
  );
}

function getAmount(record) {
  const raw =
    record.Amount ||
    record["Amount"] ||
    record["Funded Amount"] ||
    record["Funded_Amount"] ||
    0;

  return Number(String(raw).replace(/[$,]/g, "")) || 0;
}

function getRecordDate(record) {
  return (
    record.Closing_Date ||
    record["Closing Date"] ||
    record.Modified_Time ||
    record["Modified Time"] ||
    record.Created_Time ||
    record["Created Time"]
  );
}

function isWithinDateRange(record, dateRange) {
  if (!dateRange) return true;

  const rawDate = getRecordDate(record);

  if (!rawDate) return true;

  const recordDate = new Date(rawDate);
  const now = new Date();

  if (Number.isNaN(recordDate.getTime())) return true;

  if (dateRange === "today") {
    return (
      recordDate.getFullYear() === now.getFullYear() &&
      recordDate.getMonth() === now.getMonth() &&
      recordDate.getDate() === now.getDate()
    );
  }

  if (dateRange === "this_month") {
    return (
      recordDate.getFullYear() === now.getFullYear() &&
      recordDate.getMonth() === now.getMonth()
    );
  }

  if (dateRange === "last_month") {
    const lastMonth = new Date(now);
    lastMonth.setMonth(now.getMonth() - 1);

    return (
      recordDate.getFullYear() === lastMonth.getFullYear() &&
      recordDate.getMonth() === lastMonth.getMonth()
    );
  }

  if (dateRange === "last_30_days") {
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    return recordDate >= thirtyDaysAgo && recordDate <= now;
  }

  const monthsMatch = dateRange.match(/^last_(\d+)_months$/);
  if (monthsMatch) {
    const n = parseInt(monthsMatch[1], 10);
    const nMonthsAgo = new Date(now);
    nMonthsAgo.setMonth(now.getMonth() - n);

    return recordDate >= nMonthsAgo && recordDate <= now;
  }

  return true;
}

function applyFilters(records, filters = {}) {
  return records.filter((record) => {
    if (filters.Account_Name) {
      const accountName =
        record.Account_Name ||
        record["Account Name"] ||
        record["Account_Name"];

      if (!matchesText(accountName, filters.Account_Name)) return false;
    }

    if (filters.Deal_Name) {
      const dealName =
        record.Deal_Name ||
        record["Deal Name"] ||
        record["Deal_Name"];

      if (!matchesText(dealName, filters.Deal_Name)) return false;
    }

    if (filters.Owner) {
      const ownerName = getOwnerName(record);
      const targetOwner = normalizeOwnerName(filters.Owner);

      if (!matchesText(ownerName, targetOwner)) return false;
    }

    if (filters.Stage) {
      const stage = record.Stage || record["Stage"];

      if (!matchesText(stage, filters.Stage)) return false;
    }

    if (filters.date_range) {
      if (!isWithinDateRange(record, filters.date_range)) return false;
    }

    return true;
  });
}

function getRecordName(record, module) {
  if (module === "Accounts") {
    return record.Account_Name || record["Account Name"] || record["Account_Name"];
  }

  if (module === "Deals") {
    return record.Deal_Name || record["Deal Name"] || record["Deal_Name"];
  }

  return record.id || "Unknown record";
}

function buildTopRep(results) {
  const totals = {};

  for (const item of results) {
    const rep = getOwnerName(item) || "Unknown";
    const amount = getAmount(item);

    if (!totals[rep]) {
      totals[rep] = {
        rep,
        count: 0,
        amount: 0,
      };
    }

    totals[rep].count += 1;
    totals[rep].amount += amount;
  }

  return Object.values(totals).sort((a, b) => b.amount - a.amount);
}

function describeDateRange(dateRange) {
  if (!dateRange) return "";
  if (dateRange === "today") return " today";
  if (dateRange === "this_month") return " this month";
  if (dateRange === "last_month") return " last month";
  if (dateRange === "last_30_days") return " in the last 30 days";

  const m = dateRange.match(/^last_(\d+)_months$/);
  if (m) return ` in the last ${m[1]} month${m[1] === "1" ? "" : "s"}`;

  return "";
}

function formatAnswer(question, plan, results) {
  const count = results.length;
  const dateDesc = describeDateRange(plan.filters?.date_range);
  const rawOwner = plan.filters?.Owner;
  const owner = rawOwner ? normalizeOwnerName(rawOwner) : null;
  const isFunded = plan.filters?.Stage === "Closed Won";

  if (plan.action === "count") {
    if (isFunded && owner) {
      return `${owner} funded ${count} deal${count !== 1 ? "s" : ""}${dateDesc}.`;
    }
    if (owner) {
      return `${owner} has ${count} matching ${plan.module.toLowerCase()}${dateDesc}.`;
    }
    return `Found ${count} matching ${plan.module.toLowerCase()}${dateDesc}.`;
  }

  if (plan.action === "sum") {
    const total = results.reduce((sum, item) => sum + getAmount(item), 0);

    if (isFunded && owner) {
      return `${owner} funded $${total.toLocaleString()}${dateDesc}.`;
    }
    if (owner) {
      return `${owner}'s total is $${total.toLocaleString()}${dateDesc}.`;
    }
    return `Total amount is $${total.toLocaleString()}${dateDesc}.`;
  }

  if (plan.action === "lookup" && count === 1) {
    const item = results[0];
    const itemOwner = getOwnerName(item);
    const name = getRecordName(item, plan.module);

    return `${name} is owned by ${itemOwner}.`;
  }

  if (plan.action === "lookup" && count > 1) {
    return `Found ${count} possible matches.`;
  }

  if (plan.action === "lookup" && count === 0) {
    return `No matching record found.`;
  }

  if (plan.action === "list") {
    if (owner) {
      return `Found ${count} record${count !== 1 ? "s" : ""} for ${owner}${dateDesc}.`;
    }
    return `Found ${count} matching record${count !== 1 ? "s" : ""}${dateDesc}.`;
  }

  if (plan.action === "top_rep") {
    const ranked = buildTopRep(results);

    if (ranked.length === 0) {
      return "No matching reps found.";
    }

    const top = ranked[0];

    return `${top.rep} leads with $${top.amount.toLocaleString()} across ${top.count} deal${top.count !== 1 ? "s" : ""}${dateDesc}.`;
  }

  return `Found ${count} matching record${count !== 1 ? "s" : ""}${dateDesc}.`;
}

function executeAction(plan, results) {
  if (plan.action === "top_rep") {
    return buildTopRep(results);
  }

  return results;
}

app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        error: "Question is required",
      });
    }

    const plan = await makeQueryPlan(question);

    console.log("\n========== AI PLAN ==========");
    console.log(JSON.stringify(plan, null, 2));

    if (plan.module !== "Accounts" && plan.module !== "Deals") {
      return res.json({
        question,
        plan,
        answer: "I can only query Accounts and Deals right now.",
      });
    }

    let records = [];
    let source = "Zoho CRM";

    try {
      const crmResponse =
        plan.module === "Accounts" ? await getAccounts() : await getDeals();

      records = crmResponse.data || [];

      console.log("\n========== CRM RECORD DEBUG ==========");
      console.log("CRM RECORD COUNT:", records.length);

      if (records.length > 0) {
        console.log("FIRST CRM RECORD:");
        console.log(JSON.stringify(records[0], null, 2));
      }
    } catch (crmErr) {
      console.log("\n========== CRM ERROR — FALLING BACK TO CSV ==========");
      console.log(crmErr.message);
      source = "CSV (CRM unavailable)";
    }

    console.log("\n========== FILTER BEING APPLIED ==========");
    console.log(JSON.stringify(plan.filters, null, 2));

    let results = applyFilters(records, plan.filters);

    console.log("RECORDS BEFORE FILTER:", records.length);
    console.log("RECORDS AFTER FILTER:", results.length);

    if (results.length === 0) {
      console.log("\n========== CSV FALLBACK ==========");

      const csvRows = await loadAccountCsv();

      console.log("CSV ROW COUNT:", csvRows.length);

      results = applyFilters(csvRows, plan.filters);

      if (source !== "CSV (CRM unavailable)") {
        source = "Accounts.csv";
      }
    }

    const answer = formatAnswer(question, plan, results);
    const outputData = executeAction(plan, results);

    return res.json({
      question,
      plan,
      source,
      answer,
      count: Array.isArray(outputData) ? outputData.length : results.length,
      data: outputData,
    });
  } catch (err) {
    console.error("\n========== ERROR ==========");
    console.error(err);

    return res.status(500).json({
      error: err.message,
    });
  }
});

app.listen(8000, () => {
  console.log("Server running on http://127.0.0.1:8000");
});