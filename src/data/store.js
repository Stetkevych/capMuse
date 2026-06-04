// Shared data store - loads Accounts.csv from S3, falls back to mock data
import { DEALS as MOCK_DEALS, REPS as MOCK_REPS, LENDERS as MOCK_LENDERS, LEAD_SOURCES as MOCK_SOURCES, INDUSTRIES as MOCK_INDUSTRIES } from './mockData';

const BUCKET_URL = 'https://capmuse-data-882611632216.s3.amazonaws.com';

let _deals = MOCK_DEALS;
let _reps = MOCK_REPS;
let _initialized = false;
let _listeners = [];

// Proper CSV parser that handles quoted fields with commas
function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current.replace(/\r$/, ''));
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current.replace(/\r$/, ''));

  if (lines.length < 2) return [];
  const headers = splitRow(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = splitRow(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] || '';
    });
    return obj;
  });
}

function splitRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function fetchCSV(filename) {
  try {
    const res = await fetch(`${BUCKET_URL}/${filename}`);
    if (!res.ok) return null;
    const text = await res.text();
    return parseCSV(text);
  } catch {
    return null;
  }
}

// Map Zoho Accounts.csv row to deal format
function mapAccountToDeal(row, i) {
  const funded = parseFloat(String(row.Amount || '').replace(/[$,]/g, '')) || 0;
  const requested = parseFloat(String(row.Requested_Funding_Amount || '').replace(/[$,]/g, '')) || 0;

  return {
    deal_id: row.id || `d${i + 1}`,
    rep_id: row['Owner.id'] || row['Bizz_Owner_Name.id'] || '',
    rep_name: row.Bizz_Owner_Name || row.Account_Name || '',
    client_name: row.Account_Name || row.DBA || row.Business_Legal_Name || '',
    lender_name: row.Funder_2 || '',
    lead_source: row.Lead_Source || row.Original_Lead_Source || row.Lead_Master || '',
    industry: row.Industry || row.I_Stated_Industry || row.Industries || '',
    state: row.State || row.Business_State || row.Billing_State || '',
    stage: row.Stage_of_Package || '',
    approval_status: mapStage(row.Stage_of_Package),
    requested_amount: requested,
    approved_amount: funded > 0 ? funded : null,
    funded_amount: funded > 0 && isFundedStage(row.Stage_of_Package) ? funded : null,
    factor_rate: null,
    application_submitted_at: row.Date_Applied || row.Created_Time || '',
    funded_at: row.Date_Funded || null,
    days_total_to_fund: calcDays(row.Date_Applied, row.Date_Funded),
    created_at: row.Created_Time || row.Date_Applied || '',
    credit_score: row.Credit_Score || row.Credit_Score1 || '',
    monthly_revenue: parseFloat(String(row.Monthly_Revenue || row.Monthly_Revenue1 || '').replace(/[$,]/g, '')) || 0,
  };
}

function mapStage(stage) {
  if (!stage) return 'submitted';
  const s = stage.toLowerCase();
  if (s.includes('fund') && !s.includes('decline')) return 'funded';
  if (s.includes('approv')) return 'approved';
  if (s.includes('underw') || s.includes('review')) return 'underwriting';
  if (s.includes('doc')) return 'docs_uploaded';
  if (s.includes('decline') || s.includes('lost') || s.includes('dead')) return 'declined';
  return 'submitted';
}

function isFundedStage(stage) {
  if (!stage) return false;
  const s = stage.toLowerCase();
  return s.includes('fund') && !s.includes('decline');
}

function calcDays(start, end) {
  if (!start || !end) return null;
  try {
    const diff = Math.round((new Date(end) - new Date(start)) / 86400000);
    return diff > 0 && diff < 365 ? diff : null;
  } catch { return null; }
}

export async function initStore() {
  if (_initialized) return;
  _initialized = true;

  const data = await fetchCSV('Accounts.csv');

  if (data && data.length > 0) {
    _deals = data.map(mapAccountToDeal).filter(d => d.client_name);

    // Extract unique reps from the data
    const repMap = {};
    _deals.forEach(d => {
      if (d.rep_name && !repMap[d.rep_name]) {
        repMap[d.rep_name] = { id: d.rep_id || d.rep_name, name: d.rep_name, avatar: null, team: '' };
      }
    });
    _reps = Object.values(repMap);

    console.log(`[CapMuse] Loaded ${_deals.length} deals, ${_reps.length} reps from Accounts.csv`);
  } else {
    console.log('[CapMuse] Using mock data (no Accounts.csv in S3)');
  }

  _listeners.forEach(fn => fn());
}

export function getDeals() { return _deals; }
export function getReps() { return _reps; }
export function getLenders() {
  const fromDeals = [...new Set(_deals.map(d => d.lender_name).filter(Boolean))];
  return fromDeals.length > 0 ? fromDeals : MOCK_LENDERS;
}
export function getLeadSources() {
  const fromDeals = [...new Set(_deals.map(d => d.lead_source).filter(Boolean))];
  return fromDeals.length > 0 ? fromDeals : MOCK_SOURCES;
}
export function getIndustries() {
  const fromDeals = [...new Set(_deals.map(d => d.industry).filter(Boolean))];
  return fromDeals.length > 0 ? fromDeals : MOCK_INDUSTRIES;
}

export function onDataLoaded(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

export { BUCKET_URL, fetchCSV };
