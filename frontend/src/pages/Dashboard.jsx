import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { Upload, RefreshCw, Filter, TrendingUp, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { getContracts, uploadContract } from '../api';
import ContractCard from '../components/ContractCard';
import { useAuth } from '../App';

const TIERS = ['All', 'Green', 'Amber', 'Red'];

export default function Dashboard() {
    const { role } = useAuth();
    const navigate = useNavigate();
    const [contracts, setContracts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [tierFilter, setTierFilter] = useState('All');
    const [uploadMsg, setUploadMsg] = useState('');

    const fetchContracts = async () => {
        setLoading(true);
        try {
            const params = tierFilter !== 'All' ? { tier: tierFilter } : {};
            const res = await getContracts(params);
            setContracts(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchContracts(); }, [tierFilter]);

    // Auto-refresh every 10 seconds to pick up background agent updates
    useEffect(() => {
        const interval = setInterval(fetchContracts, 10000);
        return () => clearInterval(interval);
    }, [tierFilter]);

    const onDrop = useCallback(async (acceptedFiles) => {
        if (!acceptedFiles.length) return;
        setUploading(true);
        setUploadMsg('');
        try {
            for (const file of acceptedFiles) {
                const res = await uploadContract(file, role);
                setUploadMsg(`✅ Uploaded "${file.name}" (ID: ${res.data.contract_id}). Processing in background...`);
            }
            setTimeout(fetchContracts, 2000);
        } catch (e) {
            setUploadMsg(`❌ Upload failed: ${e.response?.data?.detail || e.message}`);
        } finally {
            setUploading(false);
        }
    }, [role]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
        multiple: true,
    });

    const counts = {
        green: contracts.filter(c => c.tier === 'Green').length,
        amber: contracts.filter(c => c.tier === 'Amber').length,
        red: contracts.filter(c => c.tier === 'Red').length,
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold gradient-text">Contract Dashboard</h1>
                    <p className="text-gray-500 text-sm mt-1">AI-powered obligation risk management</p>
                </div>
                <button onClick={fetchContracts} className="btn-secondary flex items-center gap-2">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Green', count: counts.green, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/20 border-green-500/20' },
                    { label: 'Amber', count: counts.amber, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-900/20 border-amber-500/20' },
                    { label: 'Red', count: counts.red, icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/20 border-red-500/20' },
                ].map(({ label, count, icon: Icon, color, bg }) => (
                    <div key={label} className={`card border ${bg}`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-400 text-xs mb-1">{label} Tier</p>
                                <p className={`text-3xl font-bold ${color}`}>{count}</p>
                            </div>
                            <Icon size={32} className={`${color} opacity-60`} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Upload zone */}
            <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300
          ${isDragActive
                        ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                        : 'border-gray-700 hover:border-indigo-500/50 hover:bg-gray-800/30'
                    }
          ${uploading ? 'opacity-60 pointer-events-none' : ''}
        `}
            >
                <input {...getInputProps()} />
                <Upload size={32} className="mx-auto mb-3 text-gray-500" />
                <p className="text-gray-300 font-medium">
                    {isDragActive ? 'Drop contracts here...' : 'Drag & drop contracts, or click to select'}
                </p>
                <p className="text-gray-600 text-sm mt-1">PDF, DOCX supported · Multiple files OK</p>
                {uploading && <p className="text-indigo-400 text-sm mt-2 animate-pulse">Uploading...</p>}
                {uploadMsg && (
                    <p className={`text-sm mt-2 ${uploadMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
                        {uploadMsg}
                    </p>
                )}
            </div>

            {/* Tier filter */}
            <div className="flex items-center gap-2">
                <Filter size={14} className="text-gray-500" />
                <div className="flex gap-2">
                    {TIERS.map(t => (
                        <button
                            key={t}
                            onClick={() => setTierFilter(t)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
                ${tierFilter === t
                                    ? t === 'Green' ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                                        : t === 'Amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                            : t === 'Red' ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                                                : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40'
                                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500'
                                }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
                <span className="text-gray-600 text-xs ml-2">{contracts.length} contract{contracts.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Contract cards grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="card animate-pulse h-52 bg-gray-800/50" />
                    ))}
                </div>
            ) : contracts.length === 0 ? (
                <div className="text-center py-20 text-gray-600">
                    <TrendingUp size={48} className="mx-auto mb-4 opacity-30" />
                    <p className="text-lg">No contracts yet. Upload one to get started.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {contracts.map(c => (
                        <ContractCard
                            key={c.id}
                            contract={c}
                            onClick={() => navigate(`/contracts/${c.id}`)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
