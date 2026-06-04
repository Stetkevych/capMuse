import { DEALS, REPS, LENDERS, LEAD_SOURCES, INDUSTRIES } from '../data/mockData';

// NLP query parser - matches natural language to structured analytics
export function processQuery(query) {
  const q = query.toLowerCase().trim();

  // Time window detection
  const timeFilter = detectTimeWindow(q);
  let filtered = applyTimeFilter(DEALS, timeFilter);

  // Entity detection
  const repMatch = detectRep(q);
  const lenderMatch = detectLender(q);
  const sourceMatch = detectSource(q);
  const industryMatch = detectIndustry(q);

  if (repMatch) filtered = filtered.filter(d => d.rep_name.toLowerCase().includes(repMatch));
  if (lenderMatch) filtered = filtered.filter(d => d.lender_name.toLowerCase().includes(lenderMatch));
  if (sourceMatch) filtered = filtered.filter(d => d.lead_source.toLowerCase().includes(sourceMatch));
  if (industryMatch) filtered = filtered.filter(d => d.industry.toLowerCase().includes(industryMatch));

  // Intent detection
  if (/who funded the most|top funder|most funded|biggest funder/i.test(q)) return topFunderResult(filtered, timeFilter);
  if (/highest approval|best approval|approval rate/i.test(q)) return approvalRateResult(filtered, timeFilter);
  if (/approval.*(by|per) lender|lender.*approv|show approvals/i.test(q)) return lenderApprovalResult(filtered, timeFilter);
  if (/fastest|quickest|speed|time.*funded|time.*lead|days.*fund/i.test(q)) return fundingSpeedResult(filtered, timeFilter);
  if (/largest deal|biggest deal|top deal/i.test(q)) return largestDealsResult(filtered, timeFilter);
  if (/compare|vs\b|versus/i.test(q)) return compareRepsResult(q, filtered, timeFilter);
  if (/lead source|convert.*fast|source.*convert/i.test(q)) return leadSourceResult(filtered, timeFilter);
  if (/lender.*(approve|fund).*industry|industry.*(approve|fund)/i.test(q)) return lenderIndustryResult(filtered, timeFilter);
  if (/pipeline|funnel|stage/i.test(q)) return pipelineResult(filtered, timeFilter);
  if (/commission|earn/i.test(q)) return commissionResult(filtered, timeFilter);
  if (/trend|over time|month/i.test(q)) return trendResult(filtered, timeFilter);

  // Default: leaderboard
  return topFunderResult(filtered, timeFilter);
}

function detectTimeWindow(q) {
  if (/today/i.test(q)) return { label: 'Today', days: 1 };
  if (/this week/i.test(q)) return { label: 'This Week', days: 7 };
  if (/this month/i.test(q)) return { label: 'This Month', days: 30 };
  if (/this quarter|last 90|90 days/i.test(q)) return { label: 'This Quarter', days: 90 };
  if (/this year|ytd/i.test(q)) return { label: 'YTD', days: 365 };
  if (/last (\d+) days/i.test(q)) {
    const d = parseInt(q.match(/last (\d+) days/i)[1]);
    return { label: `Last ${d} Days`, days: d };
  }
  return { label: 'This Month', days: 30 };
}

function applyTimeFilter(deals, { days }) {
  const cutoff = Date.now() - days * 86400000;
  return deals.filter(d => new Date(d.application_submitted_at).getTime() >= cutoff);
}

function detectRep(q) {
  for (const r of REPS) {
    const first = r.name.split(' ')[0].toLowerCase();
    if (q.includes(first)) return first;
  }
  return null;
}

function detectLender(q) {
  for (const l of LENDERS) {
    if (q.includes(l.toLowerCase())) return l.toLowerCase();
  }
  return null;
}

function detectSource(q) {
  for (const s of LEAD_SOURCES) {
    if (q.includes(s.toLowerCase())) return s.toLowerCase();
  }
  return null;
}

