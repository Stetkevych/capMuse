import React, { useState, useMemo } from 'react';
import { Trophy, ArrowUpDown } from 'lucide-react';
import { getDeals, getReps } from '../data/store';

const PERIODS = [
  { label: 'Today', days: 1 },
  { label: 'This Week', days: 7 },
  { label: 'This Month', days: 30 },
  { label: 'This Quarter', days: 90 },
  { label: 'All Time', days: 9999 },
];

const SORT_OPTIONS = ['Funded Amount', 'Deals Funded', 'Approval Rate', 'Funding Speed', 'Conversion Rate'];

export default function Leaderboard() {
  const [period, setPeriod] = useState(30);
  const [sortBy, setSortBy] = useState('Funded Amount');

  const data = useMemo(() => {
    const DEALS = getDeals();
    const REPS = getReps();
    const cutoff = Date.now() - period * 86400000;
    const filtered = DEALS.filter(d => new Date(d.application_submitted_at).getTime() >= cutoff);

    const byRep = {};
    REPS.forEach(r => { byRep[r.id] = { ...r, total: 0, funded: 0, volume: 0, days: [] }; });
    filtered.forEach(d => {
      if (!byRep[d.rep_id]) return;
      byRep[d.rep_id].total++;
      if (d.approval_status === 'funded') {
        byRep[d.rep_id].funded++;
        byRep[d.rep_id].volume += d.funded_amount || 0;
        if (d.days_total_to_fund) byRep[d.rep_id].days.push(d.days_total_to_fund);
      }
    });

    return Object.values(byRep).map(r => ({
      ...r,
      rate: r.total ? Math.round(r.funded / r.total * 100) : 0,
      avgDays: r.days.length ? +(r.days.reduce((s, v) => s + v, 0) / r.days.length).toFixed(1) : 0,
      conversion: r.total ? Math.round(r.funded / r.total * 100) : 0,
    })).sort((a, b) => {
      if (sortBy === 'Funded Amount') return b.volume - a.volume;
      if (sortBy === 'Deals Funded') return b.funded - a.funded;
      if (sortBy === 'Approval Rate') return b.rate - a.rate;
      if (sortBy === 'Funding Speed') return (a.avgDays || 99) - (b.avgDays || 99);
      return b.conversion - a.conversion;
    });
  }, [period, sortBy]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-[#0066FF]" />
          <h2 className="text-lg font-bold text-gray-900">Leaderboard</h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setPeriod(p.days)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${period === p.days ? 'bg-[#0066FF] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {SORT_OPTIONS.map(opt => (
          <button key={opt} onClick={() => setSortBy(opt)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${sortBy === opt ? 'bg-[#041E42] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <ArrowUpDown size={10} /> {opt}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">Rank</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">Rep</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Funded</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Deals</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Rate</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Avg Days</th>
            </tr>
          </thead>
          <tbody>
            {data.map((rep, i) => (
              <tr key={rep.id} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                <td className="py-3 px-4">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-[#8DFF00] text-[#041E42]' : i === 1 ? 'bg-blue-100 text-blue-700' : i === 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="py-3 px-4 font-semibold text-gray-900">{rep.name}</td>
                <td className="py-3 px-4 text-right font-medium text-gray-900">${rep.volume >= 1000000 ? (rep.volume / 1000000).toFixed(2) + 'M' : (rep.volume / 1000).toFixed(0) + 'K'}</td>
                <td className="py-3 px-4 text-right text-gray-700">{rep.funded}</td>
                <td className="py-3 px-4 text-right"><span className="text-green-600 font-medium">{rep.rate}%</span></td>
                <td className="py-3 px-4 text-right text-gray-700">{rep.avgDays || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
