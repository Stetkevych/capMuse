import { getDeals, getReps, initStore } from '../data/store';

export async function initData() {
  await initStore();
}

// ─── Main query router ────────────────────────────────────────────────────────
export function processQuery(query) {
  const DEALS = getDeals();
  const q = query.toLowerCase().trim();

  // Detect entities
  const repMatch      = detectRep(q, DEALS);
  const lenderMatch   = detectLender(q, DEALS);
  const sourceMatch   = detectSource(q, DEALS);
  const industryMatch = detectIndustry(q, DEALS);

  // Detect time context — specific month/quarter takes priority over rolling window
  const monthFilter = detectMonth(q);
  const timeFilter  = detectTimeWindow(q);

  // Build the working dataset
  let deals = DEALS;

  if (monthFilter) {
    deals = applyMonthFilter(deals, monthFilter);
  } else if (timeFilter.days !== null) {
    deals = applyTimeFilter(deals, timeFilter);
  }
  // else days === null → all time, no filter

  if (lenderMatch)   deals = deals.filter(d => (d.lender_name  || '').toLowerCase().includes(lenderMatch));
  if (sourceMatch)   deals = deals.filter(d => (d.lead_source  || '').toLowerCase().includes(sourceMatch));
  if (industryMatch) deals = deals.filter(d => (d.industry     || '').toLowerCase().includes(industryMatch));

  const timeLabel = monthFilter ? monthFilter.label : timeFilter.label;

  // ── Rep-scoped intents ──────────────────────────────────────────────────────
  if (repMatch) {
    const repName = resolveRepName(repMatch, DEALS);

    // All-time rep deals for queries that span full career (best month, trend)
    const allRepDeals = DEALS.filter(d => (d.rep_name || '').toLowerCase().includes(repMatch));
    // Time/month scoped rep deals for specific-period queries
    const repDeals    = deals.filter(d => (d.rep_name || '').toLowerCase().includes(repMatch));

    if (/best month|peak month|top month|biggest month/i.test(q))
      return repBestMonth(allRepDeals, repName);

    if (/worst month|lowest month|slowest month/i.test(q))
      return repWorstMonth(allRepDeals, repName);

    if (monthFilter)
      return repInMonth(allRepDeals, repName, monthFilter);

    if (/largest deal|biggest deal|top deal/i.test(q))
      return repLargestDeal(repDeals, repName, timeLabel);

    if (/lender|who fund|which lender/i.test(q))
      return repLenders(repDeals, repName, timeLabel);

    if (/approval rate|approval|rate/i.test(q))
      return repApprovalRate(repDeals, repName, timeLabel);

    if (/fastest|speed|days.*fund|time.*fund/i.test(q))
      return repSpeed(repDeals, repName, timeLabel);

    if (/commission|earn/i.test(q))
      return repCommission(repDeals, repName, timeLabel);

    if (/trend|by month|monthly/i.test(q))
      return repMonthlyTrend(allRepDeals, repName, timeLabel);

    if (/lead source|source/i.test(q))
      return repLeadSource(repDeals, repName, timeLabel);

    if (/vs\b|versus|compare/i.test(q))
      return compareRepsResult(q, deals, timeLabel);

    // Default — rep overview card
    return repOverview(repDeals, repName, timeLabel);
  }

  // ── Lender-scoped intents ───────────────────────────────────────────────────
  if (lenderMatch) {
    if (/industry/i.test(q))                   return lenderIndustryResult(deals, timeLabel);
    if (/rep|who sends|who submits/i.test(q))  return lenderRepBreakdown(deals, timeLabel);
    return lenderOverview(deals, lenderMatch, timeLabel);
  }

  // ── Team-wide intents ───────────────────────────────────────────────────────
  if (/who funded the most|top funder|most funded|biggest funder|leaderboard/i.test(q))
    return topFunderResult(deals, timeLabel);
  if (/highest approval|best approval|approval rate/i.test(q))
    return approvalRateResult(deals, timeLabel);
  if (/approval.*(by|per) lender|lender.*approv/i.test(q))
    return lenderApprovalResult(deals, timeLabel);
  if (/fastest|quickest|speed|time.*funded|days.*fund/i.test(q))
    return fundingSpeedResult(deals, timeLabel);
  if (/largest deal|biggest deal|top deal/i.test(q))
    return largestDealsResult(deals, timeLabel);
  if (/compare|vs\b|versus/i.test(q))
    return compareRepsResult(q, deals, timeLabel);
  if (/lead source|convert.*fast|source.*convert/i.test(q))
    return leadSourceResult(deals, timeLabel);
  if (/lender.*(approve|fund).*industry|industry.*(approve|fund)/i.test(q))
    return lenderIndustryResult(deals, timeLabel);
  if (/pipeline|funnel|stage/i.test(q))
    return pipelineResult(deals, timeLabel);
  if (/commission|earn/i.test(q))
    return commissionResult(deals, timeLabel);
  if (/trend|over time|month/i.test(q))
    return trendResult(deals, timeLabel);

  return topFunderResult(deals, timeLabel);
}

// ─── Entity detectors ─────────────────────────────────────────────────────────
function detectRep(q, deals) {
  const repNames = [...new Set(deals.map(d => d.rep_name).filter(Boolean))];
  for (const name of repNames) {
    const first = name.split(' ')[0].toLowerCase();
    if (first.length > 2 && q.includes(first)) return first;
  }
  return null;
}

function detectLender(q, deals) {
  const lenders = [...new Set(deals.map(d => d.lender_name).filter(Boolean))];
  for (const l of lenders) {
    if (l.length > 3 && q.includes(l.toLowerCase())) return l.toLowerCase();
  }
  return null;
}

function detectSource(q, deals) {
  const sources = [...new Set(deals.map(d => d.lead_source).filter(Boolean))];
  for (const s of sources) {
    if (s.length > 3 && q.includes(s.toLowerCase())) return s.toLowerCase();
  }
  return null;
}

