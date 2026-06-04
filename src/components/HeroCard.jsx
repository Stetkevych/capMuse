import React from 'react';
import { Crown } from 'lucide-react';
import { DEALS, REPS } from '../data/mockData';

export default function HeroCard() {
  const thirtyDays = Date.now() - 30 * 86400000;
  const recent = DEALS.filter(d => new Date(d.application_submitted_at).getTime() >= thirtyDays && d.approval_status === 'funded');

  const byRep = {};
  recent.forEach(d => {
    if (!byRep[d.rep_id]) byRep[d.rep_id] = { id: d.rep_id, name: d.rep_name, amount: 0, count: 0, days: [] };
    byRep[d.rep_id].amount += d.funded_amount || 0;
    byRep[d.rep_id].count++;
    if (d.days_total_to_fund) byRep[d.rep_id].days.push(d.days_total_to_fund);
  });

  const ranked = Object.values(byRep).sort((a, b) => b.amount - a.amount);
  const top = ranked[0];
  if (!top) return null;

  const allDeals = DEALS.filter(d => new Date(d.application_submitted_at).getTime() >= thirtyDays && d.rep_id === top.id);
  const approvalRate = allDeals.length ? Math.round(allDeals.filter(d => ['approved', 'funded'].includes(d.approval_status)).length / allDeals.length * 100) : 0;
  const avgDays = top.days.length ? (top.days.reduce((s, v) => s + v, 0) / top.days.length).toFixed(1) : '—';

  return (
    <div className="bg-gradient-to-br from-[#041E42] to-[#0a2d5c] rounded-2xl p-6 text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#0066FF]/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#8DFF00]/5 rounded-full translate-y-1/2 -translate-x-1/4 blur-2xl" />

      <div className="relative flex items-center gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#8DFF00] to-[#22C55E] p-[3px] shadow-[0_0_20px_rgba(141,255,0,0.4)]">
            <div className="w-full h-full rounded-full bg-[#041E42] flex items-center justify-center text-2xl font-bold">
              {top.name.split(' ').map(n => n[0]).join('')}
            </div>
          </div>
          <div className="absolute -top-1 -right-1 bg-[#8DFF00] rounded-full p-1">
            <Crown size={12} className="text-[#041E42]" />
          </div>
        </div>

        <div className="flex-1">
          <p className="text-xs uppercase tracking-wider text-[#8DFF00] font-semibold mb-1">Top Performer This Month</p>
          <h2 className="text-2xl font-bold">{top.name}</h2>
          <div className="flex gap-6 mt-3">
            <div>
              <p className="text-xs text-blue-300/70">Funded</p>
              <p className="text-lg font-bold">${top.amount >= 1000000 ? (top.amount / 1000000).toFixed(2) + 'M' : (top.amount / 1000).toFixed(0) + 'K'}</p>
            </div>
            <div>
              <p className="text-xs text-blue-300/70">Approval %</p>
              <p className="text-lg font-bold">{approvalRate}%</p>
            </div>
            <div>
              <p className="text-xs text-blue-300/70">Avg Days</p>
              <p className="text-lg font-bold">{avgDays}</p>
            </div>
            <div>
              <p className="text-xs text-blue-300/70">Deals</p>
              <p className="text-lg font-bold">{top.count}</p>
            </div>
          </div>
        </div>

        <div className="text-right">
          <p className="text-5xl font-black text-[#8DFF00]/20">#1</p>
        </div>
      </div>
    </div>
  );
}
