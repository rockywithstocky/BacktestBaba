import React, { useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './UploadCard.css';

const UploadCard = ({ onUpload, isLoading, progress }) => {
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

    const progressPercent = progress ? Math.round((progress.current / progress.total) * 100) : 0;

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
                    accept=".csv,.xlsx,.xls"
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
                                Processing: <span className="highlight">{progress.symbol || "Initializing..."}</span>
                            </span>
                            <span className="progress-percentage">{progressPercent}%</span>
                        </div>
                        <div className="progress-bar-bg">
                            <motion.div
                                className="progress-bar-fill"
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercent}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>
                        <div className="progress-stats">
                            {progress.current} / {progress.total} signals processed
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default UploadCard;
