import React, { useState, useEffect } from 'react';
import { Mail, RefreshCw, Send, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import { regenerateEmail, sendVendorEmail, getEmailHistory } from '../api';

const INTENTS = [
    {
        id: 'confirmation',
        label: '✅ Confirmation',
        desc: 'Formally accept and confirm the contract with vendor',
        color: { bg: '#14532d22', border: '#22c55e55', text: '#4ade80', pill: '#16a34a' },
    },
    {
        id: 'changes',
        label: '✏️ Request Changes',
        desc: 'Ask vendor to amend specific clauses before proceeding',
        color: { bg: '#78350f22', border: '#f59e0b55', text: '#fbbf24', pill: '#d97706' },
    },
    {
        id: 'rejection',
        label: '🚫 Rejection',
        desc: 'Formally decline the contract',
        color: { bg: '#450a0a22', border: '#ef444455', text: '#f87171', pill: '#dc2626' },
    },
];

const INTENT_BADGE_STYLE = {
    confirmation: { background: '#14532d', color: '#4ade80', border: '1px solid #16a34a' },
    changes: { background: '#78350f', color: '#fbbf24', border: '1px solid #d97706' },
    rejection: { background: '#450a0a', color: '#f87171', border: '1px solid #dc2626' },
};

function HistoryPanel({ contractId }) {
    const [history, setHistory] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await getEmailHistory(contractId);
            setHistory(res.data);
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [contractId]);

    return (
        <div style={{
            border: '1px solid #1f2937',
            borderRadius: '12px',
            overflow: 'hidden',
            background: '#0f1117',
        }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', padding: '12px 16px',
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', color: '#9ca3af',
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                    <Clock size={14} />
                    Sent History ({history.length})
                </span>
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {open && (
                <div style={{ borderTop: '1px solid #1f2937', padding: '12px 16px' }}>
                    {loading && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '12px' }}>
                            <Loader size={12} className="animate-spin" /> Loading...
                        </div>
                    )}
                    {!loading && history.length === 0 && (
                        <p style={{ color: '#4b5563', fontSize: '12px', margin: 0 }}>No emails sent yet.</p>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {history.map(e => (
                            <div key={e.id} style={{
                                background: '#111827', borderRadius: '10px',
                                padding: '10px 14px', border: '1px solid #1f2937',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            ...INTENT_BADGE_STYLE[e.intent],
                                            padding: '2px 8px', borderRadius: '6px',
                                            fontSize: '10px', fontWeight: 700, textTransform: 'capitalize',
                                        }}>
                                            {e.intent}
                                        </span>
                                        <span style={{
                                            fontSize: '10px', fontWeight: 600,
                                            color: e.smtp_status === 'sent' ? '#4ade80' : '#f87171',
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                        }}>
                                            {e.smtp_status === 'sent'
                                                ? <><CheckCircle size={10} /> Delivered</>
                                                : <><XCircle size={10} /> Failed</>
                                            }
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '10px', color: '#4b5563' }}>
                                        {new Date(e.sent_at).toLocaleString()}
                                    </span>
                                </div>
                                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0' }}>
                                    To: <span style={{ color: '#d1d5db' }}>{e.to_email}</span>
                                </p>
                                <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0' }}>
                                    {e.subject}
                                </p>
                                {e.smtp_error && (
                                    <p style={{ fontSize: '11px', color: '#f87171', marginTop: '4px', fontFamily: 'monospace' }}>
                                        ⚠ {e.smtp_error}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function EmailAgent({ contract }) {
    const [intent, setIntent] = useState('confirmation');
    const [toEmail, setToEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState(contract.agent_email_draft || '');
    const [extraContext, setExtraContext] = useState('');
    const [regenerating, setRegenerating] = useState(false);
    const [sending, setSending] = useState(false);
    const [statusMsg, setStatusMsg] = useState(null); // {type:'success'|'error'|'warn', text}
    const [regenCount, setRegenCount] = useState(0);

    const activeIntent = INTENTS.find(i => i.id === intent);

    const handleRegenerate = async () => {
        setRegenerating(true);
        setStatusMsg(null);
        try {
            const res = await regenerateEmail(contract.id, { intent, extra_context: extraContext });
            setSubject(res.data.subject || '');
            setBody(res.data.body || '');
            setRegenCount(c => c + 1);
            setStatusMsg({ type: 'success', text: `✅ Draft regenerated using ${res.data.model_version?.split('@')[0] || 'LLM'}.` });
        } catch (e) {
            setStatusMsg({ type: 'error', text: `❌ Regenerate failed: ${e.response?.data?.detail || e.message}` });
        } finally {
            setRegenerating(false);
        }
    };

    const handleSend = async () => {
        if (!toEmail.trim()) {
            setStatusMsg({ type: 'warn', text: '⚠ Please enter a recipient email address.' });
            return;
        }
        if (!subject.trim() || !body.trim()) {
            setStatusMsg({ type: 'warn', text: '⚠ Subject and body cannot be empty.' });
            return;
        }
        setSending(true);
        setStatusMsg(null);
        try {
            const res = await sendVendorEmail(contract.id, { to_email: toEmail, subject, body, intent });
            if (res.data.status === 'sent') {
                setStatusMsg({ type: 'success', text: `✅ Email delivered to ${toEmail}. (ID: ${res.data.email_id})` });
            } else {
                setStatusMsg({ type: 'error', text: `⚠ Email recorded but not delivered: ${res.data.error}` });
            }
        } catch (e) {
            setStatusMsg({ type: 'error', text: `❌ Send failed: ${e.response?.data?.detail || e.message}` });
        } finally {
            setSending(false);
        }
    };

    const statusStyle = {
        success: { background: '#14532d22', border: '1px solid #16a34a55', color: '#4ade80' },
        error: { background: '#450a0a22', border: '1px solid #dc262655', color: '#f87171' },
        warn: { background: '#78350f22', border: '1px solid #d9770655', color: '#fbbf24' },
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Intent selector */}
            <div className="card" style={{ padding: '16px' }}>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Email Intent
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {INTENTS.map(it => (
                        <button
                            key={it.id}
                            onClick={() => setIntent(it.id)}
                            style={{
                                padding: '10px 12px',
                                borderRadius: '10px',
                                border: `1px solid ${intent === it.id ? it.color.border : '#1f2937'}`,
                                background: intent === it.id ? it.color.bg : 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.2s',
                                outline: 'none',
                            }}
                        >
                            <div style={{ fontSize: '13px', fontWeight: 700, color: intent === it.id ? it.color.text : '#6b7280' }}>
                                {it.label}
                            </div>
                            <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '3px', lineHeight: 1.3 }}>
                                {it.desc}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Compose panel */}
            <div className="card" style={{
                padding: '16px',
                border: `1px solid ${activeIntent.color.border}`,
                background: activeIntent.color.bg,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: activeIntent.color.text, fontWeight: 700, fontSize: '15px', margin: 0 }}>
                        <Mail size={15} /> Vendor Email Composer
                    </h2>
                    <button
                        onClick={handleRegenerate}
                        disabled={regenerating}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '6px 14px', borderRadius: '8px',
                            background: '#1f2937', color: '#d1d5db',
                            border: '1px solid #374151', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 600,
                            opacity: regenerating ? 0.6 : 1,
                        }}
                    >
                        <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />
                        {regenerating ? 'Drafting…' : `Regenerate Draft${regenCount > 0 ? ` (${regenCount})` : ''}`}
                    </button>
                </div>

                {/* To field */}
                <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                        TO (Vendor Email)
                    </label>
                    <input
                        type="email"
                        placeholder="vendor@example.com"
                        value={toEmail}
                        onChange={e => setToEmail(e.target.value)}
                        className="input"
                        style={{ fontSize: '13px' }}
                    />
                </div>

                {/* Subject */}
                <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                        SUBJECT
                    </label>
                    <input
                        type="text"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        placeholder="Subject line (auto-filled after draft)"
                        className="input"
                        style={{ fontSize: '13px' }}
                    />
                </div>

                {/* Body */}
                <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                        EMAIL BODY
                    </label>
                    <textarea
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        rows={12}
                        className="input"
                        style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6' }}
                        placeholder="Click 'Regenerate Draft' to generate an LLM-written email, or type your own."
                    />
                </div>

                {/* Extra context (shown for changes/rejection) */}
                {(intent === 'changes' || intent === 'rejection') && (
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                            EXTRA CONTEXT FOR LLM <span style={{ color: '#4b5563', fontWeight: 400 }}>(optional — guides regeneration)</span>
                        </label>
                        <textarea
                            value={extraContext}
                            onChange={e => setExtraContext(e.target.value)}
                            rows={2}
                            className="input"
                            style={{ fontSize: '12px', resize: 'vertical' }}
                            placeholder={intent === 'changes'
                                ? "e.g. 'Request 30-day termination notice instead of 90, and remove unlimited liability clause'"
                                : "e.g. 'Vendor was non-responsive for 3 weeks, cite that as reason'"}
                        />
                    </div>
                )}

                {/* Status message */}
                {statusMsg && (
                    <div style={{
                        ...statusStyle[statusMsg.type],
                        borderRadius: '8px', padding: '10px 14px',
                        fontSize: '13px', marginBottom: '12px',
                    }}>
                        {statusMsg.text}
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={handleSend}
                        disabled={sending}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 20px', borderRadius: '10px',
                            background: activeIntent.color.pill,
                            color: '#fff', border: 'none',
                            cursor: sending ? 'not-allowed' : 'pointer',
                            fontWeight: 700, fontSize: '13px',
                            opacity: sending ? 0.7 : 1,
                            boxShadow: `0 0 16px ${activeIntent.color.pill}66`,
                        }}
                    >
                        {sending ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                        {sending ? 'Sending…' : 'Send to Vendor'}
                    </button>
                    <div style={{ fontSize: '11px', color: '#4b5563', display: 'flex', alignItems: 'center' }}>
                        {!subject && !body ? 'Generate a draft first, then send.' : 'Review the draft before sending.'}
                    </div>
                </div>
            </div>

            {/* Sent history */}
            <HistoryPanel contractId={contract.id} key={statusMsg?.text} />
        </div>
    );
}