function detectIndustry(q) {
  for (const i of INDUSTRIES) {
    if (q.includes(i.toLowerCase())) return i.toLowerCase();
  }
  return null;
}

function topFunderResult(deals, timeFilter) {
  const funded = deals.filter(d => d.approval_status === 'funded');
  const byRep = {};
  funded.forEach(d => {
    if (!byRep[d.rep_name]) byRep[d.rep_name] = { name: d.rep_name, amount: 0, count: 0 };
    byRep[d.rep_name].amount += d.funded_amount || 0;
    byRep[d.rep_name].count++;
  });
  const ranked = Object.values(byRep).sort((a, b) => b.amount - a.amount);
  const top = ranked[0];
  return {
    type: 'leaderboard',
    title: `Top Funders — ${timeFilter.label}`,
    answer: top ? `${top.name} funded the most ${timeFilter.label.toLowerCase()} with $${fmt(top.amount)} across ${top.count} deals.` : 'No funded deals in this period.',
    insight: top && ranked.length > 1 ? `${top.name} is ahead of ${ranked[1].name} by $${fmt(top.amount - ranked[1].amount)}.` : null,
    table: { columns: ['Rank', 'Rep', 'Funded', 'Deals'], rows: ranked.slice(0, 10).map((r, i) => [i + 1, r.name, `$${fmt(r.amount)}`, r.count]) },
    chart: { type: 'bar', data: ranked.slice(0, 8).map(r => ({ name: r.name, value: r.amount })), label: 'Funded Amount' },
  };
}

function approvalRateResult(deals, timeFilter) {
  const byRep = {};
  deals.forEach(d => {
    if (!byRep[d.rep_name]) byRep[d.rep_name] = { name: d.rep_name, total: 0, approved: 0 };
    byRep[d.rep_name].total++;
    if (['approved', 'funded'].includes(d.approval_status)) byRep[d.rep_name].approved++;
  });
  const ranked = Object.values(byRep).map(r => ({ ...r, rate: r.total ? Math.round(r.approved / r.total * 100) : 0 })).sort((a, b) => b.rate - a.rate);
  const top = ranked[0];
  return {
    type: 'ranking',
    title: `Approval Rate — ${timeFilter.label}`,
    answer: top ? `${top.name} has the highest approval rate at ${top.rate}% (${top.approved}/${top.total} deals).` : 'No data.',
    insight: top ? `The team average is ${Math.round(ranked.reduce((s, r) => s + r.rate, 0) / ranked.length)}%.` : null,
    table: { columns: ['Rank', 'Rep', 'Rate', 'Approved', 'Total'], rows: ranked.slice(0, 10).map((r, i) => [i + 1, r.name, `${r.rate}%`, r.approved, r.total]) },
    chart: { type: 'bar', data: ranked.slice(0, 8).map(r => ({ name: r.name, value: r.rate })), label: 'Approval %' },
  };
}

function lenderApprovalResult(deals, timeFilter) {
  const byLender = {};
  deals.forEach(d => {
    if (!byLender[d.lender_name]) byLender[d.lender_name] = { name: d.lender_name, total: 0, approved: 0, funded: 0, volume: 0 };
    byLender[d.lender_name].total++;
    if (['approved', 'funded'].includes(d.approval_status)) byLender[d.lender_name].approved++;
    if (d.approval_status === 'funded') { byLender[d.lender_name].funded++; byLender[d.lender_name].volume += d.funded_amount || 0; }
  });
  const ranked = Object.values(byLender).map(l => ({ ...l, rate: l.total ? Math.round(l.approved / l.total * 100) : 0 })).sort((a, b) => b.rate - a.rate);
  return {
    type: 'lender_breakdown',
    title: `Lender Approvals — ${timeFilter.label}`,
    answer: `${ranked[0]?.name || 'N/A'} has the highest approval rate at ${ranked[0]?.rate || 0}% with ${ranked[0]?.total || 0} submissions.`,
    insight: `Top lender by volume: ${ranked.sort((a, b) => b.volume - a.volume)[0]?.name} at $${fmt(ranked[0]?.volume)}.`,
    table: { columns: ['Lender', 'Rate', 'Approved', 'Funded', 'Volume'], rows: ranked.slice(0, 10).map(l => [l.name, `${l.rate}%`, l.approved, l.funded, `$${fmt(l.volume)}`]) },
    chart: { type: 'bar', data: ranked.slice(0, 8).map(l => ({ name: l.name, value: l.rate })), label: 'Approval %' },
  };
}

