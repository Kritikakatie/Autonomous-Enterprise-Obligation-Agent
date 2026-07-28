import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Edit3, Check, AlertTriangle, XCircle, CheckCircle,
    Clock, RefreshCw, FileText, BarChart2, Shield, Zap, Mail
} from 'lucide-react';
import {
    getContract, updateExtraction, confirmExtraction,
    affirmDecision, revokeDecision, amberSend, amberReject, redAction
} from '../api';
import { useAuth } from '../App';
import ScoringBreakdown from '../components/ScoringBreakdown';
import FeedbackModal from '../components/FeedbackModal';
import AmberDraftEditor from '../components/AmberDraftEditor';
import RedActionForm from '../components/RedActionForm';
import SimilarityReport from '../components/SimilarityReport';
import EmailAgent from '../components/EmailAgent';

const TIER_COLORS = {
    Green: 'text-green-400 bg-green-900/20 border-green-500/30',
    Amber: 'text-amber-400 bg-amber-900/20 border-amber-500/30',
    Red: 'text-red-400 bg-red-900/20 border-red-500/30',
};

function CountdownTimer({ deadline, onExpired }) {
    const [remaining, setRemaining] = useState('');
    const [expired, setExpired] = useState(false);

    useEffect(() => {
        if (!deadline) return;
        const update = () => {
            const diff = new Date(deadline + 'Z') - new Date();
            if (diff <= 0) {
                setRemaining('00:00:00');
                if (!expired) { setExpired(true); onExpired?.(); }
                return;
            }
            const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
            const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            setRemaining(`${h}:${m}:${s}`);
        };
        update();
        const iv = setInterval(update, 1000);
        return () => clearInterval(iv);
    }, [deadline]);

    return (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold
      ${expired ? 'text-gray-400 bg-gray-800' : 'text-amber-400 bg-amber-900/20 border border-amber-500/20'}`}>
            <Clock size={16} />
            {remaining || 'Calculating...'}
        </div>
    );
}

function FieldRow({ label, value, editing, onEdit, fieldKey }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="label">{label}</span>
            {editing ? (
                <input
                    className="input"
                    value={value ?? ''}
                    onChange={e => onEdit(fieldKey, e.target.value)}
                />
            ) : (
                <span className="text-sm text-gray-200">{value ?? <span className="text-gray-600">—</span>}</span>
            )}
        </div>
    );
}

export default function ContractDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { role } = useAuth();
    const [contract, setContract] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [editFields, setEditFields] = useState({});
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [similarityResult, setSimilarityResult] = useState(null);
    const [actionMsg, setActionMsg] = useState('');
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    const fetch = async () => {
        setLoading(true);
        try {
            const res = await getContract(id);
            setContract(res.data);
            setEditFields(res.data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetch(); }, [id]);
    useEffect(() => {
        if (!contract) return;
        const statuses = ['Uploading', 'Extracting', 'Extracted', 'Scoring'];
        if (statuses.includes(contract.status)) {
            const iv = setInterval(fetch, 5000);
            return () => clearInterval(iv);
        }
    }, [contract?.status]);

    const handleSaveExtraction = async () => {
        setSaving(true);
        try {
            await updateExtraction(id, editFields, role);
            await fetch();
            setEditing(false);
            setActionMsg('✅ Extraction updated.');
        } catch (e) {
            setActionMsg('❌ ' + (e.response?.data?.detail || 'Save failed'));
        } finally {
            setSaving(false);
        }
    };

    const handleConfirm = async () => {
        setSaving(true);
        try {
            await confirmExtraction(id, role);
            await fetch();
            setActionMsg('✅ Confirmed. Scoring complete.');
        } catch (e) {
            setActionMsg('❌ ' + (e.response?.data?.detail || 'Confirm failed'));
        } finally {
            setSaving(false);
        }
    };

    const handleAffirm = async () => {
        try {
            await affirmDecision(id, role);
            await fetch();
            setActionMsg('✅ Decision affirmed. Agent will execute after countdown.');
        } catch (e) {
            setActionMsg('❌ ' + e.message);
        }
    };

    const handleRevoke = async (body) => {
        try {
            await revokeDecision(id, { auditor_id: role, ...body });
            setFeedbackOpen(false);
            await fetch();
            setActionMsg('✅ Decision revoked. Feedback saved.');
        } catch (e) {
            setActionMsg('❌ ' + e.message);
        }
    };

    const handleAmberSend = async (body) => {
        try {
            await amberSend(id, { auditor_id: role, ...body });
            await fetch();
            setActionMsg('✅ Message sent!');
        } catch (e) {
            setActionMsg('❌ ' + e.message);
        }
    };

    const handleAmberReject = async (body) => {
        try {
            await amberReject(id, { auditor_id: role, ...body });
            await fetch();
            setActionMsg('✅ Rejection feedback saved.');
        } catch (e) {
            setActionMsg('❌ ' + e.message);
        }
    };

    const handleRedAction = async (body) => {
        try {
            const res = await redAction(id, { auditor_id: role, ...body });
            setSimilarityResult(res.data.similarity);
            await fetch();
            setActionMsg('✅ Action submitted. See similarity report below.');
        } catch (e) {
            setActionMsg('❌ ' + e.message);
        }
    };

    if (loading) return (
        <div className="p-6 flex items-center justify-center h-full">
            <RefreshCw size={24} className="animate-spin text-indigo-400" />
        </div>
    );

    if (!contract) return <div className="p-6 text-gray-400">Contract not found.</div>;

    const tier = contract.tier;
    const tierColor = TIER_COLORS[tier] || '';
    const inProgress = ['Uploading', 'Extracting', 'Scoring'].includes(contract.status);
    const suggestions = contract.suggestion_report?.recommendations || [];

    return (
        <div className="p-6 space-y-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors">
                    <ArrowLeft size={16} />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-white">{contract.vendor_name || contract.filename}</h1>
                    <p className="text-gray-500 text-sm">{contract.filename}</p>
                </div>
                {tier && (
                    <div className={`badge border px-4 py-1.5 text-sm font-bold ${tierColor}`}>
                        {tier === 'Green' ? <CheckCircle size={14} /> : tier === 'Amber' ? <AlertTriangle size={14} /> : <XCircle size={14} />}
                        {tier} Tier
                    </div>
                )}
                {contract.status === 'Dormant' && (
                    <div className="badge badge-red text-xs animate-pulse-slow">DORMANT — SLA BREACHED</div>
                )}
            </div>

            {actionMsg && (
                <div className={`px-4 py-3 rounded-xl text-sm font-medium ${actionMsg.startsWith('✅') ? 'bg-green-900/30 text-green-400 border border-green-500/30' : 'bg-red-900/30 text-red-400 border border-red-500/30'}`}>
                    {actionMsg}
                </div>
            )}

            {inProgress && (
                <div className="card border border-indigo-500/20 flex items-center gap-3">
                    <RefreshCw size={16} className="animate-spin text-indigo-400" />
                    <span className="text-indigo-300 text-sm font-medium">{contract.status}... This may take up to a minute.</span>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-800 pb-0">
                {[
                    { id: 'overview', label: 'Overview', icon: FileText },
                    { id: 'scoring', label: 'Scoring', icon: BarChart2, hide: !contract.composite_score },
                    { id: 'reports', label: 'Reports', icon: Shield, hide: !contract.suggestion_report },
                    { id: 'action', label: 'Action', icon: Zap, hide: !contract.tier },
                    { id: 'email', label: 'Email', icon: Mail, hide: !contract.tier },
                ].filter(t => !t.hide).map(({ id: tid, label, icon: Icon }) => (
                    <button
                        key={tid}
                        onClick={() => setActiveTab(tid)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200
              ${activeTab === tid
                                ? 'border-indigo-500 text-indigo-400'
                                : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        <Icon size={14} />
                        {label}
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="card space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-white">Extracted Fields</h2>
                        {['Extracted', 'Scored'].includes(contract.status) && (
                            <div className="flex gap-2">
                                {editing
                                    ? <>
                                        <button onClick={handleSaveExtraction} disabled={saving} className="btn-success flex items-center gap-1.5 text-xs">
                                            <Check size={12} /> Save
                                        </button>
                                        <button onClick={() => setEditing(false)} className="btn-secondary text-xs">Cancel</button>
                                    </>
                                    : <button onClick={() => setEditing(true)} className="btn-secondary flex items-center gap-1.5 text-xs">
                                        <Edit3 size={12} /> Edit Fields
                                    </button>
                                }
                                {!editing && contract.status === 'Extracted' && (
                                    <button onClick={handleConfirm} disabled={saving} className="btn-primary text-xs">
                                        Confirm & Score →
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                            ['Vendor / Supplier', 'vendor_name'],
                            ['Contract Start', 'contract_start_date'],
                            ['Contract End / Renewal', 'contract_end_date'],
                            ['Total Value (USD)', 'total_contract_value'],
                            ['Budget Consideration (%)', 'budget_consideration_pct'],
                            ['Time to Default (days)', 'time_to_default_days'],
                            ['Historical Txn Value', 'total_historical_transaction_value'],
                            ['Indemnification Scope', 'indemnification_scope'],
                            ['Reversibility Score (0–10)', 'reversibility_score'],
                            ['Auto-Renewal', 'auto_renewal'],
                            ['Governing Law', 'governing_law'],
                        ].map(([label, key]) => (
                            <FieldRow
                                key={key} label={label} value={editFields[key]?.toString?.() ?? editFields[key]}
                                editing={editing} fieldKey={key}
                                onEdit={(k, v) => setEditFields(prev => ({ ...prev, [k]: v }))}
                            />
                        ))}
                        {/* Text areas */}
                        {[['Key SLA Terms', 'key_sla_terms'], ['Penalty Clauses', 'penalty_clauses']].map(([l, k]) => (
                            <div key={k} className="sm:col-span-2">
                                <span className="label">{l}</span>
                                {editing
                                    ? <textarea className="input" rows={3} value={editFields[k] || ''} onChange={e => setEditFields(p => ({ ...p, [k]: e.target.value }))} />
                                    : <p className="text-sm text-gray-200 whitespace-pre-wrap">{contract[k] || <span className="text-gray-600">—</span>}</p>
                                }
                            </div>
                        ))}
                    </div>
                    {contract.model_version && (
                        <p className="text-xs text-gray-600 border-t border-gray-800 pt-3">Model: {contract.model_version}</p>
                    )}
                </div>
            )}

            {/* Scoring Tab */}
            {activeTab === 'scoring' && contract.composite_score !== null && (
                <ScoringBreakdown contract={contract} />
            )}

            {/* Reports Tab */}
            {activeTab === 'reports' && contract.suggestion_report && (
                <div className="space-y-4">
                    <div className="card">
                        <h2 className="font-semibold text-white mb-3">Risk Summary</h2>
                        <p className="text-gray-300 text-sm leading-relaxed">{contract.suggestion_report.risk_summary}</p>
                    </div>
                    <div className="card">
                        <h2 className="font-semibold text-white mb-3">Recommendations</h2>
                        <div className="space-y-3">
                            {suggestions.map((s, i) => (
                                <div key={i} className="border border-gray-700/50 rounded-xl p-3">
                                    <div className="font-medium text-sm text-indigo-300">{s.label}</div>
                                    <div className="text-xs text-gray-400 mt-1"><span className="text-gray-500">Finding:</span> {s.finding}</div>
                                    <div className="text-xs text-gray-300 mt-1"><span className="text-gray-500">Action:</span> {s.recommendation}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {contract.contract_summary && (
                        <div className="card">
                            <h2 className="font-semibold text-white mb-3">Plain Language Summary</h2>
                            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{contract.contract_summary}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Action Tab */}
            {activeTab === 'action' && (
                <div className="space-y-4">
                    {/* GREEN TIER */}
                    {tier === 'Green' && contract.status === 'Awaiting Action' && (
                        <div className="card border border-green-500/20 glow-green">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="font-semibold text-green-400 flex items-center gap-2">
                                    <CheckCircle size={16} /> Agent Decision
                                </h2>
                                <span className={`badge text-lg font-bold px-4 py-1.5 ${contract.agent_decision === 'ACCEPT' ? 'badge-green' : 'badge-red'}`}>
                                    {contract.agent_decision}
                                </span>
                            </div>
                            <div className="mb-4">
                                <p className="label">Execution Countdown</p>
                                <CountdownTimer deadline={contract.decision_deadline} />
                                <p className="text-xs text-gray-500 mt-1">Agent will auto-execute after this window if not revoked.</p>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={handleAffirm} className="btn-success flex items-center gap-2">
                                    <CheckCircle size={14} /> Affirm Decision
                                </button>
                                <button onClick={() => setFeedbackOpen(true)} className="btn-danger flex items-center gap-2">
                                    <XCircle size={14} /> Revoke & Feedback
                                </button>
                            </div>
                        </div>
                    )}

                    {tier === 'Green' && contract.auditor_affirmed !== null && (
                        <div className={`card border ${contract.auditor_affirmed ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}>
                            {contract.auditor_affirmed ? '✅ You affirmed this decision.' : '❌ You revoked this decision.'}
                        </div>
                    )}

                    {/* AMBER TIER */}
                    {tier === 'Amber' && (
                        <AmberDraftEditor
                            contract={contract}
                            onSend={handleAmberSend}
                            onReject={handleAmberReject}
                        />
                    )}

                    {/* RED TIER */}
                    {tier === 'Red' && !similarityResult && contract.status === 'Awaiting Action' && (
                        <>
                            {contract.agent_suggested_action && (
                                <div className="card border border-red-500/20">
                                    <h2 className="font-semibold text-red-400 mb-3 flex items-center gap-2">
                                        <Zap size={14} /> Agent Suggested Action
                                    </h2>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        {Object.entries(contract.agent_suggested_action).map(([k, v]) => (
                                            <div key={k}>
                                                <span className="label">{k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                                                <span className="text-gray-200">{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <RedActionForm onSubmit={handleRedAction} />
                        </>
                    )}

                    {similarityResult && <SimilarityReport data={similarityResult} />}
                    {tier === 'Red' && contract.status === 'Action Taken' && !similarityResult && (
                        <div className="card border border-gray-600 text-gray-400 text-sm">✅ Action submitted for this contract.</div>
                    )}
                </div>
            )}

            {/* Email Agent Tab */}
            {activeTab === 'email' && contract.tier && (
                <EmailAgent contract={contract} />
            )}

            {/* Feedback Modal for Green revoke */}
            {feedbackOpen && (
                <FeedbackModal
                    tier="Green"
                    suggestions={suggestions}
                    onSubmit={handleRevoke}
                    onClose={() => setFeedbackOpen(false)}
                />
            )}
        </div>
    );
}
