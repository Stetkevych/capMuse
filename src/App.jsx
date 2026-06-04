import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  const [authed, setAuthed] = useState(false);
  if (!authed) return <LandingPage onLogin={() => setAuthed(true)} />;
  return <MainApp />;
}

// Floating particle component
function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full opacity-20 animate-float"
          style={{
            width: `${Math.random() * 6 + 2}px`,
            height: `${Math.random() * 6 + 2}px`,
            background: i % 3 === 0 ? '#8DFF00' : i % 3 === 1 ? '#0066FF' : '#ffffff',
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${Math.random() * 10 + 8}s`,
          }}
        />
      ))}
    </div>
  );
}

// Typing effect hook
function useTyping(text, speed = 50, delay = 0) {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  useEffect(() => {
    if (!started) return;
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [started, text, speed]);
  return displayed;
}

function LandingPage({ onLogin }) {
  const [show, setShow] = useState(false);
  const [showTag, setShowTag] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);

  const tagline = useTyping('Ask your funding business anything.', 40, 1000);
  const subtitle = useTyping('The StatMuse of Commercial Finance', 30, 2200);

  useEffect(() => {
    setTimeout(() => setShow(true), 100);
    setTimeout(() => setShowTag(true), 900);
    setTimeout(() => setShowForm(true), 1600);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (user === 'TheCapMuse123' && pass === 'Inc5000DataAnalytics!') {
      setSuccess(true);
      setTimeout(onLogin, 800);
    } else {
      setError('Invalid credentials');
      setShake(true);
      setTimeout(() => { setShake(false); setError(''); }, 2000);
    }
  };

  return (
    <div className={`min-h-screen bg-[#041E42] flex flex-col items-center justify-center relative overflow-hidden transition-opacity duration-700 ${success ? 'opacity-0 scale-105' : ''}`}>
      <Particles />

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#0066FF]/8 rounded-full blur-[150px] animate-pulse" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-[#8DFF00]/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />

      {/* Logo top-left */}
      <div className={`absolute top-6 left-8 transition-all duration-700 ${show ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}>
        <h1 className="text-xl font-bold">
          <span className="text-white">CAP</span>
          <span className="text-[#8DFF00]">MUSE</span>
        </h1>
      </div>

      {/* Animated logo drop-in */}
      <div className={`transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${show ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-24 scale-75'}`}>
        <h1 className="text-7xl md:text-9xl font-black tracking-tight text-center select-none">
          <span className="text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]">CAP</span>
          <span className="text-[#8DFF00] drop-shadow-[0_0_30px_rgba(141,255,0,0.3)]">MUSE</span>
        </h1>
      </div>

      {/* Typing tagline */}
      <div className={`mt-5 h-16 transition-all duration-500 ${showTag ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-blue-100/90 text-lg md:text-xl text-center font-medium">
          {tagline}<span className="animate-blink">|</span>
        </p>
        <p className="text-blue-300/50 text-sm text-center mt-1.5 h-5">
          {subtitle}
        </p>
      </div>

      {/* Login card */}
      <div className={`mt-8 w-full max-w-sm px-6 transition-all duration-700 ${showForm ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${shake ? 'animate-shake' : ''}`}>
        <form onSubmit={handleLogin} className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-7 space-y-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          <div>
            <label className="text-xs text-blue-200/60 font-medium block mb-1.5">Username</label>
            <input
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/30 text-sm outline-none focus:border-[#0066FF] focus:ring-2 focus:ring-[#0066FF]/30 focus:bg-white/[0.08] transition-all"
              placeholder="Enter username"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-xs text-blue-200/60 font-medium block mb-1.5">Password</label>
            <input
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/30 text-sm outline-none focus:border-[#0066FF] focus:ring-2 focus:ring-[#0066FF]/30 focus:bg-white/[0.08] transition-all"
              placeholder="Enter password"
            />
          </div>
          {error && <p className="text-red-400 text-xs text-center animate-fadeIn">{error}</p>}
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-[#0066FF] to-[#0052cc] hover:from-[#0052cc] hover:to-[#003d99] text-white font-semibold py-3.5 rounded-xl transition-all hover:shadow-[0_0_24px_rgba(0,102,255,0.5)] active:scale-[0.97] relative overflow-hidden group"
          >
            <span className="relative z-10">Enter CapMuse</span>
            <div className="absolute inset-0 bg-gradient-to-r from-[#8DFF00]/0 via-[#8DFF00]/10 to-[#8DFF00]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
          </button>
        </form>
        <p className="text-center text-blue-300/30 text-xs mt-4">Intelligence for MCA · Powered by AI</p>
      </div>
    </div>
  );
}

function MainApp() {
  const [page, setPage] = useState('dashboard');
  const [result, setResult] = useState(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => { setTimeout(() => setEntered(true), 100); }, []);

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
    <div className={`min-h-screen bg-[#F8FAFC] flex transition-all duration-500 ${entered ? 'opacity-100' : 'opacity-0'}`}>
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
    <div className="animate-fadeIn space-y-6">
      <HeroCard />
      <KPICards />
      <AIInsights />
    </div>
  );
}

function AskView({ result }) {
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-[#0066FF]/10 flex items-center justify-center mb-4 animate-bounce">
          <span className="text-2xl">✨</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Ask CapMuse Anything</h2>
        <p className="text-gray-500 mt-2 max-w-md">Ask about funding performance, rep rankings, lender analytics, lead sources, or trends in natural language.</p>
      </div>
    );
  }
  return <div className="animate-fadeIn"><AnswerCard result={result} /></div>;
}

function DealsPlaceholder() {
  return (
    <div className="space-y-4 animate-fadeIn">
      <h2 className="text-lg font-bold text-gray-900">Recent Deals</h2>
      <p className="text-sm text-gray-500">Try asking: "Show the largest deals funded this quarter"</p>
      <AnswerCard result={processQuery('largest deals this quarter')} />
    </div>
  );
}

function ComingSoon({ page }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <span className="text-2xl">🚀</span>
      </div>
      <h2 className="text-xl font-bold text-gray-900 capitalize">{page}</h2>
      <p className="text-gray-500 mt-2">This section is coming soon.</p>
    </div>
  );
}
