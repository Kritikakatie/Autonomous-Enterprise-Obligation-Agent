import React from 'react';
import { BarChart2, AlertTriangle } from 'lucide-react';

const PARAM_CONFIG = [
    {
        key: 'score_budget',
        label: 'Budget Consideration',
        weight: '25%',
        maxContrib: 25,
        inputKey: 'budget_consideration_pct',
        inputLabel: '% of Annual Budget',
        inputFormat: (v) => v != null ? `${Number(v).toFixed(1)}%` : '—',
    },
    {
        key: 'score_reversibility',
        label: 'Reversibility (inverted)',
        weight: '20%',
        maxContrib: 20,
        inputKey: 'reversibility_score',
        inputLabel: 'Reversibility Score (0–10)',
        inputFormat: (v) => v != null ? `${Number(v).toFixed(1)} / 10` : '—',
    },
    {
        key: 'score_time_to_default',
        label: 'Time to Default',
        weight: '20%',
        maxContrib: 20,
        inputKey: 'time_to_default_days',
        inputLabel: 'Days to Default',
        inputFormat: (v) => v != null ? `${v} days` : '—',
    },
    {
        key: 'score_transaction_value',
        label: 'Transaction Value',
        weight: '20%',
        maxContrib: 20,
        inputKey: 'total_historical_transaction_value',
        inputLabel: 'Historical Txn Value',
        inputFormat: (v) => v != null ? `$${Number(v).toLocaleString()}` : '—',
    },
    {
        key: 'score_indemnification',
        label: 'Indemnification Scope',
        weight: '15%',
        maxContrib: 15,
        inputKey: 'indemnification_scope',
        inputLabel: 'Indemnification',
        inputFormat: (v) => v ?? '—',
    },
];

// Tier-based color palette (hardcoded hex to avoid Tailwind JIT purging)
const TIER_PALETTE = {
    Green: { bar: '#22c55e', text: '#4ade80', ring: '#22c55e', ring2: '#4ade80', glow: '#22c55e' },
    Amber: { bar: '#f59e0b', text: '#fbbf24', ring: '#f59e0b', ring2: '#fbbf24', glow: '#f59e0b' },
    Red: { bar: '#ef4444', text: '#f87171', ring: '#ef4444', ring2: '#f87171', glow: '#ef4444' },
};

function getTierPalette(tier) {
    return TIER_PALETTE[tier] || TIER_PALETTE['Amber'];
}

function ScoreBar({ value, max, palette }) {
    const safePct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            {/* Track */}
            <div style={{
                flex: 1,
                height: '8px',
                background: '#1f2937',
                borderRadius: '9999px',
                overflow: 'hidden',
            }}>
                {/* Fill */}
                <div style={{
                    width: `${safePct}%`,
                    height: '100%',
                    background: palette.bar,
                    borderRadius: '9999px',
                    transition: 'width 0.7s ease',
                    boxShadow: `0 0 8px ${palette.bar}88`,
                }} />
            </div>
            <span style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: palette.text,
                width: '40px',
                textAlign: 'right',
                fontWeight: 600,
            }}>
                {typeof value === 'number' ? value.toFixed(2) : '—'}
            </span>
        </div>
    );
}

// Radial ring for the composite score
function CompositeRing({ score, color }) {
    const r = 54;
    const circ = 2 * Math.PI * r;
    const filled = circ * ((score ?? 0) / 100);
    return (
        <svg width={130} height={130} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={65} cy={65} r={r} fill="none" stroke="#1f2937" strokeWidth={10} />
            <circle
                cx={65} cy={65} r={r} fill="none"
                stroke={color}
                strokeWidth={10}
                strokeDasharray={`${filled} ${circ}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 6px ${color})` }}
            />
        </svg>
    );
}

