import React, { useState, useEffect } from 'react';
import { ScrollText, Search, Filter, ChevronDown, RefreshCw } from 'lucide-react';
import { getAuditLog } from '../api';
import { format } from 'date-fns';

const ACTION_COLORS = {
    contract_uploaded: 'text-blue-400',
    extraction_completed: 'text-indigo-400',
    score_computed: 'text-purple-400',
    tier_assigned: 'text-orange-400',
    agent_decision_made: 'text-yellow-400',
    notification_sent: 'text-gray-400',
    auditor_action_taken: 'text-green-400',
    feedback_submitted: 'text-pink-400',
    escalation_triggered: 'text-red-400',
    action_executed: 'text-emerald-400',
    auditor_affirmed: 'text-green-400',
    auditor_revoked: 'text-red-400',
    amber_message_sent: 'text-amber-400',
    amber_rejected: 'text-orange-400',
    red_action_submitted: 'text-red-400',
};

export default function AuditLog() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        contract_id: '',
        tier: '',
        action_type: '',
        date_from: '',
        date_to: '',
        user_id: '',
    });

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = Object.fromEntries(
                Object.entries(filters).filter(([, v]) => v !== '')
            );
            const res = await getAuditLog({ ...params, limit: 200 });
            setLogs(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchLogs(); }, []);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold gradient-text">Audit Log</h1>
                    <p className="text-gray-500 text-sm mt-1">Immutable, append-only system event log</p>
                </div>
                <button onClick={fetchLogs} className="btn-secondary flex items-center gap-2">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="card">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div>
                        <span className="label">Contract ID</span>
                        <input className="input" placeholder="e.g. 42" value={filters.contract_id}
                            onChange={e => setFilters(f => ({ ...f, contract_id: e.target.value }))} />
                    </div>
                    <div>
                        <span className="label">Tier</span>
                        <select className="input" value={filters.tier}
                            onChange={e => setFilters(f => ({ ...f, tier: e.target.value }))}>
                            <option value="">All</option>
                            <option value="Green">Green</option>
                            <option value="Amber">Amber</option>
                            <option value="Red">Red</option>
                        </select>
                    </div>
                    <div>
                        <span className="label">Action Type</span>
                        <input className="input" placeholder="e.g. tier_assigned" value={filters.action_type}
                            onChange={e => setFilters(f => ({ ...f, action_type: e.target.value }))} />
                    </div>
                    <div>
                        <span className="label">Date From</span>
                        <input type="date" className="input" value={filters.date_from}
                            onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
                    </div>
                    <div>
                        <span className="label">Date To</span>
                        <input type="date" className="input" value={filters.date_to}
                            onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
                    </div>
                    <div>
                        <span className="label">User/System</span>
                        <input className="input" placeholder="e.g. system" value={filters.user_id}
                            onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))} />
                    </div>
                </div>
                <button onClick={fetchLogs} className="btn-primary mt-3 flex items-center gap-2 w-fit">
                    <Search size={14} /> Apply Filters
                </button>
            </div>

            {/* Log table */}
            <div className="card overflow-hidden p-0">
                <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 text-xs text-gray-500 font-medium">
                    <ScrollText size={12} />
                    {logs.length} event{logs.length !== 1 ? 's' : ''} found
                    <span className="text-gray-700">· append-only, never modified</span>
                </div>
                {loading ? (
                    <div className="p-8 text-center text-gray-500">
                        <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                        Loading...
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-8 text-center text-gray-600">No events found.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-500 bg-gray-800/50">
                                    <th className="px-4 py-3 font-medium">Timestamp</th>
                                    <th className="px-4 py-3 font-medium">Contract</th>
                                    <th className="px-4 py-3 font-medium">Event</th>
                                    <th className="px-4 py-3 font-medium">Outcome</th>
                                    <th className="px-4 py-3 font-medium">User</th>
                                    <th className="px-4 py-3 font-medium">Model</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/60">
                                {logs.map(log => (
                                    <tr key={log.id} className="hover:bg-gray-800/30 transition-colors">
                                        <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">
                                            {format(new Date(log.timestamp + 'Z'), 'MMM dd HH:mm:ss')}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 font-mono">
                                            {log.contract_id ? `#${log.contract_id}` : '—'}
                                        </td>
                                        <td className={`px-4 py-3 font-mono font-medium ${ACTION_COLORS[log.action_type] || 'text-gray-300'}`}>
                                            {log.action_type}
                                        </td>
                                        <td className="px-4 py-3 text-gray-300">{log.outcome || '—'}</td>
                                        <td className="px-4 py-3 text-gray-500">{log.user_id || '—'}</td>
                                        <td className="px-4 py-3 text-gray-600 text-xs font-mono truncate max-w-32">
                                            {log.model_version || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
