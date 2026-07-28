import React from 'react';
import { CheckCircle, XCircle, MinusCircle } from 'lucide-react';

function FieldScore({ field, agentValue, auditorValue, score }) {
    const Icon = score >= 0.8 ? CheckCircle : score >= 0.4 ? MinusCircle : XCircle;
    const color = score >= 0.8 ? 'text-green-400' : score >= 0.4 ? 'text-amber-400' : 'text-red-400';
    const bg = score >= 0.8 ? 'bg-green-900/20 border-green-500/20' : score >= 0.4 ? 'bg-amber-900/20 border-amber-500/20' : 'bg-red-900/20 border-red-500/20';

    const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    return (
        <div className={`border rounded-xl p-3 ${bg}`}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-200">{label}</span>
                <div className={`flex items-center gap-1.5 ${color}`}>
                    <Icon size={14} />
                    <span className="text-xs font-bold">{(score * 100).toFixed(0)}%</span>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                    <p className="text-gray-500 mb-0.5">Agent</p>
                    <p className="text-gray-300 font-mono">{agentValue || '—'}</p>
                </div>
                <div>
                    <p className="text-gray-500 mb-0.5">Auditor</p>
                    <p className="text-gray-300 font-mono">{auditorValue || '—'}</p>
                </div>
            </div>
        </div>
    );
}

export default function SimilarityReport({ data }) {
    const overall = data.overall_pct;
    const color = overall >= 70 ? 'text-green-400' : overall >= 40 ? 'text-amber-400' : 'text-red-400';
    const ringColor = overall >= 70 ? '#22c55e' : overall >= 40 ? '#f59e0b' : '#ef4444';

    const circumference = 2 * Math.PI * 36;
    const dashOffset = circumference * (1 - overall / 100);

    return (
        <div className="card border border-indigo-500/20 space-y-4">
            <h2 className="font-semibold text-indigo-400 flex items-center gap-2">
                Agent vs. Auditor Agreement Report
            </h2>

            {/* Ring chart */}
            <div className="flex items-center gap-6">
                <div className="relative w-24 h-24 shrink-0">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="36" fill="none" stroke="#1f2937" strokeWidth="7" />
                        <circle
                            cx="40" cy="40" r="36"
                            fill="none"
                            stroke={ringColor}
                            strokeWidth="7"
                            strokeDasharray={circumference}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round"
                            className="transition-all duration-1000"
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-xl font-black ${color}`}>{overall.toFixed(0)}%</span>
                        <span className="text-xs text-gray-500">match</span>
                    </div>
                </div>
                <div>
                    <p className="text-sm font-semibold text-white">Overall Similarity</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-xs">
                        {overall >= 70
                            ? 'High agreement. The agent and auditor are closely aligned on this contract action.'
                            : overall >= 40
                                ? 'Moderate agreement. Some differences exist between agent recommendation and auditor action.'
                                : 'Low agreement. Significant divergence — consider reviewing agent model parameters.'}
                    </p>
                </div>
            </div>

            {/* Per-field breakdown */}
            <div className="space-y-2">
                <p className="text-xs font-medium text-gray-400 mb-2">Per-Field Breakdown</p>
                {data.fields.map(({ field, agent_value, auditor_value, score }) => (
                    <FieldScore
                        key={field}
                        field={field}
                        agentValue={agent_value}
                        auditorValue={auditor_value}
                        score={score}
                    />
                ))}
            </div>
            <p className="text-xs text-gray-600">
                This structured comparison is stored as a learning signal for model improvement.
            </p>
        </div>
    );
}