function detectIndustry(q, deals) {
  const industries = [...new Set(deals.map(d => d.industry).filter(Boolean))];
  for (const ind of industries) {
    if (ind.length > 3 && q.includes(ind.toLowerCase())) return ind.toLowerCase();
  }
  return null;
}

// ─── Time detection ───────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
];
const MONTH_SHORT = {
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
};

function detectMonth(q) {
  // Full month name, optional year: "march 2024", "in january"
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (q.includes(MONTH_NAMES[i])) {
      const yearM = q.match(/\b(202\d)\b/);
      const year  = yearM ? parseInt(yearM[1]) : null;
      return { type: 'month', month: i + 1, year, label: cap(MONTH_NAMES[i]) + (year ? ` ${year}` : '') };
    }
  }
  // Short month abbreviations
  for (const [abbr, num] of Object.entries(MONTH_SHORT)) {
    if (new RegExp(`\\b${abbr}\\b`).test(q)) {
      const yearM = q.match(/\b(202\d)\b/);
      const year  = yearM ? parseInt(yearM[1]) : null;
      return { type: 'month', month: num, year, label: cap(abbr) + (year ? ` ${year}` : '') };
    }
  }
  // "last month"
  if (/last month/i.test(q)) {
    const now = new Date();
    const lm  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { type: 'month', month: lm.getMonth() + 1, year: lm.getFullYear(), label: 'Last Month' };
  }
  // Q1–Q4 with optional year
  const qm = q.match(/\bq([1-4])\b/i);
  if (qm) {
    const qNum  = parseInt(qm[1]);
    const yearM = q.match(/\b(202\d)\b/);
    const year  = yearM ? parseInt(yearM[1]) : new Date().getFullYear();
    return { type: 'quarter', quarter: qNum, year, startMonth: (qNum - 1) * 3 + 1, endMonth: qNum * 3, label: `Q${qNum} ${year}` };
  }
  return null;
}

function detectTimeWindow(q) {
  if (/\btoday\b/i.test(q))                        return { label: 'Today',        days: 1   };
  if (/this week/i.test(q))                         return { label: 'This Week',    days: 7   };
  if (/this month/i.test(q))                        return { label: 'This Month',   days: 30  };
  if (/this quarter|last 90|90 days/i.test(q))      return { label: 'This Quarter', days: 90  };
  if (/this year|ytd/i.test(q))                     return { label: 'YTD',          days: 365 };
  if (/all.?time|ever|all.?deals|history/i.test(q)) return { label: 'All Time',     days: null };
  const md = q.match(/last (\d+) days/i);
  if (md) return { label: `Last ${parseInt(md[1])} Days`, days: parseInt(md[1]) };
  // Default: all time — show full history unless user specifies otherwise
  return { label: 'All Time', days: null };
}

function applyTimeFilter(deals, { days }) {
  if (!days) return deals;
  const cutoff = Date.now() - days * 86400000;
  return deals.filter(d => new Date(d.application_submitted_at || d.created_at || '').getTime() >= cutoff);
}

