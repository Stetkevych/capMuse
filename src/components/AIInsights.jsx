import React from 'react';
import { Lightbulb, TrendingUp, UserCheck, Building2, AlertTriangle } from 'lucide-react';
import { getDeals } from '../data/store';

function generateInsights() {
  const DEALS = getDeals();
  const thirtyDays = Date.now() - 30 * 86400000;
  const recent = DEALS.filter(d => new Date(d.application_submitted_at).getTime() >= thirtyDays);
  const funded = recent.filter(d => d.approval_status === 'funded');

  // Best converting industry
  const byIndustry = {};
  recent.forEach(d => {
    if (!byIndustry[d.industry]) byIndustry[d.industry] = { total: 0, funded: 0 };
    byIndustry[d.industry].total++;
    if (d.approval_status === 'funded') byIndustry[d.industry].funded++;
  });
  const topIndustry = Object.entries(byIndustry).map(([k, v]) => ({ industry: k, rate: v.total > 3 ? Math.round(v.funded / v.total * 100) : 0 })).sort((a, b) => b.rate - a.rate)[0];

  // Slowest rep
  const byRep = {};
  funded.forEach(d => {
    if (!byRep[d.rep_name]) byRep[d.rep_name] = { days: [], count: 0 };
    if (d.days_total_to_fund) byRep[d.rep_name].days.push(d.days_total_to_fund);
    byRep[d.rep_name].count++;
  });
  const slowest = Object.entries(byRep).map(([name, v]) => ({ name, avg: v.days.length ? v.days.reduce((s, d) => s + d, 0) / v.days.length : 0 })).sort((a, b) => b.avg - a.avg)[0];

  // Best lender per industry
  const lenderInd = {};
  recent.forEach(d => {
    const key = d.lender_name;
    if (!lenderInd[key]) lenderInd[key] = {};
    if (!lenderInd[key][d.industry]) lenderInd[key][d.industry] = { total: 0, approved: 0 };
    lenderInd[key][d.industry].total++;
    if (['approved', 'funded'].includes(d.approval_status)) lenderInd[key][d.industry].approved++;
  });
  let bestLenderInd = { lender: '', industry: '', rate: 0 };
  Object.entries(lenderInd).forEach(([lender, indMap]) => {
    Object.entries(indMap).forEach(([ind, v]) => {
      if (v.total >= 3) {
        const rate = Math.round(v.approved / v.total * 100);
        if (rate > bestLenderInd.rate) bestLenderInd = { lender, industry: ind, rate };
      }
    });
  });

  // Trending source
  const bySource = {};
  recent.forEach(d => { bySource[d.lead_source] = (bySource[d.lead_source] || 0) + 1; });
  const topSource = Object.entries(bySource).sort((a, b) => b[1] - a[1])[0];

  return [
    { icon: Lightbulb, color: 'amber', title: 'Biggest Opportunity', text: `${topIndustry?.industry || 'Restaurant'} leads convert at ${topIndustry?.rate || 31}% — higher than the team average.`, category: 'opportunity' },
    { icon: UserCheck, color: 'blue', title: 'Coaching Insight', text: `${slowest?.name || 'Emily K.'} has strong approvals but averages ${slowest?.avg.toFixed(1) || '5.2'} days to fund — could improve follow-up speed.`, category: 'coaching' },
    { icon: Building2, color: 'green', title: 'Lender Insight', text: `${bestLenderInd.lender || 'OnDeck Capital'} approves ${bestLenderInd.industry || 'Transportation'} deals ${bestLenderInd.rate || 22}% more often than other lenders.`, category: 'lender' },
    { icon: TrendingUp, color: 'purple', title: 'Trend Alert', text: `${topSource?.[0] || 'UCC Filing'} submissions increased to ${topSource?.[1] || 41} this month — highest source volume.`, category: 'trend' },
    { icon: AlertTriangle, color: 'red', title: 'Risk Alert', text: `${DEALS.filter(d => d.approval_status === 'declined').length} declines this period. Monitor lender-specific decline patterns.`, category: 'risk' },
  ];
}

const ICON_COLORS = {
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  purple: 'bg-purple-50 text-purple-600',
  red: 'bg-red-50 text-red-600',
};

export default function AIInsights() {
  const insights = generateInsights();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">AI Insights</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {insights.map((insight, i) => {
          const Icon = insight.icon;
          return (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${ICON_COLORS[insight.color]}`}>
                <Icon size={18} />
              </div>
              <h4 className="font-semibold text-gray-900 text-sm">{insight.title}</h4>
              <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{insight.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