function fundingSpeedResult(deals, timeFilter) {
  const funded = deals.filter(d => d.approval_status === 'funded' && d.days_total_to_fund);
  const byRep = {};
  funded.forEach(d => {
    if (!byRep[d.rep_name]) byRep[d.rep_name] = { name: d.rep_name, days: [], count: 0 };
    byRep[d.rep_name].days.push(d.days_total_to_fund);
    byRep[d.rep_name].count++;
  });
  const ranked = Object.values(byRep).map(r => ({ ...r, avg: +(r.days.reduce((s, v) => s + v, 0) / r.days.length).toFixed(1) })).sort((a, b) => a.avg - b.avg);
  const top = ranked[0];
  return {
    type: 'speed',
    title: `Funding Speed — ${timeFilter.label}`,
    answer: top ? `${top.name} has the fastest average funding time at ${top.avg} days across ${top.count} deals.` : 'No funded deals.',
    insight: top ? `Team average is ${(ranked.reduce((s, r) => s + r.avg, 0) / ranked.length).toFixed(1)} days.` : null,
    table: { columns: ['Rank', 'Rep', 'Avg Days', 'Deals'], rows: ranked.slice(0, 10).map((r, i) => [i + 1, r.name, r.avg, r.count]) },
    chart: { type: 'bar', data: ranked.slice(0, 8).map(r => ({ name: r.name, value: r.avg })), label: 'Avg Days to Fund' },
  };
}

function largestDealsResult(deals, timeFilter) {
  const funded = deals.filter(d => d.funded_amount > 0).sort((a, b) => b.funded_amount - a.funded_amount);
  return {
    type: 'deals',
    title: `Largest Deals — ${timeFilter.label}`,
    answer: funded[0] ? `Largest deal: $${fmt(funded[0].funded_amount)} for ${funded[0].client_name} by ${funded[0].rep_name} via ${funded[0].lender_name}.` : 'No funded deals.',
    insight: funded.length > 3 ? `Average of top 5 deals: $${fmt(Math.round(funded.slice(0, 5).reduce((s, d) => s + d.funded_amount, 0) / 5))}.` : null,
    table: { columns: ['Rank', 'Client', 'Rep', 'Lender', 'Amount'], rows: funded.slice(0, 10).map((d, i) => [i + 1, d.client_name, d.rep_name, d.lender_name, `$${fmt(d.funded_amount)}`]) },
    chart: { type: 'bar', data: funded.slice(0, 8).map(d => ({ name: d.client_name.substring(0, 12), value: d.funded_amount })), label: 'Amount' },
  };
}

