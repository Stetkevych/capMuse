import React from 'react';
import AIInsights from '../components/AIInsights';

export default function InsightsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">AI-Powered Insights</h2>
        <p className="text-sm text-gray-500 mt-1">Auto-generated analysis of your funding business</p>
      </div>
      <AIInsights />
    </div>
  );
}
