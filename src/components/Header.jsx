import React, { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';

const EXAMPLES = [
  'Who funded the most this month?',
  'Show approvals by lender',
  'Which rep converts the fastest?',
  'Largest deal funded this week',
  'Compare Sarah and James over the last 90 days',
  'Which lenders approve restaurant businesses most often?',
];

export default function Header({ onSearch }) {
  const [query, setQuery] = useState('');

  const submit = (q) => {
    const text = q || query;
    if (!text.trim()) return;
    onSearch(text.trim());
    setQuery('');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-6 py-4">
      <div className="max-w-4xl mx-auto">
        <div className="relative">
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 shadow-sm focus-within:border-[#0066FF] focus-within:ring-2 focus-within:ring-[#0066FF]/20 transition-all">
            <Sparkles size={20} className="text-[#0066FF] mr-3 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Ask CapMuse anything..."
              className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 text-base outline-none"
            />
            <button
              onClick={() => submit()}
              className="ml-3 bg-[#0066FF] text-white p-2 rounded-xl hover:bg-[#0052cc] transition-colors"
            >
              <Search size={18} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {EXAMPLES.slice(0, 4).map(ex => (
            <button
              key={ex}
              onClick={() => submit(ex)}
              className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-[#0066FF]/10 hover:text-[#0066FF] transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
