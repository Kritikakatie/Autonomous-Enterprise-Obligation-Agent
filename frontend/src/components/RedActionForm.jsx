import React, { useState } from 'react';
import { ClipboardList, Send } from 'lucide-react';

const ACTION_TYPES = [
    'Initiate Renegotiation', 'Escalate to Legal', 'Reject Contract',
    'Request Clarification', 'Escalate to Executive', 'Place on Hold'
];
const CHANNELS = ['Email', 'Slack', 'Teams', 'Formal Letter'];
const ESCALATION_PATHS = ['Legal', 'Finance', 'Executive', 'Procurement Head'];

export default function RedActionForm({ onSubmit }) {
    const [form, setForm] = useState({
        action_type: '',
        counterparty: '',
        proposed_terms: '',
        deadline: '',
        channel: '',
        escalation_path: '',
    });
    const [submitting, setSubmitting] = useState(false);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async () => {
        const missing = Object.entries(form).filter(([k, v]) => !v).map(([k]) => k);
        if (missing.length) { alert(`Please fill in: ${missing.join(', ')}`); return; }
        if (form.proposed_terms.length > 500) { alert('Proposed Terms must be ≤ 500 characters.'); return; }
        setSubmitting(true);
        await onSubmit(form);
        setSubmitting(false);
    };

    return (
        <div className="card border border-red-500/20 space-y-4">
            <h2 className="font-semibold text-red-400 flex items-center gap-2">
                <ClipboardList size={15} /> Structured Action Form
            </h2>
            <p className="text-xs text-gray-500">
                The agent CANNOT act autonomously on Red contracts. Complete this form to initiate an action.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <span className="label">Action Type *</span>
                    <select className="input" value={form.action_type} onChange={e => set('action_type', e.target.value)}>
                        <option value="">Select action...</option>
                        {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <span className="label">Counterparty Contact *</span>
                    <input className="input" placeholder="e.g. John Doe, Vendor Legal Team" value={form.counterparty}
                        onChange={e => set('counterparty', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                    <span className="label">Proposed Terms Summary * (max 500 chars)</span>
                    <textarea className="input" rows={3} placeholder="Brief summary of proposed terms or changes..." maxLength={500}
                        value={form.proposed_terms} onChange={e => set('proposed_terms', e.target.value)} />
                    <p className="text-xs text-gray-600 mt-0.5">{form.proposed_terms.length}/500</p>
                </div>
                <div>
                    <span className="label">Deadline for Response *</span>
                    <input type="date" className="input" value={form.deadline}
                        onChange={e => set('deadline', e.target.value)} />
                </div>
                <div>
                    <span className="label">Communication Channel *</span>
                    <select className="input" value={form.channel} onChange={e => set('channel', e.target.value)}>
                        <option value="">Select channel...</option>
                        {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <span className="label">Escalation Path *</span>
                    <select className="input" value={form.escalation_path} onChange={e => set('escalation_path', e.target.value)}>
                        <option value="">Select escalation path...</option>
                        {ESCALATION_PATHS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            <button onClick={handleSubmit} disabled={submitting} className="btn-danger flex items-center gap-2 w-fit">
                <Send size={14} />
                {submitting ? 'Submitting...' : 'Submit Action & Compare with Agent'}
            </button>
        </div>
    );
}