export default function ScoringBreakdown({ contract }) {
    const tier = contract.tier;
    const composite = contract.composite_score ?? 0;
    const palette = getTierPalette(tier);

    return (
        <div className="space-y-4">
            {/* Composite score hero */}
            <div className="card text-center">
                <p className="text-gray-400 text-sm mb-3">Composite Risk Score</p>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                    <CompositeRing score={composite} color={palette.ring} />
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <span style={{ fontSize: '2rem', fontWeight: 900, color: palette.text, lineHeight: 1 }}>
                            {composite.toFixed(1)}
                        </span>
                        <span style={{ fontSize: '11px', color: '#6b7280' }}>/100</span>
                    </div>
                </div>
                <div className={`mt-3 badge text-sm font-bold border px-4 py-1.5 mx-auto inline-flex
                    ${tier === 'Green' ? 'badge-green' : tier === 'Amber' ? 'badge-amber' : 'badge-red'}`}>
                    {tier} Tier
                </div>
                {contract.confidence_pct !== null && contract.confidence_pct !== undefined && (
                    <p className="text-xs text-gray-500 mt-2">
                        Confidence: <span className="text-gray-300 font-medium">{contract.confidence_pct?.toFixed(0)}%</span>
                        &nbsp;from nearest boundary
                    </p>
                )}
            </div>

            {/* Per-parameter breakdown */}
            <div className="card">
                <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <BarChart2 size={16} />
                    Parameter Breakdown
                </h2>
                <div className="space-y-5">
                    {PARAM_CONFIG.map(({ key, label, weight, maxContrib, inputKey, inputLabel, inputFormat }) => {
                        const val = typeof contract[key] === 'number' ? contract[key] : 0;
                        const pct = Math.min(100, (val / maxContrib) * 100);
                        const rawVal = contract[inputKey];
                        return (
                            <div key={key} style={{
                                borderLeft: `3px solid ${palette.bar}44`,
                                paddingLeft: '12px',
                            }}>
                                {/* Parameter name row */}
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium" style={{ color: palette.text }}>{label}</span>
                                    <div className="flex items-center gap-2">
                                        <span style={{
                                            fontSize: '11px',
                                            color: palette.text,
                                            fontWeight: 600,
                                            fontFamily: 'monospace',
                                        }}>
                                            {pct.toFixed(0)}%
                                        </span>
                                        <span className="text-xs text-gray-600">{weight} · max {maxContrib}pts</span>
                                    </div>
                                </div>

                                {/* Raw input value row */}
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs text-gray-500">{inputLabel}:</span>
                                    <span className="text-xs font-mono font-medium" style={{ color: palette.text + 'cc' }}>
                                        {inputFormat(rawVal)}
                                    </span>
                                </div>

                                {/* Score bar */}
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-600 w-16 shrink-0">Score</span>
                                    <ScoreBar value={val} max={maxContrib} palette={palette} />
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-5 pt-4 border-t border-gray-800 flex items-center justify-between">
                    <span className="text-sm text-gray-400">Total Composite</span>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: palette.text }}>
                        {composite.toFixed(2)} / 100
                    </span>
                </div>
            </div>

            {/* Override flags */}
            {(contract.override_amber || contract.override_red) && (
                <div className={`card border ${contract.override_red ? 'border-red-500/40 bg-red-900/10' : 'border-amber-500/40 bg-amber-900/10'}`}>
                    <div className="flex items-center gap-2 font-semibold text-sm mb-2">
                        <AlertTriangle size={14} className={contract.override_red ? 'text-red-400' : 'text-amber-400'} />
                        <span className={contract.override_red ? 'text-red-400' : 'text-amber-400'}>
                            Hard Override Triggered
                        </span>
                    </div>
                    <ul className="text-xs text-gray-400 space-y-1">
                        {contract.override_red && (
                            <li>• Forced <strong className="text-red-400">Red</strong>: Indemnification Unfavorable + Budget &gt; threshold</li>
                        )}
                        {contract.override_amber && !contract.override_red && (
                            <>
                                {contract.time_to_default_days < 7 && <li>• Forced <strong className="text-amber-400">Amber</strong>: Time to Default &lt; 7 days</li>}
                                {contract.budget_consideration_pct > 80 && <li>• Forced <strong className="text-amber-400">Amber</strong>: Budget &gt; 80% of annual procurement</li>}
                            </>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
