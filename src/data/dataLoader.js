const BUCKET_URL = 'https://capmuse-data-882611632216.s3.amazonaws.com';

// Parse CSV string into array of objects using first row as headers
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

// Fetch a CSV from the S3 bucket
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

// Load deals data - tries S3 first, falls back to mock
let _cachedDeals = null;
let _loadPromise = null;

export async function loadDeals() {
  if (_cachedDeals) return _cachedDeals;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const data = await fetchCSV('deals.csv');
    if (data && data.length > 0) {
      _cachedDeals = data.map((row, i) => ({
        deal_id: row.deal_id || `d${i + 1}`,
        rep_id: row.rep_id || '',
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
      console.log(`[CapMuse] Loaded ${_cachedDeals.length} deals from S3`);
    } else {
      // Fall back to mock data
      const { DEALS } = await import('./mockData');
      _cachedDeals = DEALS;
      console.log('[CapMuse] Using mock data (no deals.csv in S3)');
    }
    return _cachedDeals;
  })();

  return _loadPromise;
}

// Load reps data
export async function loadReps() {
  const data = await fetchCSV('reps.csv');
  if (data && data.length > 0) {
    return data.map((row, i) => ({
      id: row.id || row.rep_id || `r${i + 1}`,
      name: row.name || row.rep_name || '',
      avatar: row.avatar || null,
      team: row.team || '',
    }));
  }
  const { REPS } = await import('./mockData');
  return REPS;
}

// Load any custom CSV by name
export async function loadCustomCSV(filename) {
  return await fetchCSV(filename);
}

export { BUCKET_URL, fetchCSV, parseCSV };
