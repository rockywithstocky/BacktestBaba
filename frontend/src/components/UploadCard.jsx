import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, ArrowRightToLine, Sun, ChevronDown, Check, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './UploadCard.css';

const ENTRY_MODES = [
    {
        id: 'next_close',
        label: 'Next Day Close',
        badge: 'Standard',
        badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        icon: <ArrowRightToLine size={16} className="text-blue-400" />,
        desc: 'Enters at next trading day close. Safe baseline for EOD strategies.'
    },
    {
        id: 'next_open',
        label: 'Next Day Open',
        badge: 'Popular',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        icon: <Sun size={16} className="text-amber-400" />,
        desc: 'Enters at market open following signal date. Realistic for pre-market orders.'
    },
    {
        id: 'same_close',
        label: 'Same Day Close',
        badge: 'BTST / Swing',
        badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        icon: <FileText size={16} className="text-purple-400" />,
        desc: 'Enters on the signal date itself near market close (3:15 PM – 3:30 PM).'
    },
    {
        id: 'next_avg',
        label: 'Next Day Midpoint',
        badge: 'Balanced',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        icon: <TrendingUp size={16} className="text-emerald-400" />,
        desc: 'Enters at the average of Next Day Open and Close to model staggered fills.'
    }
];

const UploadCard = ({ onUpload, isLoading, progress, entryMode, onEntryModeChange }) => {
    const [dragActive, setDragActive] = useState(false);
    const [file, setFile] = useState(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = () => {
        if (file) {
            onUpload(file);
        }
    };

    const isIndeterminate = progress?.indeterminate === true || (progress?.total === 1 && progress?.current === 0) || (progress?.total <= 0);
    const progressPercent = !isIndeterminate && progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

    const selectedMode = ENTRY_MODES.find(m => m.id === entryMode) || ENTRY_MODES[0];

    return (
        <motion.div
            className="upload-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <div
                className={`drop-zone ${dragActive ? 'active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    id="file-upload"
                    className="file-input"
                    onChange={handleChange}
                    accept=".csv,.xlsx,.xls,text/csv,text/plain,text/comma-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    disabled={isLoading}
                />
                <label htmlFor="file-upload" className="file-label">
                    <div className="icon-container">
                        {file ? <FileText size={48} color="#8b5cf6" /> : <Upload size={48} color="#6b7280" />}
                    </div>
                    <div className="text-container">
                        {file ? (
                            <>
                                <span className="file-name">{file.name}</span>
                                <span className="secondary-text">Ready to process</span>
                            </>
                        ) : (
                            <>
                                <span className="primary-text">Click to upload or drag and drop</span>
                                <span className="secondary-text">CSV, Excel (Max 10MB)</span>
                            </>
                        )}
                    </div>
                </label>
            </div>

            {file && !isLoading && (
                <motion.div
                    className="entry-mode-section relative z-30"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                >
                    <div className="entry-mode-header mb-2 flex justify-between items-center">
                        <span className="entry-mode-label text-sm font-bold text-white">Execution Entry Mode</span>
                        <span className="entry-mode-hint text-xs text-gray-400">Select entry price model</span>
                    </div>

                    {/* Custom Modern Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            type="button"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            disabled={isLoading}
                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-900/90 hover:bg-gray-850 border border-white/15 rounded-xl transition-all text-left shadow-lg group focus:outline-none focus:border-blue-500"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-white/5 border border-white/10">
                                    {selectedMode.icon}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-white">{selectedMode.label}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${selectedMode.badgeColor}`}>
                                            {selectedMode.badge}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-sm">
                                        {selectedMode.desc}
                                    </p>
                                </div>
                            </div>
                            <ChevronDown
                                size={18}
                                className={`text-gray-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180 text-blue-400' : ''}`}
                            />
                        </button>

                        <AnimatePresence>
                            {dropdownOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-gray-950/95 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-2xl p-1.5 z-50 divide-y divide-white/5"
                                >
                                    {ENTRY_MODES.map(mode => {
                                        const isSelected = mode.id === entryMode;
                                        return (
                                            <button
                                                key={mode.id}
                                                type="button"
                                                onClick={() => {
                                                    onEntryModeChange(mode.id);
                                                    setDropdownOpen(false);
                                                }}
                                                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left group ${
                                                    isSelected ? 'bg-blue-600/15 border border-blue-500/30' : 'hover:bg-white/[0.04]'
                                                }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={`p-2 rounded-lg border mt-0.5 ${isSelected ? 'bg-blue-500/20 border-blue-500/30' : 'bg-white/5 border-white/10'}`}>
                                                        {mode.icon}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-sm font-semibold ${isSelected ? 'text-blue-300' : 'text-white group-hover:text-blue-200'}`}>
                                                                {mode.label}
                                                            </span>
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${mode.badgeColor}`}>
                                                                {mode.badge}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            {mode.desc}
                                                        </p>
                                                    </div>
                                                </div>

                                                {isSelected && (
                                                    <div className="p-1 rounded-full bg-blue-500/20 text-blue-400 ml-2 shrink-0">
                                                        <Check size={14} />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}

            {file && !isLoading && (
                <motion.button
                    className="submit-btn"
                    onClick={handleSubmit}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    Run Backtest
                </motion.button>
            )}

            <AnimatePresence>
                {isLoading && progress && (
                    <motion.div
                        className="progress-container"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <div className="progress-header">
                            <span className="progress-text">
                                <span className="highlight">{progress.symbol || "Initializing..."}</span>
                            </span>
                            {!isIndeterminate && <span className="progress-percentage">{progressPercent}%</span>}
                        </div>
                        <div className={`progress-bar-bg ${isIndeterminate ? 'indeterminate' : ''}`}>
                            <motion.div
                                className={`progress-bar-fill ${isIndeterminate ? 'indeterminate' : ''}`}
                                initial={false}
                                animate={isIndeterminate ? {} : { width: `${progressPercent}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>
                        {!isIndeterminate && (
                            <div className="progress-stats">
                                {progress.signals_processed ?? progress.current} / {progress.total_signals ?? progress.total} signals processed
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default UploadCard;
