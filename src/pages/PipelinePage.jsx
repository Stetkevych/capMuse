import React, { useState, useMemo, useEffect } from 'react';
import { GitBranch, ArrowUpDown, Search, Download, Filter } from 'lucide-react';
import { fetchCSV } from '../data/store';

const PERIODS = [
  { label: 'This Month', days: 30 },
  { label: 'This Quarter', days: 90 },
  { label: 'YTD', days: 365 },
  { label: 'All Time', days: 9999 },
];

const SORT_OPTIONS = ['Funded Amount', 'Calls', 'Apps', 'Approvals', 'Revenue'];

export default function PipelinePage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(9999);
  const [sortBy, setSortBy] = useState('Funded Amount');
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('All');

  useEffect(() => {
    (async () => {
      const csv = await fetchCSV('pipeline.csv');
      if (csv && csv.length > 0) {
        setData(csv);
        console.log(`[CapMuse] Loaded ${csv.length} pipeline records`);
      }
      setLoading(false);
    })();
  }, []);

  const stages = useMemo(() => {
    const s = new Set(data.map(r => r['Stage of Package']).filter(Boolean));
    return ['All', ...Array.from(s).sort()];
  }, [data]);

  const repStats = useMemo(() => {
    const cutoff = period === 9999 ? 0 : Date.now() - period * 86400000;
    const filtered = data.filter(r => {
      const dt = new Date(r['Created Time'] || r['Date Applied'] || '');
      if (cutoff > 0 && dt.getTime() < cutoff) return false;
      if (filterStage !== 'All' && r['Stage of Package'] !== filterStage) return false;
      return true;
    });

    const byRep = {};
    filtered.forEach(r => {
      const rep = r['Puller'] || r['Packages in Process Owner'] || 'Unassigned';
      if (!byRep[rep]) byRep[rep] = { name: rep, calls: 0, apps: 0, approvals: 0, funded: 0, fundedAmount: 0, points: [], revenue: 0, amounts: [] };

      const stage = (r['Stage of Package'] || '').toLowerCase();
      const disp = (r['Disposition'] || '').toLowerCase();
      const amount = parseFloat(String(r['Amount'] || '0').replace(/[$,]/g, '')) || 0;
      const touches = parseInt(r['Touches'] || '0') || 0;

      // Calls = touches/connected
      byRep[rep].calls += touches || (disp ? 1 : 0);

      // Apps = has Date Applied or stage beyond initial
      if (r['Date Applied'] || stage.includes('pack') || stage.includes('review') || stage.includes('approv') || stage.includes('fund')) {
        byRep[rep].apps++;
      }

      // Approvals
      if (stage.includes('approv') || stage.includes('fund')) {
        byRep[rep].approvals++;
      }

      // Funded
      if (stage.includes('fund') && !stage.includes('decline')) {
        byRep[rep].funded++;
        byRep[rep].fundedAmount += amount;
        byRep[rep].amounts.push(amount);
        // Revenue estimate (using pts/factor as proxy)
        const pts = parseFloat(r['Paid in Percentage'] || '0') || 0;
        if (pts > 0) {
          byRep[rep].points.push(pts);
          byRep[rep].revenue += amount * (pts / 100);
        }
      }
    });

    return Object.values(byRep)
      .filter(r => search === '' || r.name.toLowerCase().includes(search.toLowerCase()))
      .map(r => ({
        ...r,
        callsToApps: r.calls > 0 ? (r.apps / r.calls * 100).toFixed(1) : '0.0',
        appsToApprovals: r.apps > 0 ? (r.approvals / r.apps * 100).toFixed(1) : '0.0',
        approvalToFunding: r.approvals > 0 ? (r.funded / r.approvals * 100).toFixed(1) : '0.0',
        avgPoints: r.points.length > 0 ? (r.points.reduce((s, v) => s + v, 0) / r.points.length).toFixed(2) : '0.00',
        avgAmount: r.amounts.length > 0 ? Math.round(r.amounts.reduce((s, v) => s + v, 0) / r.amounts.length) : 0,
      }))
      .sort((a, b) => {
        if (sortBy === 'Funded Amount') return b.fundedAmount - a.fundedAmount;
        if (sortBy === 'Calls') return b.calls - a.calls;
        if (sortBy === 'Apps') return b.apps - a.apps;
        if (sortBy === 'Approvals') return b.approvals - a.approvals;
        if (sortBy === 'Revenue') return b.revenue - a.revenue;
        return 0;
      });
  }, [data, period, sortBy, search, filterStage]);

  const totals = useMemo(() => {
    return repStats.reduce((t, r) => ({
      calls: t.calls + r.calls,
      apps: t.apps + r.apps,
      approvals: t.approvals + r.approvals,
      funded: t.funded + r.funded,
      fundedAmount: t.fundedAmount + r.fundedAmount,
      revenue: t.revenue + r.revenue,
    }), { calls: 0, apps: 0, approvals: 0, funded: 0, fundedAmount: 0, revenue: 0 });
  }, [repStats]);

  const fmt = (n) => {
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K';
    return '$' + Math.round(n).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-[#0066FF] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <GitBranch size={20} className="text-[#0066FF]" />
          <h2 className="text-lg font-bold text-gray-900">Pipeline</h2>
          <span className="text-xs text-gray-400 ml-2">{data.length.toLocaleString()} records</span>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPI label="Calls" value={totals.calls.toLocaleString()} />
        <KPI label="Apps" value={totals.apps.toLocaleString()} />
        <KPI label="Approvals" value={totals.approvals.toLocaleString()} />
        <KPI label="Funded" value={totals.funded.toLocaleString()} />
        <KPI label="Funded Amount" value={fmt(totals.fundedAmount)} />
        <KPI label="Revenue" value={fmt(totals.revenue)} />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search reps..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#0066FF]"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter size={14} className="text-gray-400" />
          <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:border-[#0066FF]">
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          {SORT_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setSortBy(opt)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${sortBy === opt ? 'bg-[#041E42] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <ArrowUpDown size={10} /> {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">#</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">Rep</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Calls</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Apps</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">C→A %</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Approvals</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">A→Ap %</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Funded</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Ap→F %</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Funded Amt</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Avg Pts</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Avg Amt</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {repStats.map((rep, i) => (
              <tr key={rep.name} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                <td className="py-3 px-4">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-[#8DFF00] text-[#041E42]' : i === 1 ? 'bg-blue-100 text-blue-700' : i === 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="py-3 px-4 font-semibold text-gray-900 whitespace-nowrap">{rep.name}</td>
                <td className="py-3 px-4 text-right text-gray-700">{rep.calls.toLocaleString()}</td>
                <td className="py-3 px-4 text-right text-gray-700">{rep.apps.toLocaleString()}</td>
                <td className="py-3 px-4 text-right"><span className="text-blue-600 font-medium">{rep.callsToApps}%</span></td>
                <td className="py-3 px-4 text-right text-gray-700">{rep.approvals.toLocaleString()}</td>
                <td className="py-3 px-4 text-right"><span className="text-purple-600 font-medium">{rep.appsToApprovals}%</span></td>
                <td className="py-3 px-4 text-right font-medium text-gray-900">{rep.funded.toLocaleString()}</td>
                <td className="py-3 px-4 text-right"><span className="text-green-600 font-medium">{rep.approvalToFunding}%</span></td>
                <td className="py-3 px-4 text-right font-medium text-gray-900">{fmt(rep.fundedAmount)}</td>
                <td className="py-3 px-4 text-right text-gray-700">{rep.avgPoints}%</td>
                <td className="py-3 px-4 text-right text-gray-700">{rep.avgAmount > 0 ? fmt(rep.avgAmount) : '—'}</td>
                <td className="py-3 px-4 text-right font-medium text-[#0066FF]">{fmt(rep.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {repStats.length === 0 && (
          <div className="text-center py-10 text-gray-400">No pipeline data found for this period.</div>
        )}
      </div>
    </div>
  );
}

function KPI({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
