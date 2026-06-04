// Mock data modeled after the existing DealStore schema
const REPS = [
  { id: 'r1', name: 'James L.', avatar: null, team: 'Alpha' },
  { id: 'r2', name: 'Sarah M.', avatar: null, team: 'Alpha' },
  { id: 'r3', name: 'Mike R.', avatar: null, team: 'Beta' },
  { id: 'r4', name: 'Emily K.', avatar: null, team: 'Beta' },
  { id: 'r5', name: 'David P.', avatar: null, team: 'Alpha' },
  { id: 'r6', name: 'Chris T.', avatar: null, team: 'Gamma' },
  { id: 'r7', name: 'Amanda W.', avatar: null, team: 'Gamma' },
  { id: 'r8', name: 'Brian H.', avatar: null, team: 'Beta' },
];

const LENDERS = [
  'Rapid Finance', 'Fundbox', 'OnDeck Capital', 'Bluevine', 'Credibly',
  'National Funding', 'Libertas Funding', 'Fora Financial', 'Forward Financing', 'Kapitus',
];

const LEAD_SOURCES = [
  'UCC Filing', 'Stacking Data', 'Cold Call', 'Referral', 'Website',
  'Waymo', 'ISO Partner', 'Calendly', 'LinkedIn', 'Trade Show',
];

const INDUSTRIES = [
  'Restaurant', 'Retail', 'Construction', 'Transportation', 'Healthcare',
  'Auto Repair', 'E-Commerce', 'Real Estate', 'Manufacturing', 'Professional Services',
];

const STATES = ['NY', 'CA', 'TX', 'FL', 'NJ', 'IL', 'PA', 'OH', 'GA', 'NC'];

const STAGES = ['submitted', 'docs_uploaded', 'underwriting', 'approved', 'funded', 'declined'];

function randomDate(startDays, endDays) {
  const now = Date.now();
  const start = now - startDays * 86400000;
  const end = now - endDays * 86400000;
  return new Date(start + Math.random() * (end - start)).toISOString();
}

function randomAmount(min, max) {
  return Math.round((min + Math.random() * (max - min)) / 1000) * 1000;
}

function generateDeals(count = 400) {
  const deals = [];
  for (let i = 0; i < count; i++) {
    const rep = REPS[Math.floor(Math.random() * REPS.length)];
    const lender = LENDERS[Math.floor(Math.random() * LENDERS.length)];
    const source = LEAD_SOURCES[Math.floor(Math.random() * LEAD_SOURCES.length)];
    const industry = INDUSTRIES[Math.floor(Math.random() * INDUSTRIES.length)];
    const state = STATES[Math.floor(Math.random() * STATES.length)];
    const stage = STAGES[Math.floor(Math.random() * STAGES.length)];
    const isFunded = stage === 'funded';
    const isApproved = stage === 'approved' || isFunded;
    const requested = randomAmount(15000, 500000);
    const approved = isApproved ? Math.round(requested * (0.6 + Math.random() * 0.4)) : null;
    const funded = isFunded ? approved : null;
    const submittedAt = randomDate(120, 1);
    const fundedAt = isFunded ? randomDate(Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86400000), 0) : null;

    deals.push({
      deal_id: `d${i + 1}`,
      rep_id: rep.id,
      rep_name: rep.name,
      client_name: `Business ${i + 1}`,
      lender_name: lender,
      lead_source: source,
      industry,
      state,
      stage,
      approval_status: stage,
      requested_amount: requested,
      approved_amount: approved,
      funded_amount: funded,
      factor_rate: isFunded ? +(1.2 + Math.random() * 0.3).toFixed(2) : null,
      application_submitted_at: submittedAt,
      funded_at: fundedAt,
      days_total_to_fund: isFunded ? Math.floor(Math.random() * 8) + 1 : null,
      created_at: submittedAt,
    });
  }
  return deals;
}

const DEALS = generateDeals(400);

export { REPS, LENDERS, LEAD_SOURCES, INDUSTRIES, STATES, DEALS };
