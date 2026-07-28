import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle, XCircle, Clock, Calendar, DollarSign, TrendingUp } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';

const TIER_CONFIG = {
    Green: { icon: CheckCircle, border: 'border-green-500/30', glow: 'glow-green', badge: 'badge-green', text: 'text-green-400', shadow: 'shadow-green-500/10' },
    Amber: { icon: AlertTriangle, border: 'border-amber-500/30', glow: 'glow-amber', badge: 'badge-amber', text: 'text-amber-400', shadow: 'shadow-amber-500/10' },
    Red: { icon: XCircle, border: 'border-red-500/30', glow: 'glow-red', badge: 'badge-red', text: 'text-red-400', shadow: 'shadow-red-500/10' },
};

const STATUS_CHIPS = {
    Uploading: 'bg-gray-800 text-gray-400',
    Extracting: 'bg-indigo-900/40 text-indigo-400 animate-pulse',
    Extracted: 'bg-blue-900/40 text-blue-400',
    Scoring: 'bg-purple-900/40 text-purple-400 animate-pulse',
    Scored: 'bg-cyan-900/40 text-cyan-400',
    'Awaiting Action': 'bg-yellow-900/40 text-yellow-400',
    'Action Taken': 'bg-green-900/40 text-green-400',
    Dormant: 'bg-red-900/40 text-red-400',
    Completed: 'bg-emerald-900/40 text-emerald-400',
};

export default function ContractCard({ contract, onClick }) {
    const tier = contract.tier;
    const cfg = tier ? TIER_CONFIG[tier] : null;
    const Icon = cfg?.icon;

    // Use tier color for score bar; fall back to score threshold if tier not yet assigned
    const scoreColor = tier
        ? (tier === 'Red' ? 'text-red-400' : tier === 'Amber' ? 'text-amber-400' : 'text-green-400')
        : (contract.composite_score >= 70 ? 'text-red-400' : contract.composite_score >= 40 ? 'text-amber-400' : 'text-green-400');
    const barColor = tier
        ? (tier === 'Red' ? 'bg-red-500' : tier === 'Amber' ? 'bg-amber-500' : 'bg-green-500')
        : (contract.composite_score >= 70 ? 'bg-red-500' : contract.composite_score >= 40 ? 'bg-amber-500' : 'bg-green-500');

    return (
        <div
            onClick={onClick}
            className={`card border cursor-pointer group relative overflow-hidden
        ${cfg ? cfg.border : 'border-gray-700/50'}
        ${tier === 'Dormant' ? 'border-red-500/60' : ''}
        hover:shadow-xl transition-all duration-300`}
        >
            {/* Dormant badge */}
            {contract.status === 'Dormant' && (
                <div className="absolute top-0 left-0 right-0 bg-red-500/20 text-red-400 text-xs font-bold text-center py-1 border-b border-red-500/30 animate-pulse-slow">
                    ⚠ DORMANT — SLA BREACHED
                </div>
            )}

            <div className={contract.status === 'Dormant' ? 'mt-6' : ''}>
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm leading-tight truncate">
                            {contract.vendor_name || contract.filename}
                        </h3>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{contract.filename}</p>
                    </div>
                    {tier && Icon && (
                        <div className={`badge ${cfg.badge} shrink-0`}>
                            <Icon size={11} />
                            {tier}
                        </div>
                    )}
                </div>

                {/* Score bar */}
                {contract.composite_score !== null && contract.composite_score !== undefined && (
                    <div className="mb-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-500">Risk Score</span>
                            <span className={`font-bold ${scoreColor}`}>{contract.composite_score?.toFixed(1)}/100</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                style={{ width: `${contract.composite_score}%` }}
                            />
                        </div>
                        {contract.confidence_pct !== null && (
                            <p className="text-xs text-gray-600 mt-0.5">Confidence: {contract.confidence_pct?.toFixed(0)}%</p>
                        )}
                    </div>
                )}

                {/* Key info grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
                    {contract.time_to_default_days !== null && (
                        <div className="flex items-center gap-1.5 text-xs">
                            <Clock size={11} className={contract.time_to_default_days < 7 ? 'text-red-400' : contract.time_to_default_days < 30 ? 'text-amber-400' : 'text-gray-500'} />
                            <span className="text-gray-400">{contract.time_to_default_days}d to default</span>
                        </div>
                    )}
                    {contract.total_contract_value !== null && (
                        <div className="flex items-center gap-1.5 text-xs">
                            <DollarSign size={11} className="text-gray-500" />
                            <span className="text-gray-400">${(contract.total_contract_value / 1000).toFixed(0)}K</span>
                        </div>
                    )}
                    {contract.contract_end_date && (
                        <div className="flex items-center gap-1.5 text-xs">
                            <Calendar size={11} className="text-gray-500" />
                            <span className="text-gray-400">Ends {contract.contract_end_date}</span>
                        </div>
                    )}
                    {contract.override_red && (
                        <div className="flex items-center gap-1.5 text-xs">
                            <AlertTriangle size={11} className="text-red-400" />
                            <span className="text-red-400">Override: Red</span>
                        </div>
                    )}
                    {contract.override_amber && !contract.override_red && (
                        <div className="flex items-center gap-1.5 text-xs">
                            <AlertTriangle size={11} className="text-amber-400" />
                            <span className="text-amber-400">Override: Amber</span>
                        </div>
                    )}
                </div>

                {/* Status chip */}
                <div className="flex items-center justify-between">
                    <span className={`badge text-xs ${STATUS_CHIPS[contract.status] || 'bg-gray-800 text-gray-400'}`}>
                        {contract.status}
                    </span>
                    <span className="text-xs text-gray-600">
                        {format(new Date(contract.created_at + 'Z'), 'MMM dd')}
                    </span>
                </div>
            </div>
        </div>
    );
}
