import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, CheckCircle, Clock, Zap, FileText, Target } from 'lucide-react';
import { DEALS } from '../data/mockData';

function getKPIs() {
  const now = Date.now();
  const thirtyDays = now - 30 * 86400000;
  const sixtyDays = now - 60 * 86400000;

  const current = DEALS.filter(d => new Date(d.application_submitted_at).getTime() >= thirtyDays);
  const previous = DEALS.filter(d => { const t = new Date(d.application_submitted_at).getTime(); return t >= sixtyDays && t < thirtyDays; });

  const funded = current.filter(d => d.approval_status === 'funded');
  const prevFunded = previous.filter(d => d.approval_status === 'funded');
  const totalFunded = funded.reduce((s, d) => s + (d.funded_amount || 0), 0);
  const prevTotalFunded = prevFunded.reduce((s, d) => s + (d.funded_amount || 0), 0);

  const approvalRate = current.length ? Math.round(current.filter(d => ['approved', 'funded'].includes(d.approval_status)).length / current.length * 100) : 0;
  const prevApprovalRate = previous.length ? Math.round(previous.filter(d => ['approved', 'funded'].includes(d.approval_status)).length / previous.length * 100) : 0;

  const avgDays = funded.filter(d => d.days_total_to_fund).reduce((s, d, _, a) => s + d.days_total_to_fund / a.length, 0);
  const prevAvgDays = prevFunded.filter(d => d.days_total_to_fund).reduce((s, d, _, a) => s + d.days_total_to_fund / a.length, 0);

  const largest = Math.max(...funded.map(d => d.funded_amount || 0), 0);
  const convRate = current.length ? Math.round(funded.length / current.length * 100) : 0;

  return [
    { label: 'Total Funded', value: `$${fmt(totalFunded)}`, change: pctChange(totalFunded, prevTotalFunded), icon: DollarSign, color: 'blue' },
    { label: 'Approval Rate', value: `${approvalRate}%`, change: approvalRate - prevApprovalRate, icon: CheckCircle, color: 'green' },
    { label: 'Avg Funding Time', value: `${avgDays.toFixed(1)} Days`, change: -Math.round((avgDays - prevAvgDays) / (prevAvgDays || 1) * 100), icon: Clock, color: 'purple' },
    { label: 'Largest Deal', value: `$${fmt(largest)}`, change: null, icon: Zap, color: 'amber' },
    { label: 'Active Applications', value: current.length.toString(), change: null, icon: FileText, color: 'indigo' },
    { label: 'Conversion Rate', value: `${convRate}%`, change: null, icon: Target, color: 'emerald' },
  ];
}

function pctChange(curr, prev) {
  if (!prev) return null;
  return Math.round((curr - prev) / prev * 100);
}

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return n.toString();
}

const COLORS = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  purple: 'bg-purple-50 text-purple-600',
  amber: 'bg-amber-50 text-amber-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
};

export default function KPICards() {
  const kpis = getKPIs();
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {kpis.map(kpi => {
        const Icon = kpi.icon;
        return (
          <div key={kpi.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${COLORS[kpi.color]}`}>
              <Icon size={18} />
            </div>
            <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{kpi.value}</p>
            {kpi.change !== null && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${kpi.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {kpi.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(kpi.change)}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
