import React, { useState } from 'react';
import { Upload, FileText, ArrowRightToLine, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './UploadCard.css';

const UploadCard = ({ onUpload, isLoading, progress, entryMode, onEntryModeChange }) => {
    const [dragActive, setDragActive] = useState(false);
    const [file, setFile] = useState(null);

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

    const isIndeterminate = progress?.indeterminate === true;
    const progressPercent = !isIndeterminate && progress ? Math.round((progress.current / progress.total) * 100) : 0;

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
                    className="entry-mode-section"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                >
                    <div className="entry-mode-header">
                        <span className="entry-mode-label">Entry Mode</span>
                        <span className="entry-mode-hint">How should entry price be determined?</span>
                    </div>
                    <div className="entry-mode-toggle">
                        <button
                            className={`mode-btn ${entryMode === 'next_open' ? 'active' : ''}`}
                            onClick={() => onEntryModeChange('next_open')}
                            disabled={isLoading}
                            type="button"
                        >
                            <Sun size={16} className="mode-icon" />
                            <span>Next Open</span>
                            {entryMode === 'next_open' && <span className="mode-check">✓</span>}
                        </button>
                        <button
                            className={`mode-btn ${entryMode === 'next_close' ? 'active' : ''}`}
                            onClick={() => onEntryModeChange('next_close')}
                            disabled={isLoading}
                            type="button"
                        >
                            <ArrowRightToLine size={16} className="mode-icon" />
                            <span>Next Close</span>
                            {entryMode === 'next_close' && <span className="mode-check">✓</span>}
                        </button>
                    </div>
                    <p className="entry-mode-desc">
                        {entryMode === 'next_open'
                            ? 'Enter at the opening price of the next trading day after signal date.'
                            : 'Enter at the closing price of the next trading day after signal date.'}
                    </p>
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