function applyMonthFilter(deals, mf) {
  return deals.filter(d => {
    const dt = new Date(d.funded_at || d.application_submitted_at || d.created_at || '');
    if (isNaN(dt.getTime())) return false;
    const m = dt.getMonth() + 1;
    const y = dt.getFullYear();
    if (mf.type === 'quarter') {
      return m >= mf.startMonth && m <= mf.endMonth && (!mf.year || y === mf.year);
    }
    return m === mf.month && (!mf.year || y === mf.year);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolveRepName(repMatch, deals) {
  const names = [...new Set(deals.map(d => d.rep_name).filter(Boolean))];
  return names.find(n => n.split(' ')[0].toLowerCase() === repMatch || n.toLowerCase().includes(repMatch)) || cap(repMatch);
}

function monthKey(date) {
  const dt = new Date(date);
  if (isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function labelFromKey(key) {
  const [y, m] = key.split('-');
  const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${labels[parseInt(m) - 1]} ${y}`;
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function fmt(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return Math.round(n).toLocaleString();
}

function groupByMonth(deals, dateField = 'funded_at') {
  const map = {};
  deals.forEach(d => {
    const key = monthKey(d[dateField] || d.application_submitted_at || d.created_at || '');
    if (!key) return;
    if (!map[key]) map[key] = { month: key, submitted: 0, funded: 0, volume: 0 };
    map[key].submitted++;
    if (d.approval_status === 'funded') {
      map[key].funded++;
      map[key].volume += d.funded_amount || 0;
    }
  });
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Rep result builders ──────────────────────────────────────────────────────

function repBestMonth(allRepDeals, repName) {
  const funded = allRepDeals.filter(d => d.approval_status === 'funded' && d.funded_amount > 0);
  const byMonth = {};
  funded.forEach(d => {
    const key = monthKey(d.funded_at || d.application_submitted_at || '');
    if (!key) return;
    if (!byMonth[key]) byMonth[key] = { month: key, volume: 0, count: 0 };
    byMonth[key].volume += d.funded_amount;
    byMonth[key].count++;
  });

  const months = Object.values(byMonth).sort((a, b) => b.volume - a.volume);
  if (!months.length) {
    return { title: `${repName} — Best Month`, answer: 'No funded deals found.', insight: null, table: null, chart: null };
  }

  const best   = months[0];
  const runner = months[1];
  const allSorted = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));

  return {
    type: 'rep_best_month',
    title: `${repName}'s Best Month`,
    answer: `${repName}'s best month was ${labelFromKey(best.month)} with $${fmt(best.volume)} funded across ${best.count} deal${best.count !== 1 ? 's' : ''}.`,
    insight: runner
      ? `Runner-up: ${labelFromKey(runner.month)} at $${fmt(runner.volume)} — ${Math.round((best.volume - runner.volume) / runner.volume * 100)}% behind the peak.`
      : null,
    chart: {
      type: 'bar',
      data: allSorted.map(m => ({ name: m.month.substring(5), value: m.volume })),
      label: 'Monthly Funded Volume',
    },
    table: {
      columns: ['Month', 'Volume', 'Deals', 'Avg Deal'],
      rows: months.slice(0, 12).map(m => [
        labelFromKey(m.month), `$${fmt(m.volume)}`, m.count, `$${fmt(Math.round(m.volume / m.count))}`,
      ]),
    },
  };
}

function repWorstMonth(allRepDeals, repName) {
  const funded = allRepDeals.filter(d => d.approval_status === 'funded' && d.funded_amount > 0);
  const byMonth = {};
  funded.forEach(d => {
    const key = monthKey(d.funded_at || d.application_submitted_at || '');
    if (!key) return;
    if (!byMonth[key]) byMonth[key] = { month: key, volume: 0, count: 0 };
    byMonth[key].volume += d.funded_amount;
    byMonth[key].count++;
  });

  const months = Object.values(byMonth).sort((a, b) => a.volume - b.volume);
  if (!months.length) {
    return { title: `${repName} — Worst Month`, answer: 'No funded deals found.', insight: null, table: null, chart: null };
  }

  const worst   = months[0];
  const best    = months[months.length - 1];
  const allSorted = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));

  return {
    type: 'rep_worst_month',
    title: `${repName}'s Worst Month`,
    answer: `${repName}'s lowest month was ${labelFromKey(worst.month)} with $${fmt(worst.volume)} across ${worst.count} deal${worst.count !== 1 ? 's' : ''}.`,
    insight: `Best month for comparison: ${labelFromKey(best.month)} at $${fmt(best.volume)}.`,
    chart: { type: 'bar', data: allSorted.map(m => ({ name: m.month.substring(5), value: m.volume })), label: 'Monthly Volume' },
    table: {
      columns: ['Month', 'Volume', 'Deals'],
      rows: months.slice(0, 12).map(m => [labelFromKey(m.month), `$${fmt(m.volume)}`, m.count]),
    },
  };
}

function repInMonth(allRepDeals, repName, monthFilter) {
  const funded = allRepDeals.filter(d => {
    if (d.approval_status !== 'funded' || !d.funded_amount) return false;
    const dt = new Date(d.funded_at || d.application_submitted_at || '');
    if (isNaN(dt.getTime())) return false;
    const m = dt.getMonth() + 1;
    const y = dt.getFullYear();
    if (monthFilter.type === 'quarter') {
      return m >= monthFilter.startMonth && m <= monthFilter.endMonth && (!monthFilter.year || y === monthFilter.year);
    }
    return m === monthFilter.month && (!monthFilter.year || y === monthFilter.year);
  });

  const volume  = funded.reduce((s, d) => s + (d.funded_amount || 0), 0);
  const avgDeal = funded.length ? Math.round(volume / funded.length) : 0;

  // Compare to their career monthly average
  const byMonth = {};
  allRepDeals.filter(d => d.approval_status === 'funded' && d.funded_amount > 0).forEach(d => {
    const key = monthKey(d.funded_at || d.application_submitted_at || '');
    if (!key) return;
    if (!byMonth[key]) byMonth[key] = 0;
    byMonth[key] += d.funded_amount;
  });
  const monthVols   = Object.values(byMonth);
  const avgMonthVol = monthVols.length ? Math.round(monthVols.reduce((s, v) => s + v, 0) / monthVols.length) : 0;
  const pctVsAvg    = avgMonthVol ? Math.round((volume - avgMonthVol) / avgMonthVol * 100) : 0;

  return {
    type: 'rep_in_month',
    title: `${repName} — ${monthFilter.label}`,
    answer: funded.length
      ? `${repName} funded $${fmt(volume)} in ${monthFilter.label} across ${funded.length} deal${funded.length !== 1 ? 's' : ''} (avg $${fmt(avgDeal)}/deal).`
      : `${repName} had no funded deals in ${monthFilter.label}.`,
    insight: avgMonthVol > 0
      ? `${pctVsAvg >= 0 ? '+' : ''}${pctVsAvg}% vs. their career monthly average ($${fmt(avgMonthVol)}).`
      : null,
    chart: funded.length ? {
      type: 'bar',
      data: funded
        .sort((a, b) => (b.funded_amount || 0) - (a.funded_amount || 0))
        .map(d => ({ name: (d.client_name || 'Deal').substring(0, 12), value: d.funded_amount || 0 })),
      label: `Deals in ${monthFilter.label}`,
    } : null,
    table: {
      columns: ['Client', 'Lender', 'Amount', 'Date'],
      rows: funded
        .sort((a, b) => (b.funded_amount || 0) - (a.funded_amount || 0))
        .map(d => [
          d.client_name || '-',
          d.lender_name || '-',
          `$${fmt(d.funded_amount)}`,
          (d.funded_at || d.application_submitted_at || '').substring(0, 10),
        ]),
    },
  };
}

function repOverview(deals, repName, timeLabel) {
  const funded       = deals.filter(d => d.approval_status === 'funded');
  const volume       = funded.reduce((s, d) => s + (d.funded_amount || 0), 0);
  const avgDeal      = funded.length ? Math.round(volume / funded.length) : 0;
  const approvalRate = deals.length ? Math.round(funded.length / deals.length * 100) : 0;

  const byLender = {};
  funded.forEach(d => {
    const l = d.lender_name || 'Unknown';
    if (!byLender[l]) byLender[l] = { name: l, count: 0, volume: 0 };
    byLender[l].count++;
    byLender[l].volume += d.funded_amount || 0;
  });
  const lenders   = Object.values(byLender).sort((a, b) => b.volume - a.volume);
  const monthData = groupByMonth(funded, 'funded_at');

  return {
    type: 'rep_overview',
    title: `${repName} — ${timeLabel}`,
    answer: `${repName} funded $${fmt(volume)} across ${funded.length} deal${funded.length !== 1 ? 's' : ''} (${approvalRate}% approval rate, avg $${fmt(avgDeal)}/deal).`,
    insight: lenders[0] ? `Top lender: ${lenders[0].name} — ${lenders[0].count} deals, $${fmt(lenders[0].volume)}.` : null,
    chart: monthData.length > 1
      ? { type: 'bar', data: monthData.map(m => ({ name: m.month.substring(5), value: m.volume })), label: 'Monthly Funded Volume' }
      : null,
    table: lenders.length
      ? { columns: ['Lender', 'Deals', 'Volume'], rows: lenders.slice(0, 8).map(l => [l.name, l.count, `$${fmt(l.volume)}`]) }
      : null,
  };
}

function repLenders(deals, repName, timeLabel) {
  const funded = deals.filter(d => d.approval_status === 'funded');
  const byLender = {};
  funded.forEach(d => {
    const l = d.lender_name || 'Unknown';
    if (!byLender[l]) byLender[l] = { name: l, count: 0, volume: 0 };
    byLender[l].count++;
    byLender[l].volume += d.funded_amount || 0;
  });
  const lenders = Object.values(byLender).sort((a, b) => b.volume - a.volume);
  const top = lenders[0];

  return {
    type: 'rep_lenders',
    title: `${repName}'s Lenders — ${timeLabel}`,
    answer: top
      ? `${repName} funds most with ${top.name} — ${top.count} deal${top.count !== 1 ? 's' : ''} totaling $${fmt(top.volume)}.`
      : `No funded deals for ${repName} in this period.`,
    insight: lenders.length > 1 ? `${lenders.length} lenders used. Runner-up: ${lenders[1].name} ($${fmt(lenders[1].volume)}).` : null,
    chart: {
      type: 'bar',
      data: lenders.slice(0, 8).map(l => ({ name: l.name.split(' ')[0], value: l.volume })),
      label: 'Volume by Lender',
    },
    table: {
      columns: ['Lender', 'Deals', 'Volume', '% of Total'],
      rows: lenders.map(l => [l.name, l.count, `$${fmt(l.volume)}`, `${funded.length ? Math.round(l.count / funded.length * 100) : 0}%`]),
    },
  };
}

function repLargestDeal(deals, repName, timeLabel) {
  const funded = deals
    .filter(d => d.approval_status === 'funded' && d.funded_amount > 0)
    .sort((a, b) => b.funded_amount - a.funded_amount);
  const top = funded[0];

  return {
    type: 'rep_largest_deal',
    title: `${repName}'s Largest Deals — ${timeLabel}`,
    answer: top
      ? `${repName}'s biggest deal was $${fmt(top.funded_amount)} for ${top.client_name} via ${top.lender_name}.`
      : `No funded deals for ${repName} in this period.`,
    insight: funded.length > 1
      ? `Avg of top 5: $${fmt(Math.round(funded.slice(0, 5).reduce((s, d) => s + d.funded_amount, 0) / Math.min(5, funded.length)))}.`
      : null,
    chart: {
      type: 'bar',
      data: funded.slice(0, 8).map(d => ({ name: (d.client_name || 'Deal').substring(0, 12), value: d.funded_amount })),
      label: 'Deal Size',
    },
    table: {
      columns: ['Client', 'Amount', 'Lender', 'Date'],
      rows: funded.slice(0, 10).map(d => [
        d.client_name || '-', `$${fmt(d.funded_amount)}`, d.lender_name || '-',
        (d.funded_at || d.application_submitted_at || '').substring(0, 10),
      ]),
    },
  };
}

function repApprovalRate(deals, repName, timeLabel) {
  const total    = deals.length;
  const approved = deals.filter(d => ['approved', 'funded'].includes(d.approval_status)).length;
  const funded   = deals.filter(d => d.approval_status === 'funded').length;
  const declined = deals.filter(d => d.approval_status === 'declined').length;
  const rate     = total ? Math.round(approved / total * 100) : 0;
  const fundRate = total ? Math.round(funded   / total * 100) : 0;

  return {
    type: 'rep_approval',
    title: `${repName}'s Approval Rate — ${timeLabel}`,
    answer: `${repName} has a ${rate}% approval rate (${approved}/${total} apps) and ${fundRate}% funding rate ${timeLabel.toLowerCase()}.`,
    insight: total > 0 ? `${declined} declined, ${Math.max(0, total - approved - declined)} still in pipeline.` : null,
    chart: {
      type: 'bar',
      data: [
        { name: 'Approved', value: approved },
        { name: 'Funded',   value: funded   },
        { name: 'Declined', value: declined },
        { name: 'Pending',  value: Math.max(0, total - approved - declined) },
      ],
      label: 'Application Outcomes',
    },
    table: {
      columns: ['Stage', 'Count', '% of Total'],
      rows: [
        ['Submitted', total,    '100%'],
        ['Approved',  approved, `${rate}%`],
        ['Funded',    funded,   `${fundRate}%`],
        ['Declined',  declined, `${total ? Math.round(declined / total * 100) : 0}%`],
      ],
    },
  };
}

function repSpeed(deals, repName, timeLabel) {
  const funded = deals
    .filter(d => d.approval_status === 'funded' && d.days_total_to_fund)
    .sort((a, b) => a.days_total_to_fund - b.days_total_to_fund);
  const avg     = funded.length ? +(funded.reduce((s, d) => s + d.days_total_to_fund, 0) / funded.length).toFixed(1) : null;
  const fastest = funded[0];

  return {
    type: 'rep_speed',
    title: `${repName}'s Funding Speed — ${timeLabel}`,
    answer: avg
      ? `${repName} averages ${avg} days from application to funded across ${funded.length} deal${funded.length !== 1 ? 's' : ''}.`
      : `No funded deals with timing data for ${repName}.`,
    insight: fastest ? `Fastest: ${fastest.days_total_to_fund} day${fastest.days_total_to_fund !== 1 ? 's' : ''} for ${fastest.client_name} ($${fmt(fastest.funded_amount)}).` : null,
    chart: {
      type: 'bar',
      data: funded.slice(0, 10).map(d => ({ name: (d.client_name || 'Deal').substring(0, 10), value: d.days_total_to_fund })),
      label: 'Days to Fund',
    },
    table: {
      columns: ['Client', 'Days', 'Amount', 'Lender'],
      rows: funded.slice(0, 10).map(d => [d.client_name || '-', d.days_total_to_fund, `$${fmt(d.funded_amount)}`, d.lender_name || '-']),
    },
  };
}

function repCommission(deals, repName, timeLabel) {
  const funded     = deals.filter(d => d.approval_status === 'funded');
  const volume     = funded.reduce((s, d) => s + (d.funded_amount || 0), 0);
  const commission = Math.round(volume * 0.02);

  return {
    type: 'rep_commission',
    title: `${repName}'s Commissions — ${timeLabel}`,
    answer: funded.length
      ? `${repName} earned ~$${fmt(commission)} in estimated commissions from $${fmt(volume)} funded (${funded.length} deals) ${timeLabel.toLowerCase()}.`
      : 'No funded deals.',
    insight: funded.length ? `Avg commission per deal: ~$${fmt(Math.round(commission / funded.length))}.` : null,
    table: null,
    chart: null,
  };
}

function repMonthlyTrend(allRepDeals, repName, timeLabel) {
  const data   = groupByMonth(allRepDeals, 'funded_at');
  const latest = data[data.length - 1];
  const prev   = data[data.length - 2];

  return {
    type: 'rep_trend',
    title: `${repName} — Monthly Trend`,
    answer: latest
      ? `${repName}'s latest month (${labelFromKey(latest.month)}): ${latest.funded} funded, $${fmt(latest.volume)}.`
      : 'No data.',
    insight: latest && prev
      ? `vs. previous month: ${latest.funded - prev.funded >= 0 ? '+' : ''}${latest.funded - prev.funded} deals, ${latest.volume >= prev.volume ? '+' : ''}$${fmt(Math.abs(latest.volume - prev.volume))} volume.`
      : null,
    chart: {
      type: 'line',
      data: data.map(m => ({ name: m.month.substring(5), submitted: m.submitted, funded: m.funded })),
      label: 'Monthly Activity',
    },
    table: {
      columns: ['Month', 'Apps', 'Funded', 'Volume'],
      rows: data.map(m => [labelFromKey(m.month), m.submitted, m.funded, `$${fmt(m.volume)}`]),
    },
  };
}

function repLeadSource(deals, repName, timeLabel) {
  const bySource = {};
  deals.forEach(d => {
    const src = d.lead_source || 'Unknown';
    if (!bySource[src]) bySource[src] = { name: src, total: 0, funded: 0, volume: 0 };
    bySource[src].total++;
    if (d.approval_status === 'funded') { bySource[src].funded++; bySource[src].volume += d.funded_amount || 0; }
  });
  const sources = Object.values(bySource).sort((a, b) => b.volume - a.volume);
  const top = sources[0];

  return {
    type: 'rep_lead_source',
    title: `${repName}'s Lead Sources — ${timeLabel}`,
    answer: top
      ? `${repName}'s top source is ${top.name} — ${top.funded} funded from ${top.total} apps (${top.total ? Math.round(top.funded / top.total * 100) : 0}% rate).`
      : 'No data.',
    insight: sources.length > 1 ? `${sources.length} sources total.` : null,
    chart: {
      type: 'bar',
      data: sources.slice(0, 8).map(s => ({ name: s.name, value: s.funded })),
      label: 'Funded Deals by Source',
    },
    table: {
      columns: ['Source', 'Apps', 'Funded', 'Rate', 'Volume'],
      rows: sources.map(s => [s.name, s.total, s.funded, `${s.total ? Math.round(s.funded / s.total * 100) : 0}%`, `$${fmt(s.volume)}`]),
    },
  };
}

// ─── Lender result builders ───────────────────────────────────────────────────

function lenderOverview(deals, lenderMatch, timeLabel) {
  const funded     = deals.filter(d => d.approval_status === 'funded');
  const approved   = deals.filter(d => ['approved', 'funded'].includes(d.approval_status));
  const volume     = funded.reduce((s, d) => s + (d.funded_amount || 0), 0);
  const rate       = deals.length ? Math.round(approved.length / deals.length * 100) : 0;
  const lenderName = funded[0]?.lender_name || cap(lenderMatch);

  const byRep = {};
  funded.forEach(d => {
    const r = d.rep_name || 'Unknown';
    if (!byRep[r]) byRep[r] = { name: r, count: 0, volume: 0 };
    byRep[r].count++;
    byRep[r].volume += d.funded_amount || 0;
  });
  const reps = Object.values(byRep).sort((a, b) => b.volume - a.volume);

  return {
    type: 'lender_overview',
    title: `${lenderName} — ${timeLabel}`,
    answer: `${lenderName} funded $${fmt(volume)} across ${funded.length} deals with a ${rate}% approval rate from ${deals.length} submissions.`,
    insight: reps[0] ? `Top rep: ${reps[0].name} — ${reps[0].count} deals, $${fmt(reps[0].volume)}.` : null,
    chart: {
      type: 'bar',
      data: reps.slice(0, 8).map(r => ({ name: r.name.split(' ')[0], value: r.volume })),
      label: 'Volume by Rep',
    },
    table: {
      columns: ['Rep', 'Deals', 'Volume'],
      rows: reps.slice(0, 8).map(r => [r.name, r.count, `$${fmt(r.volume)}`]),
    },
  };
}

function lenderRepBreakdown(deals, timeLabel) {
  const funded     = deals.filter(d => d.approval_status === 'funded');
  const byRep      = {};
  funded.forEach(d => {
    const r = d.rep_name || 'Unknown';
    if (!byRep[r]) byRep[r] = { name: r, count: 0, volume: 0 };
    byRep[r].count++;
    byRep[r].volume += d.funded_amount || 0;
  });
  const reps       = Object.values(byRep).sort((a, b) => b.volume - a.volume);
  const lenderName = funded[0]?.lender_name || 'This Lender';

  return {
    type: 'lender_reps',
    title: `${lenderName} — By Rep — ${timeLabel}`,
    answer: reps[0] ? `${reps[0].name} sends the most business to ${lenderName} — ${reps[0].count} deals ($${fmt(reps[0].volume)}).` : 'No data.',
    insight: reps.length > 1 ? `${reps.length} reps use this lender. Total: $${fmt(reps.reduce((s, r) => s + r.volume, 0))}.` : null,
    chart: {
      type: 'bar',
      data: reps.slice(0, 8).map(r => ({ name: r.name.split(' ')[0], value: r.volume })),
      label: 'Volume by Rep',
    },
    table: {
      columns: ['Rep', 'Deals', 'Volume'],
      rows: reps.map(r => [r.name, r.count, `$${fmt(r.volume)}`]),
    },
  };
}

// ─── Team-wide result builders ────────────────────────────────────────────────

function topFunderResult(deals, timeLabel) {
  const funded = deals.filter(d => d.approval_status === 'funded');
  const byRep  = {};
  funded.forEach(d => {
    if (!byRep[d.rep_name]) byRep[d.rep_name] = { name: d.rep_name, amount: 0, count: 0 };
    byRep[d.rep_name].amount += d.funded_amount || 0;
    byRep[d.rep_name].count++;
  });
  const ranked = Object.values(byRep).sort((a, b) => b.amount - a.amount);
  const top    = ranked[0];

  return {
    type: 'leaderboard',
    title: `Top Funders — ${timeLabel}`,
    answer: top ? `${top.name} funded the most with $${fmt(top.amount)} across ${top.count} deals.` : 'No funded deals in this period.',
    insight: top && ranked[1] ? `${top.name} is ahead of ${ranked[1].name} by $${fmt(top.amount - ranked[1].amount)}.` : null,
    chart: {
      type: 'bar',
      data: ranked.slice(0, 8).map(r => ({ name: r.name.split(' ')[0], value: r.amount })),
      label: 'Funded Amount',
    },
    table: {
      columns: ['Rank', 'Rep', 'Funded', 'Deals'],
      rows: ranked.slice(0, 10).map((r, i) => [i + 1, r.name, `$${fmt(r.amount)}`, r.count]),
    },
  };
}

function approvalRateResult(deals, timeLabel) {
  const byRep = {};
  deals.forEach(d => {
    if (!byRep[d.rep_name]) byRep[d.rep_name] = { name: d.rep_name, total: 0, approved: 0 };
    byRep[d.rep_name].total++;
    if (['approved', 'funded'].includes(d.approval_status)) byRep[d.rep_name].approved++;
  });
  const ranked = Object.values(byRep)
    .map(r => ({ ...r, rate: r.total ? Math.round(r.approved / r.total * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate);
  const top = ranked[0];

  return {
    type: 'ranking',
    title: `Approval Rates — ${timeLabel}`,
    answer: top ? `${top.name} has the highest approval rate at ${top.rate}% (${top.approved}/${top.total} deals).` : 'No data.',
    insight: top ? `Team average: ${Math.round(ranked.reduce((s, r) => s + r.rate, 0) / ranked.length)}%.` : null,
    chart: {
      type: 'bar',
      data: ranked.slice(0, 8).map(r => ({ name: r.name.split(' ')[0], value: r.rate })),
      label: 'Approval %',
    },
    table: {
      columns: ['Rank', 'Rep', 'Rate', 'Approved', 'Total'],
      rows: ranked.slice(0, 10).map((r, i) => [i + 1, r.name, `${r.rate}%`, r.approved, r.total]),
    },
  };
}

function lenderApprovalResult(deals, timeLabel) {
  const byLender = {};
  deals.forEach(d => {
    if (!byLender[d.lender_name]) byLender[d.lender_name] = { name: d.lender_name, total: 0, approved: 0, funded: 0, volume: 0 };
    byLender[d.lender_name].total++;
    if (['approved', 'funded'].includes(d.approval_status)) byLender[d.lender_name].approved++;
    if (d.approval_status === 'funded') { byLender[d.lender_name].funded++; byLender[d.lender_name].volume += d.funded_amount || 0; }
  });
  const ranked = Object.values(byLender)
    .map(l => ({ ...l, rate: l.total ? Math.round(l.approved / l.total * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate);
  const byVol = [...ranked].sort((a, b) => b.volume - a.volume);

  return {
    type: 'lender_breakdown',
    title: `Lender Approvals — ${timeLabel}`,
    answer: `${ranked[0]?.name || 'N/A'} has the highest approval rate at ${ranked[0]?.rate || 0}% with ${ranked[0]?.total || 0} submissions.`,
    insight: `Top by volume: ${byVol[0]?.name} at $${fmt(byVol[0]?.volume)}.`,
    chart: {
      type: 'bar',
      data: ranked.slice(0, 8).map(l => ({ name: l.name.split(' ')[0], value: l.rate })),
      label: 'Approval %',
    },
    table: {
      columns: ['Lender', 'Rate', 'Approved', 'Funded', 'Volume'],
      rows: ranked.slice(0, 10).map(l => [l.name, `${l.rate}%`, l.approved, l.funded, `$${fmt(l.volume)}`]),
    },
  };
}

function fundingSpeedResult(deals, timeLabel) {
  const funded = deals.filter(d => d.approval_status === 'funded' && d.days_total_to_fund);
  const byRep  = {};
  funded.forEach(d => {
    if (!byRep[d.rep_name]) byRep[d.rep_name] = { name: d.rep_name, days: [], count: 0 };
    byRep[d.rep_name].days.push(d.days_total_to_fund);
    byRep[d.rep_name].count++;
  });
  const ranked = Object.values(byRep)
    .map(r => ({ ...r, avg: +(r.days.reduce((s, v) => s + v, 0) / r.days.length).toFixed(1) }))
    .sort((a, b) => a.avg - b.avg);
  const top = ranked[0];

  return {
    type: 'speed',
    title: `Funding Speed — ${timeLabel}`,
    answer: top ? `${top.name} has the fastest average at ${top.avg} days across ${top.count} deals.` : 'No funded deals.',
    insight: top ? `Team average: ${(ranked.reduce((s, r) => s + r.avg, 0) / ranked.length).toFixed(1)} days.` : null,
    chart: {
      type: 'bar',
      data: ranked.slice(0, 8).map(r => ({ name: r.name.split(' ')[0], value: r.avg })),
      label: 'Avg Days to Fund',
    },
    table: {
      columns: ['Rank', 'Rep', 'Avg Days', 'Deals'],
      rows: ranked.slice(0, 10).map((r, i) => [i + 1, r.name, r.avg, r.count]),
    },
  };
}

function largestDealsResult(deals, timeLabel) {
  const funded = deals.filter(d => d.funded_amount > 0).sort((a, b) => b.funded_amount - a.funded_amount);

  return {
    type: 'deals',
    title: `Largest Deals — ${timeLabel}`,
    answer: funded[0]
      ? `Largest deal: $${fmt(funded[0].funded_amount)} for ${funded[0].client_name} by ${funded[0].rep_name} via ${funded[0].lender_name}.`
      : 'No funded deals.',
    insight: funded.length > 3
      ? `Avg of top 5: $${fmt(Math.round(funded.slice(0, 5).reduce((s, d) => s + d.funded_amount, 0) / 5))}.`
      : null,
    chart: {
      type: 'bar',
      data: funded.slice(0, 8).map(d => ({ name: (d.client_name || '').substring(0, 12), value: d.funded_amount })),
      label: 'Amount',
    },
    table: {
      columns: ['Rank', 'Client', 'Rep', 'Lender', 'Amount'],
      rows: funded.slice(0, 10).map((d, i) => [i + 1, d.client_name, d.rep_name, d.lender_name, `$${fmt(d.funded_amount)}`]),
    },
  };
}

function compareRepsResult(q, deals, timeLabel) {
  const repNames = [...new Set(deals.map(d => d.rep_name).filter(Boolean))];
  const found    = repNames.filter(n => q.includes(n.split(' ')[0].toLowerCase()));
  const pair     = found.length >= 2 ? found.slice(0, 2) : repNames.slice(0, 2);

  const results = pair.map(name => {
    const rd     = deals.filter(d => d.rep_name === name);
    const funded = rd.filter(d => d.approval_status === 'funded');
    return { name, total: rd.length, funded: funded.length, volume: funded.reduce((s, d) => s + (d.funded_amount || 0), 0), rate: rd.length ? Math.round(funded.length / rd.length * 100) : 0 };
  });
  if (results.length < 2) results.push({ name: 'N/A', total: 0, funded: 0, volume: 0, rate: 0 });

  return {
    type: 'comparison',
    title: `${results[0].name} vs ${results[1].name} — ${timeLabel}`,
    answer: `${results[0].name}: $${fmt(results[0].volume)} funded (${results[0].rate}% rate). ${results[1].name}: $${fmt(results[1].volume)} funded (${results[1].rate}% rate).`,
    insight: results[0].volume > results[1].volume
      ? `${results[0].name} is outpacing by $${fmt(results[0].volume - results[1].volume)}.`
      : `${results[1].name} is outpacing by $${fmt(results[1].volume - results[0].volume)}.`,
    chart: {
      type: 'bar',
      data: [
        { name: results[0].name.split(' ')[0], funded: results[0].volume, deals: results[0].total },
        { name: results[1].name.split(' ')[0], funded: results[1].volume, deals: results[1].total },
      ],
      label: 'Comparison',
      grouped: true,
    },
    table: {
      columns: ['Metric', results[0].name, results[1].name],
      rows: [
        ['Deals',   results[0].total,             results[1].total],
        ['Funded',  results[0].funded,             results[1].funded],
        ['Volume',  `$${fmt(results[0].volume)}`,  `$${fmt(results[1].volume)}`],
        ['Rate',    `${results[0].rate}%`,          `${results[1].rate}%`],
      ],
    },
  };
}

function leadSourceResult(deals, timeLabel) {
  const bySource = {};
  deals.forEach(d => {
    const src = d.lead_source || 'Unknown';
    if (!bySource[src]) bySource[src] = { name: src, total: 0, funded: 0, volume: 0, days: [] };
    bySource[src].total++;
    if (d.approval_status === 'funded') {
      bySource[src].funded++;
      bySource[src].volume += d.funded_amount || 0;
      if (d.days_total_to_fund) bySource[src].days.push(d.days_total_to_fund);
    }
  });
  const ranked = Object.values(bySource)
    .map(s => ({ ...s, rate: s.total ? Math.round(s.funded / s.total * 100) : 0, avgDays: s.days.length ? +(s.days.reduce((a, b) => a + b, 0) / s.days.length).toFixed(1) : null }))
    .sort((a, b) => b.rate - a.rate);

  return {
    type: 'lead_sources',
    title: `Lead Source Performance — ${timeLabel}`,
    answer: `${ranked[0]?.name} converts fastest with a ${ranked[0]?.rate}% funding rate.`,
    insight: ranked[0]?.avgDays ? `Avg time to fund from ${ranked[0].name}: ${ranked[0].avgDays} days.` : null,
    chart: {
      type: 'bar',
      data: ranked.slice(0, 8).map(s => ({ name: s.name, value: s.rate })),
      label: 'Conversion %',
    },
    table: {
      columns: ['Source', 'Apps', 'Funded', 'Rate', 'Volume'],
      rows: ranked.map(s => [s.name, s.total, s.funded, `${s.rate}%`, `$${fmt(s.volume)}`]),
    },
  };
}

function lenderIndustryResult(deals, timeLabel) {
  const map = {};
  deals.forEach(d => {
    const key = `${d.lender_name}|${d.industry}`;
    if (!map[key]) map[key] = { lender: d.lender_name, industry: d.industry, total: 0, approved: 0 };
    map[key].total++;
    if (['approved', 'funded'].includes(d.approval_status)) map[key].approved++;
  });
  const ranked = Object.values(map)
    .map(r => ({ ...r, rate: r.total ? Math.round(r.approved / r.total * 100) : 0 }))
    .filter(r => r.total >= 2)
    .sort((a, b) => b.rate - a.rate);

  return {
    type: 'lender_industry',
    title: `Lender × Industry — ${timeLabel}`,
    answer: ranked[0] ? `${ranked[0].lender} approves ${ranked[0].industry} at ${ranked[0].rate}% (${ranked[0].approved}/${ranked[0].total}).` : 'Not enough data.',
    insight: ranked[1] ? `Runner-up: ${ranked[1].lender} + ${ranked[1].industry} at ${ranked[1].rate}%.` : null,
    chart: {
      type: 'bar',
      data: ranked.slice(0, 8).map(r => ({ name: `${r.lender.split(' ')[0]}-${r.industry.substring(0, 5)}`, value: r.rate })),
      label: 'Approval %',
    },
    table: {
      columns: ['Lender', 'Industry', 'Rate', 'Approved', 'Total'],
      rows: ranked.slice(0, 12).map(r => [r.lender, r.industry, `${r.rate}%`, r.approved, r.total]),
    },
  };
}

function pipelineResult(deals, timeLabel) {
  const stages = ['submitted', 'docs_uploaded', 'underwriting', 'approved', 'funded'];
  const counts = stages.map(s => ({ stage: s, count: deals.filter(d => d.approval_status === s).length }));
  const total  = deals.length;

  return {
    type: 'pipeline',
    title: `Pipeline Funnel — ${timeLabel}`,
    answer: `${total} total applications. ${counts.find(c => c.stage === 'funded')?.count || 0} funded.`,
    insight: `Conversion rate submitted → funded: ${total ? Math.round((counts.find(c => c.stage === 'funded')?.count || 0) / total * 100) : 0}%.`,
    chart: { type: 'bar', data: counts.map(c => ({ name: c.stage, value: c.count })), label: 'Pipeline' },
    table: {
      columns: ['Stage', 'Count', '% of Total'],
      rows: counts.map(c => [c.stage, c.count, `${total ? Math.round(c.count / total * 100) : 0}%`]),
    },
  };
}

function commissionResult(deals, timeLabel) {
  const funded = deals.filter(d => d.approval_status === 'funded');
  const byRep  = {};
  funded.forEach(d => {
    if (!byRep[d.rep_name]) byRep[d.rep_name] = { name: d.rep_name, volume: 0, count: 0 };
    byRep[d.rep_name].volume += d.funded_amount || 0;
    byRep[d.rep_name].count++;
  });
  const ranked = Object.values(byRep)
    .map(r => ({ ...r, commission: Math.round(r.volume * 0.02) }))
    .sort((a, b) => b.commission - a.commission);

  return {
    type: 'commission',
    title: `Estimated Commissions — ${timeLabel}`,
    answer: ranked[0] ? `${ranked[0].name} leads with ~$${fmt(ranked[0].commission)} from $${fmt(ranked[0].volume)} funded.` : 'No data.',
    insight: `Total team commissions: ~$${fmt(ranked.reduce((s, r) => s + r.commission, 0))}.`,
    chart: {
      type: 'bar',
      data: ranked.slice(0, 8).map(r => ({ name: r.name.split(' ')[0], value: r.commission })),
      label: 'Commission',
    },
    table: {
      columns: ['Rep', 'Volume', 'Deals', 'Est. Commission'],
      rows: ranked.map(r => [r.name, `$${fmt(r.volume)}`, r.count, `$${fmt(r.commission)}`]),
    },
  };
}

function trendResult(deals, timeLabel) {
  const data = groupByMonth(deals, 'application_submitted_at');

  return {
    type: 'trend',
    title: `Monthly Trend — ${timeLabel}`,
    answer: data.length
      ? `${data.length} months of data. Latest: ${data[data.length - 1]?.submitted || 0} apps, ${data[data.length - 1]?.funded || 0} funded.`
      : 'No data.',
    insight: data.length > 1
      ? `Month-over-month funded change: ${(data[data.length - 1]?.funded || 0) - (data[data.length - 2]?.funded || 0)} deals.`
      : null,
    chart: {
      type: 'line',
      data: data.map(m => ({ name: m.month.substring(5), submitted: m.submitted, funded: m.funded })),
      label: 'Trend',
    },
    table: {
      columns: ['Month', 'Submitted', 'Funded', 'Volume'],
      rows: data.map(m => [labelFromKey(m.month), m.submitted, m.funded, `$${fmt(m.volume)}`]),
    },
  };
}