function compareRepsResult(q, deals, timeFilter) {
  const names = REPS.map(r => r.name.split(' ')[0].toLowerCase());
  const found = names.filter(n => q.includes(n));
  const repsToCompare = found.length >= 2 ? found.slice(0, 2) : [names[0], names[1]];
  const results = repsToCompare.map(name => {
    const repDeals = deals.filter(d => d.rep_name.toLowerCase().includes(name));
    const funded = repDeals.filter(d => d.approval_status === 'funded');
    return { name: REPS.find(r => r.name.toLowerCase().includes(name))?.name || name, total: repDeals.length, funded: funded.length, volume: funded.reduce((s, d) => s + (d.funded_amount || 0), 0), rate: repDeals.length ? Math.round(funded.length / repDeals.length * 100) : 0 };
  });
  return {
    type: 'comparison',
    title: `${results[0].name} vs ${results[1].name} — ${timeFilter.label}`,
    answer: `${results[0].name}: $${fmt(results[0].volume)} funded (${results[0].rate}% rate). ${results[1].name}: $${fmt(results[1].volume)} funded (${results[1].rate}% rate).`,
    insight: results[0].volume > results[1].volume ? `${results[0].name} is outpacing by $${fmt(results[0].volume - results[1].volume)}.` : `${results[1].name} is outpacing by $${fmt(results[1].volume - results[0].volume)}.`,
    table: { columns: ['Metric', results[0].name, results[1].name], rows: [['Deals', results[0].total, results[1].total], ['Funded', results[0].funded, results[1].funded], ['Volume', `$${fmt(results[0].volume)}`, `$${fmt(results[1].volume)}`], ['Rate', `${results[0].rate}%`, `${results[1].rate}%`]] },
    chart: { type: 'bar', data: [{ name: results[0].name, funded: results[0].volume, deals: results[0].total }, { name: results[1].name, funded: results[1].volume, deals: results[1].total }], label: 'Comparison', grouped: true },
  };
}

function leadSourceResult(deals, timeFilter) {
  const bySource = {};
  deals.forEach(d => {
    const src = d.lead_source || 'Unknown';
    if (!bySource[src]) bySource[src] = { name: src, total: 0, funded: 0, volume: 0, days: [] };
    bySource[src].total++;
    if (d.approval_status === 'funded') { bySource[src].funded++; bySource[src].volume += d.funded_amount || 0; if (d.days_total_to_fund) bySource[src].days.push(d.days_total_to_fund); }
  });
  const ranked = Object.values(bySource).map(s => ({ ...s, rate: s.total ? Math.round(s.funded / s.total * 100) : 0, avgDays: s.days.length ? +(s.days.reduce((a, b) => a + b, 0) / s.days.length).toFixed(1) : null })).sort((a, b) => b.rate - a.rate);
  return {
    type: 'lead_sources',
    title: `Lead Source Performance — ${timeFilter.label}`,
    answer: `${ranked[0]?.name} converts fastest with a ${ranked[0]?.rate}% funding rate.`,
    insight: ranked[0]?.avgDays ? `Average time to fund from ${ranked[0].name}: ${ranked[0].avgDays} days.` : null,
    table: { columns: ['Source', 'Apps', 'Funded', 'Rate', 'Volume'], rows: ranked.map(s => [s.name, s.total, s.funded, `${s.rate}%`, `$${fmt(s.volume)}`]) },
    chart: { type: 'bar', data: ranked.slice(0, 8).map(s => ({ name: s.name, value: s.rate })), label: 'Conversion %' },
  };
}

function lenderIndustryResult(deals, timeFilter) {
  const map = {};
  deals.forEach(d => {
    const key = `${d.lender_name}|${d.industry}`;
    if (!map[key]) map[key] = { lender: d.lender_name, industry: d.industry, total: 0, approved: 0 };
    map[key].total++;
    if (['approved', 'funded'].includes(d.approval_status)) map[key].approved++;
  });
  const ranked = Object.values(map).map(r => ({ ...r, rate: r.total ? Math.round(r.approved / r.total * 100) : 0 })).filter(r => r.total >= 2).sort((a, b) => b.rate - a.rate);
  return {
    type: 'lender_industry',
    title: `Lender × Industry — ${timeFilter.label}`,
    answer: ranked[0] ? `${ranked[0].lender} approves ${ranked[0].industry} businesses at ${ranked[0].rate}% (${ranked[0].approved}/${ranked[0].total}).` : 'Not enough data.',
    insight: ranked.length > 1 ? `Runner up: ${ranked[1].lender} + ${ranked[1].industry} at ${ranked[1].rate}%.` : null,
    table: { columns: ['Lender', 'Industry', 'Rate', 'Approved', 'Total'], rows: ranked.slice(0, 12).map(r => [r.lender, r.industry, `${r.rate}%`, r.approved, r.total]) },
    chart: { type: 'bar', data: ranked.slice(0, 8).map(r => ({ name: `${r.lender.split(' ')[0]}-${r.industry.substring(0, 5)}`, value: r.rate })), label: 'Approval %' },
  };
}

