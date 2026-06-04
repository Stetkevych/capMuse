import React from 'react';
import { LayoutDashboard, MessageSquare, Trophy, Users, FileText, Building2, Zap, BarChart3, Brain, FileBarChart, Settings, Target } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'ask', label: 'Ask CapMuse', icon: MessageSquare },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'reps', label: 'Reps', icon: Users },
  { id: 'deals', label: 'Deals', icon: FileText },
  { id: 'applications', label: 'Applications', icon: Target },
  { id: 'lenders', label: 'Lenders', icon: Building2 },
  { id: 'sources', label: 'Lead Sources', icon: Zap },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'insights', label: 'AI Insights', icon: Brain },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-[#041E42] flex flex-col z-50 shadow-xl">
      <div className="px-5 py-6 border-b border-white/10">
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-white">CAP</span>
          <span className="text-[#8DFF00]">MUSE</span>
        </h1>
        <p className="text-xs text-blue-300/60 mt-0.5">Intelligence for MCA</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 mb-0.5
                ${isActive
                  ? 'bg-[#0066FF]/20 text-white shadow-[0_0_12px_rgba(0,102,255,0.3)]'
                  : 'text-blue-200/70 hover:text-white hover:bg-white/5'}`}
            >
              <Icon size={18} className={isActive ? 'text-[#0066FF]' : ''} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
