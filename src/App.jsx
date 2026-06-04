import React, { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import HeroCard from './components/HeroCard';
import KPICards from './components/KPICards';
import AIInsights from './components/AIInsights';
import AnswerCard from './components/AnswerCard';
import LeaderboardPage from './pages/LeaderboardPage';
import AnalyticsPage from './pages/AnalyticsPage';
import InsightsPage from './pages/InsightsPage';
import { processQuery } from './hooks/useCapMuse';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [result, setResult] = useState(null);

  const handleSearch = useCallback((query) => {
    const r = processQuery(query);
    setResult(r);
    setPage('ask');
  }, []);

  const handleNavigate = useCallback((id) => {
    setPage(id);
    if (id !== 'ask') setResult(null);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <Sidebar active={page} onNavigate={handleNavigate} />
      <main className="ml-60 flex-1 min-h-screen">
        <Header onSearch={handleSearch} />
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          {page === 'dashboard' && <DashboardView />}
          {page === 'ask' && <AskView result={result} />}
          {page === 'leaderboard' && <LeaderboardPage />}
          {page === 'analytics' && <AnalyticsPage />}
          {page === 'insights' && <InsightsPage />}
          {page === 'reps' && <LeaderboardPage />}
          {page === 'deals' && <DealsPlaceholder />}
          {page === 'lenders' && <AnalyticsPage />}
          {page === 'sources' && <AnalyticsPage />}
          {!['dashboard', 'ask', 'leaderboard', 'analytics', 'insights', 'reps', 'deals', 'lenders', 'sources'].includes(page) && <ComingSoon page={page} />}
        </div>
      </main>
    </div>
  );
}

function DashboardView() {
  return (
    <>
      <HeroCard />
      <KPICards />
      <AIInsights />
    </>
  );
}

function AskView({ result }) {
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#0066FF]/10 flex items-center justify-center mb-4">
          <span className="text-2xl">✨</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Ask CapMuse Anything</h2>
        <p className="text-gray-500 mt-2 max-w-md">Ask about funding performance, rep rankings, lender analytics, lead sources, or trends in natural language.</p>
      </div>
    );
  }
  return <AnswerCard result={result} />;
}

function DealsPlaceholder() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Recent Deals</h2>
      <p className="text-sm text-gray-500">Try asking: "Show the largest deals funded this quarter"</p>
      <AnswerCard result={processQuery('largest deals this quarter')} />
    </div>
  );
}

function ComingSoon({ page }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <span className="text-2xl">🚀</span>
      </div>
      <h2 className="text-xl font-bold text-gray-900 capitalize">{page}</h2>
      <p className="text-gray-500 mt-2">This section is coming soon.</p>
    </div>
  );
}
