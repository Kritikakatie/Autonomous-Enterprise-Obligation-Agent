import React, { useState } from 'react';
import { X, AlertTriangle, CheckSquare } from 'lucide-react';

const ERROR_TYPES = ['Extraction Error', 'Scoring Error', 'Policy Error'];

export default function FeedbackModal({ tier, suggestions, onSubmit, onClose }) {
    const [selectedKeys, setSelectedKeys] = useState([]);
    const [errorTypes, setErrorTypes] = useState({});
    // Amber-specific
    const [amberParam, setAmberParam] = useState('');
    const [amberError, setAmberError] = useState('');

    const AMBER_PARAMS = [
        'Budget Consideration', 'Reversibility', 'Time to Default',
        'Total Transaction Value', 'Indemnification Scope',
    ];

    const toggleKey = (key) => {
        setSelectedKeys(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const handleSubmit = () => {
        if (tier === 'Green') {
            if (selectedKeys.length === 0) { alert('Select at least one incorrect suggestion.'); return; }
            onSubmit({ flagged_suggestion_keys: selectedKeys, error_types: errorTypes });
        } else {
            if (!amberParam) { alert('Select an affected parameter.'); return; }
            if (!amberError) { alert('Select an error type.'); return; }
            onSubmit({ parameter_affected: amberParam, correction_type: amberError });
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="glass border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={16} className="text-amber-400" />
                        <span className="font-semibold text-white text-sm">
                            {tier === 'Green' ? 'Revoke Feedback' : 'Rejection Feedback'}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors">
                        <X size={14} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {tier === 'Green' ? (
                        <>
                            <p className="text-sm text-gray-300">
                                Which of the following agent suggestions were incorrectly assessed?
                            </p>
                            <div className="space-y-2">
                                {suggestions.map(s => (
                                    <div key={s.key} className={`border rounded-xl p-3 cursor-pointer transition-all duration-200 ${selectedKeys.includes(s.key)
                                            ? 'border-red-500/50 bg-red-900/20'
                                            : 'border-gray-700 hover:border-gray-500'
                                        }`}
                                        onClick={() => toggleKey(s.key)}
                                    >
                                        <div className="flex items-start gap-2">
                                            <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-all ${selectedKeys.includes(s.key) ? 'bg-red-500 border-red-500' : 'border-gray-600'
                                                }`}>
                                                {selectedKeys.includes(s.key) && <CheckSquare size={10} className="text-white" />}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-medium text-gray-200">{s.label}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">{s.recommendation}</p>
                                            </div>
                                        </div>
                                        {selectedKeys.includes(s.key) && (
                                            <div className="mt-2 pl-6">
                                                <span className="label">Tag as error type:</span>
                                                <select
                                                    className="input mt-1 text-xs"
                                                    value={errorTypes[s.key] || ''}
                                                    onChange={e => setErrorTypes(prev => ({ ...prev, [s.key]: e.target.value }))}
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <option value="">Select type...</option>
                                                    {ERROR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <span className="label">Which parameter did the AI assess incorrectly?</span>
                                <select className="input" value={amberParam} onChange={e => setAmberParam(e.target.value)}>
                                    <option value="">Select parameter...</option>
                                    {AMBER_PARAMS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <span className="label">Error type</span>
                                <div className="flex gap-2 mt-1">
                                    {ERROR_TYPES.map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setAmberError(t)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${amberError === t
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                }`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    <div className="flex gap-3 pt-2 border-t border-gray-800">
                        <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                        <button onClick={handleSubmit} className="btn-danger flex-1">Submit Feedback</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
