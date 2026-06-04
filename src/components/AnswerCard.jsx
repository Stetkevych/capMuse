import React from 'react';
import { Brain, Sparkles, Table2, BarChart2 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function AnswerCard({ result }) {
  if (!result) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fadeIn">
      {/* Answer */}
      <div className="p-6 border-b border-gray-50">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0066FF]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles size={16} className="text-[#0066FF]" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{result.title}</h3>
            <p className="text-gray-700 mt-1">{result.answer}</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      {result.chart && (
        <div className="p-6 border-b border-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={14} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{result.chart.label}</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              {result.chart.type === 'line' ? (
                <LineChart data={result.chart.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="submitted" stroke="#0066FF" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="funded" stroke="#22C55E" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <BarChart data={result.chart.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  {result.chart.grouped ? (
                    <>
                      <Bar dataKey="funded" fill="#0066FF" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="deals" fill="#8DFF00" radius={[4, 4, 0, 0]} />
                    </>
                  ) : (
                    <Bar dataKey="value" fill="#0066FF" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table */}
      {result.table && (
        <div className="p-6 border-b border-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <Table2 size={14} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Data</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {result.table.columns.map(col => (
                    <th key={col} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    {row.map((cell, j) => (
                      <td key={j} className="py-2.5 px-3 text-gray-700 font-medium">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Insight */}
      {result.insight && (
        <div className="p-5 bg-gradient-to-r from-[#0066FF]/5 to-transparent">
          <div className="flex items-start gap-2">
            <Brain size={14} className="text-[#0066FF] mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-600 italic">{result.insight}</p>
          </div>
        </div>
      )}
    </div>
  );
}
