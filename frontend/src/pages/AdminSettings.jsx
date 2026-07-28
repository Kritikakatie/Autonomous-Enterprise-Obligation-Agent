import React, { useState, useEffect } from 'react';
import { Settings, Save, AlertTriangle, BarChart2, TrendingUp, RefreshCw } from 'lucide-react';
import { getAdminSettings, updateAdminSettings, getAdminDashboard } from '../api';
import { useAuth } from '../App';

function MetricCard({ label, value, sub }) {
    return (
        <div className="card">
            <p className="label">{label}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
            {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
    );
}

export default function AdminSettings() {
    const { role } = useAuth();
    const [settings, setSettings] = useState(null);
    const [edited, setEdited] = useState({});
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [metrics, setMetrics] = useState(null);
    const [activeTab, setActiveTab] = useState('settings');

    useEffect(() => {
        getAdminSettings().then(r => { setSettings(r.data); setEdited(r.data); });
        getAdminDashboard().then(r => setMetrics(r.data)).catch(() => { });
    }, []);

    const weightKeys = [
        ['weight_budget_consideration', 'Budget Consideration'],
        ['weight_reversibility', 'Reversibility (inverted)'],
        ['weight_time_to_default', 'Time to Default'],
        ['weight_transaction_value', 'Transaction Value'],
        ['weight_indemnification', 'Indemnification Scope'],
    ];

    const weightSum = weightKeys.reduce((s, [k]) => s + (parseFloat(edited[k]) || 0), 0);
    const weightValid = Math.abs(weightSum - 1.0) < 0.001;

    const handleSave = async () => {
        if (!weightValid) { setMsg('❌ Weights must sum to 1.0 (100%).'); return; }
        setSaving(true);
        try {
            await updateAdminSettings(edited, role);
            setMsg('✅ Settings saved successfully.');
            setTimeout(() => setMsg(''), 3000);
        } catch (e) {
            setMsg('❌ ' + (e.response?.data?.detail || e.message));
        } finally {
            setSaving(false);
        }
    };

    if (!settings) return (
        <div className="p-6 flex items-center justify-center">
            <RefreshCw size={20} className="animate-spin text-indigo-400" />
        </div>
    );

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold gradient-text">Admin Settings</h1>
                <p className="text-gray-500 text-sm mt-1">Configure scoring parameters, thresholds, and SLA windows</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-800">
                {[
                    { id: 'settings', label: 'Configuration', icon: Settings },
                    { id: 'dashboard', label: 'Feedback Metrics', icon: BarChart2 },
                ].map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all
              ${activeTab === id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        <Icon size={14} /> {label}
                    </button>
                ))}
            </div>

            {msg && (
                <div className={`px-4 py-3 rounded-xl text-sm font-medium ${msg.startsWith('✅') ? 'bg-green-900/30 text-green-400 border border-green-500/30' : 'bg-red-900/30 text-red-400 border border-red-500/30'}`}>
                    {msg}
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="space-y-5">
                    {/* Financial benchmarks */}
                    <div className="card">
                        <h2 className="font-semibold text-white mb-4">Financial Benchmarks</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <span className="label">Annual Procurement Budget (USD)</span>
                                <input type="number" className="input" value={edited.annual_procurement_budget || ''}
                                    onChange={e => setEdited(s => ({ ...s, annual_procurement_budget: parseFloat(e.target.value) }))} />
                            </div>
                            <div>
                                <span className="label">Max Transaction Value Benchmark (USD)</span>
                                <input type="number" className="input" value={edited.max_transaction_value_benchmark || ''}
                                    onChange={e => setEdited(s => ({ ...s, max_transaction_value_benchmark: parseFloat(e.target.value) }))} />
                            </div>
                        </div>
                    </div>

                    {/* Scoring weights */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold text-white">Scoring Weights</h2>
                            <span className={`badge text-xs font-bold ${weightValid ? 'badge-green' : 'badge-red'}`}>
                                Sum: {(weightSum * 100).toFixed(0)}% {weightValid ? '✓' : '≠ 100%'}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {weightKeys.map(([key, label]) => {
                                const pct = ((edited[key] || 0) * 100).toFixed(0);
                                return (
                                    <div key={key} className="flex items-center gap-4">
                                        <span className="text-sm text-gray-300 w-52">{label}</span>
                                        <input type="range" min="0" max="100" step="1" value={pct}
                                            className="flex-1 h-1.5 bg-gray-700 rounded appearance-none accent-indigo-500"
                                            onChange={e => setEdited(s => ({ ...s, [key]: parseFloat(e.target.value) / 100 }))} />
                                        <span className="text-sm font-mono text-indigo-400 w-12 text-right">{pct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Hard override thresholds */}
                    <div className="card">
                        <h2 className="font-semibold text-white mb-4">Hard Override Thresholds</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <span className="label">Force Amber: Time to Default &lt; (days)</span>
                                <input type="number" className="input" value={edited.override_time_to_default_days || ''}
                                    onChange={e => setEdited(s => ({ ...s, override_time_to_default_days: parseInt(e.target.value) }))} />
                            </div>
                            <div>
                                <span className="label">Force Amber: Budget &gt; (%)</span>
                                <input type="number" className="input" value={edited.override_budget_pct_amber || ''}
                                    onChange={e => setEdited(s => ({ ...s, override_budget_pct_amber: parseFloat(e.target.value) }))} />
                            </div>
                            <div>
                                <span className="label">Force Red (Unfavorable Indem.): Budget &gt; (%)</span>
                                <input type="number" className="input" value={edited.override_budget_pct_red_indemnification || ''}
                                    onChange={e => setEdited(s => ({ ...s, override_budget_pct_red_indemnification: parseFloat(e.target.value) }))} />
                            </div>
                        </div>
                    </div>

                    {/* SLA windows */}
                    <div className="card">
                        <h2 className="font-semibold text-white mb-4">SLA Windows</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <span className="label">Amber Dormancy Window (hours)</span>
                                <input type="number" className="input" value={edited.amber_sla_hours || ''}
                                    onChange={e => setEdited(s => ({ ...s, amber_sla_hours: parseInt(e.target.value) }))} />
                                <p className="text-xs text-gray-600 mt-1">Default: 48 hours</p>
                            </div>
                            <div>
                                <span className="label">Green Action Delay Window (hours)</span>
                                <input type="number" className="input" value={edited.green_delay_hours || ''}
                                    onChange={e => setEdited(s => ({ ...s, green_delay_hours: parseInt(e.target.value) }))} />
                                <p className="text-xs text-gray-600 mt-1">Default: 4 hours</p>
                            </div>
                        </div>
                    </div>

                    <button onClick={handleSave} disabled={saving || !weightValid} className="btn-primary flex items-center gap-2">
                        <Save size={14} />
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            )}

            {activeTab === 'dashboard' && metrics && (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MetricCard label="Total Contracts" value={metrics.total_contracts} />
                        <MetricCard label="Green" value={metrics.green_count} />
                        <MetricCard label="Amber" value={metrics.amber_count} />
                        <MetricCard label="Red" value={metrics.red_count} />
                    </div>

                    <div className="card">
                        <h2 className="font-semibold text-white mb-4">Correction Rate by Tier</h2>
                        <div className="space-y-3">
                            {metrics.correction_by_tier.map(({ tier, total, corrections, rate }) => (
                                <div key={tier} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className={tier === 'Green' ? 'text-green-400' : tier === 'Amber' ? 'text-amber-400' : 'text-red-400'}>
                                            {tier}
                                        </span>
                                        <span className="text-gray-400">{corrections}/{total} ({rate}%)</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${tier === 'Green' ? 'bg-green-500' : tier === 'Amber' ? 'bg-amber-500' : 'bg-red-500'}`}
                                            style={{ width: `${rate}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="card">
                            <h2 className="font-semibold text-white mb-3">Correction Rate by Parameter</h2>
                            {metrics.correction_by_parameter.length === 0
                                ? <p className="text-gray-600 text-sm">No corrections recorded yet.</p>
                                : metrics.correction_by_parameter.map(({ parameter, count }) => (
                                    <div key={parameter} className="flex justify-between text-sm py-1.5 border-b border-gray-800 last:border-0">
                                        <span className="text-gray-300">{parameter}</span>
                                        <span className="text-indigo-400 font-medium">{count}</span>
                                    </div>
                                ))
                            }
                        </div>

                        <div className="card">
                            <h2 className="font-semibold text-white mb-3">Red Contract Similarity Trend</h2>
                            {metrics.red_similarity_trend.length === 0
                                ? <p className="text-gray-600 text-sm">No Red actions yet.</p>
                                : metrics.red_similarity_trend.map(({ date, avg_similarity }) => (
                                    <div key={date} className="flex justify-between text-sm py-1.5 border-b border-gray-800 last:border-0">
                                        <span className="text-gray-400">{date}</span>
                                        <span className={`font-medium ${avg_similarity >= 70 ? 'text-green-400' : avg_similarity >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                                            {avg_similarity}%
                                        </span>
                                    </div>
                                ))
                            }
                            <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-600">
                                Amber Dormancy Rate: <span className="text-amber-400 font-semibold">{metrics.amber_dormancy_rate}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
