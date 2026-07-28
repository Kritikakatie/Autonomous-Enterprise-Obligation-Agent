import React, { useState } from 'react';
import { Mail, MessageSquare, Send, XCircle, AlertCircle, Edit3 } from 'lucide-react';
import FeedbackModal from './FeedbackModal';

const CHANNELS = ['Email', 'Slack', 'Teams'];

export default function AmberDraftEditor({ contract, onSend, onReject }) {
    const [emailDraft, setEmailDraft] = useState(contract.agent_email_draft || '');
    const [slackDraft, setSlackDraft] = useState(contract.agent_slack_draft || '');
    const [channel, setChannel] = useState('Email');
    const [showConsequence, setShowConsequence] = useState(false);
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [sending, setSending] = useState(false);

    const handleSend = async () => {
        if (!showConsequence) { setShowConsequence(true); return; }
        setSending(true);
        await onSend({ final_email: emailDraft, final_slack: slackDraft, channel_used: channel });
        setSending(false);
    };

    if (contract.status === 'Action Taken') {
        return (
            <div className="card border border-amber-500/20 text-amber-400 text-sm">
                ✅ Message sent via <strong>{contract.amber_channel}</strong>.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="card border border-amber-500/20 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-amber-400 flex items-center gap-2">
                        <Edit3 size={15} /> Draft Message Editor
                    </h2>
                    <div className="flex gap-2">
                        {CHANNELS.map(c => (
                            <button
                                key={c}
                                onClick={() => setChannel(c)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${channel === c ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                    }`}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Email */}
                    <div>
                        <div className="flex items-center gap-1.5 label mb-2">
                            <Mail size={11} /> Email Draft
                        </div>
                        <textarea
                            value={emailDraft}
                            onChange={e => setEmailDraft(e.target.value)}
                            rows={12}
                            className="input resize-none font-mono text-xs leading-relaxed"
                            placeholder="Email draft will appear here after LLM generation..."
                        />
                    </div>

                    {/* Slack/Teams */}
                    <div>
                        <div className="flex items-center gap-1.5 label mb-2">
                            <MessageSquare size={11} /> Slack / Teams Draft
                        </div>
                        <textarea
                            value={slackDraft}
                            onChange={e => setSlackDraft(e.target.value)}
                            rows={12}
                            className="input resize-none font-mono text-xs leading-relaxed"
                            placeholder="Slack message draft will appear here..."
                        />
                    </div>
                </div>

                {/* Consequence summary */}
                {showConsequence && contract.consequence_summary && (
                    <div className="border border-amber-500/40 bg-amber-900/20 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm mb-2">
                            <AlertCircle size={14} /> Consequence Summary
                        </div>
                        <p className="text-gray-300 text-sm">{contract.consequence_summary}</p>
                        <p className="text-xs text-gray-500 mt-2">Sending this message commits your organization. Confirm to proceed.</p>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={handleSend}
                        disabled={sending}
                        className="btn-amber flex items-center gap-2"
                    >
                        <Send size={14} />
                        {showConsequence ? (sending ? 'Sending...' : `Confirm & Send via ${channel}`) : 'Review & Send'}
                    </button>
                    <button
                        onClick={() => setFeedbackOpen(true)}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <XCircle size={14} /> Reject Recommendation
                    </button>
                </div>
            </div>

            {feedbackOpen && (
                <FeedbackModal
                    tier="Amber"
                    suggestions={[]}
                    onSubmit={(body) => { setFeedbackOpen(false); onReject(body); }}
                    onClose={() => setFeedbackOpen(false)}
                />
            )}
        </div>
    );
}
