// Shared data store - components import from here instead of mockData directly
// This module loads from S3 on init, falls back to mock data
import { DEALS as MOCK_DEALS, REPS as MOCK_REPS, LENDERS as MOCK_LENDERS, LEAD_SOURCES as MOCK_SOURCES, INDUSTRIES as MOCK_INDUSTRIES, STATES as MOCK_STATES } from './mockData';

const BUCKET_URL = 'https://capmuse-data-882611632216.s3.amazonaws.com';

// Mutable references that get updated after S3 load
let _deals = MOCK_DEALS;
let _reps = MOCK_REPS;
let _initialized = false;
let _listeners = [];

function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.replace(/\r/g, ''));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => {
      const val = values[i] || '';
      const num = parseFloat(val);
      obj[h] = !isNaN(num) && val !== '' ? num : val;
    });
    return obj;
  });
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

// Initialize - fetch from S3, update the shared references
export async function initStore() {
  if (_initialized) return;
  _initialized = true;

  const [dealsData, repsData] = await Promise.all([fetchCSV('deals.csv'), fetchCSV('reps.csv')]);

  if (dealsData && dealsData.length > 0) {
    _deals = dealsData.map((row, i) => ({
      deal_id: row.deal_id || `d${i + 1}`,
      rep_id: row.rep_id || row.rep_name || '',
      rep_name: row.rep_name || row.rep || '',
      client_name: row.client_name || row.client || row.business_name || '',
      lender_name: row.lender_name || row.lender || '',
      lead_source: row.lead_source || row.source || '',
      industry: row.industry || '',
      state: row.state || '',
      stage: row.stage || row.approval_status || '',
      approval_status: row.approval_status || row.stage || '',
      requested_amount: row.requested_amount || row.requested || 0,
      approved_amount: row.approved_amount || row.approved || null,
      funded_amount: row.funded_amount || row.funded || null,
      factor_rate: row.factor_rate || null,
      application_submitted_at: row.application_submitted_at || row.submitted_date || row.created_at || '',
      funded_at: row.funded_at || row.funded_date || null,
      days_total_to_fund: row.days_total_to_fund || row.days_to_fund || null,
      created_at: row.created_at || row.application_submitted_at || '',
    }));
    console.log(`[CapMuse] Loaded ${_deals.length} deals from S3`);
  } else {
    console.log('[CapMuse] Using mock deals (no deals.csv in S3)');
  }

  if (repsData && repsData.length > 0) {
    _reps = repsData.map((row, i) => ({
      id: row.id || row.rep_id || `r${i + 1}`,
      name: row.name || row.rep_name || '',
      avatar: row.avatar || null,
      team: row.team || '',
    }));
    console.log(`[CapMuse] Loaded ${_reps.length} reps from S3`);
  }

  // Notify listeners
  _listeners.forEach(fn => fn());
}

// Getters - always return current data (mock or S3)
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

// Subscribe to data updates (for components that need to re-render)
export function onDataLoaded(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

export { BUCKET_URL, fetchCSV };