function pipelineResult(deals, timeFilter) {
  const stages = ['submitted', 'docs_uploaded', 'underwriting', 'approved', 'funded'];
  const counts = stages.map(s => ({ stage: s, count: deals.filter(d => d.approval_status === s).length }));
  return {
    type: 'pipeline',
    title: `Pipeline Funnel — ${timeFilter.label}`,
    answer: `${deals.length} total applications. ${counts.find(c => c.stage === 'funded')?.count || 0} funded.`,
    insight: `Conversion rate from submitted to funded: ${deals.length ? Math.round((counts.find(c => c.stage === 'funded')?.count || 0) / deals.length * 100) : 0}%.`,
    table: { columns: ['Stage', 'Count', '% of Total'], rows: counts.map(c => [c.stage, c.count, `${deals.length ? Math.round(c.count / deals.length * 100) : 0}%`]) },
    chart: { type: 'funnel', data: counts.map(c => ({ name: c.stage, value: c.count })), label: 'Pipeline' },
  };
}

function commissionResult(deals, timeFilter) {
  const funded = deals.filter(d => d.approval_status === 'funded');
  const byRep = {};
  funded.forEach(d => {
    if (!byRep[d.rep_name]) byRep[d.rep_name] = { name: d.rep_name, volume: 0, count: 0 };
    byRep[d.rep_name].volume += d.funded_amount || 0;
    byRep[d.rep_name].count++;
  });
  const ranked = Object.values(byRep).map(r => ({ ...r, commission: Math.round(r.volume * 0.02) })).sort((a, b) => b.commission - a.commission);
  return {
    type: 'commission',
    title: `Estimated Commissions — ${timeFilter.label}`,
    answer: ranked[0] ? `${ranked[0].name} leads with ~$${fmt(ranked[0].commission)} in commissions from $${fmt(ranked[0].volume)} funded.` : 'No data.',
    insight: `Total team commissions: ~$${fmt(ranked.reduce((s, r) => s + r.commission, 0))}.`,
    table: { columns: ['Rep', 'Volume', 'Deals', 'Est. Commission'], rows: ranked.map(r => [r.name, `$${fmt(r.volume)}`, r.count, `$${fmt(r.commission)}`]) },
    chart: { type: 'bar', data: ranked.slice(0, 8).map(r => ({ name: r.name, value: r.commission })), label: 'Commission' },
  };
}

function trendResult(deals, timeFilter) {
  const monthly = {};
  deals.forEach(d => {
    const month = (d.application_submitted_at || '').substring(0, 7);
    if (!month) return;
    if (!monthly[month]) monthly[month] = { month, submitted: 0, funded: 0, volume: 0 };
    monthly[month].submitted++;
    if (d.approval_status === 'funded') { monthly[month].funded++; monthly[month].volume += d.funded_amount || 0; }
  });
  const data = Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month));
  return {
    type: 'trend',
    title: `Monthly Trend — ${timeFilter.label}`,
    answer: `${data.length} months of data. Latest: ${data[data.length - 1]?.submitted || 0} apps, ${data[data.length - 1]?.funded || 0} funded.`,
    insight: data.length > 1 ? `Month-over-month funded change: ${data[data.length - 1]?.funded - data[data.length - 2]?.funded} deals.` : null,
    table: { columns: ['Month', 'Submitted', 'Funded', 'Volume'], rows: data.map(m => [m.month, m.submitted, m.funded, `$${fmt(m.volume)}`]) },
    chart: { type: 'line', data: data.map(m => ({ name: m.month, submitted: m.submitted, funded: m.funded })), label: 'Trend' },
  };
}

function fmt(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return n.toLocaleString();
}
