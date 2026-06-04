import React, { useState, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { DEALS, REPS, LENDERS, LEAD_SOURCES, INDUSTRIES } from '../data/mockData';

const TABS = ['Reps', 'Lenders', 'Lead Sources', 'Pipeline'];
const COLORS = ['#0066FF', '#8DFF00', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899'];

export default function AnalyticsPage() {
  const [tab, setTab] = useState('Reps');

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BarChart3 size={20} className="text-[#0066FF]" />
        <h2 className="text-lg font-bold text-gray-900">Analytics</h2>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Reps' && <RepAnalytics />}
      {tab === 'Lenders' && <LenderAnalytics />}
      {tab === 'Lead Sources' && <SourceAnalytics />}
      {tab === 'Pipeline' && <PipelineAnalytics />}
    </div>
  );
}

function RepAnalytics() {
  const data = useMemo(() => {
    const byRep = {};
    DEALS.forEach(d => {
      if (!byRep[d.rep_name]) byRep[d.rep_name] = { name: d.rep_name, total: 0, funded: 0, volume: 0 };
      byRep[d.rep_name].total++;
      if (d.approval_status === 'funded') { byRep[d.rep_name].funded++; byRep[d.rep_name].volume += d.funded_amount || 0; }
    });
    return Object.values(byRep).map(r => ({ ...r, rate: r.total ? Math.round(r.funded / r.total * 100) : 0 })).sort((a, b) => b.volume - a.volume);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <ChartCard title="Funding Volume by Rep">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
          <Tooltip formatter={v => `$${v.toLocaleString()}`} />
          <Bar dataKey="volume" fill="#0066FF" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <ChartCard title="Approval Rate by Rep">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="rate" fill="#22C55E" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
    </div>
  );
}

function LenderAnalytics() {
  const data = useMemo(() => {
    const byLender = {};
    DEALS.forEach(d => {
      if (!byLender[d.lender_name]) byLender[d.lender_name] = { name: d.lender_name, total: 0, approved: 0, funded: 0, volume: 0 };
      byLender[d.lender_name].total++;
      if (['approved', 'funded'].includes(d.approval_status)) byLender[d.lender_name].approved++;
      if (d.approval_status === 'funded') { byLender[d.lender_name].funded++; byLender[d.lender_name].volume += d.funded_amount || 0; }
    });
    return Object.values(byLender).map(l => ({ ...l, rate: l.total ? Math.round(l.approved / l.total * 100) : 0 })).sort((a, b) => b.volume - a.volume);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <ChartCard title="Funded Volume by Lender">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
          <Tooltip formatter={v => `$${v.toLocaleString()}`} />
          <Bar dataKey="volume" fill="#0066FF" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartCard>
      <ChartCard title="Approval Rate by Lender">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
          <Tooltip />
          <Bar dataKey="rate" fill="#8DFF00" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartCard>
    </div>
  );
}

function SourceAnalytics() {
  const data = useMemo(() => {
    const bySource = {};
    DEALS.forEach(d => {
      const src = d.lead_source || 'Unknown';
      if (!bySource[src]) bySource[src] = { name: src, total: 0, funded: 0, volume: 0 };
      bySource[src].total++;
      if (d.approval_status === 'funded') { bySource[src].funded++; bySource[src].volume += d.funded_amount || 0; }
    });
    return Object.values(bySource).map(s => ({ ...s, rate: s.total ? Math.round(s.funded / s.total * 100) : 0 })).sort((a, b) => b.rate - a.rate);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <ChartCard title="Conversion Rate by Source">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="rate" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <ChartCard title="Volume by Source">
        <PieChart>
          <Pie data={data} dataKey="volume" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name.substring(0, 8)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={v => `$${v.toLocaleString()}`} />
        </PieChart>
      </ChartCard>
    </div>
  );
}

function PipelineAnalytics() {
  const stages = ['submitted', 'docs_uploaded', 'underwriting', 'approved', 'funded', 'declined'];
  const data = stages.map(s => ({ stage: s, count: DEALS.filter(d => d.approval_status === s).length }));
  const total = DEALS.length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <ChartCard title="Pipeline Funnel">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" fill="#0066FF" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ChartCard>
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Stage Breakdown</h4>
        <div className="space-y-3">
          {data.map((s, i) => (
            <div key={s.stage} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-sm text-gray-700 flex-1 capitalize">{s.stage.replace('_', ' ')}</span>
              <span className="text-sm font-semibold text-gray-900">{s.count}</span>
              <span className="text-xs text-gray-500">{Math.round(s.count / total * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">{title}</h4>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}
