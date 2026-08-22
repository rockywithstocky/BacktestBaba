import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Laptop, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';

const ThemeToggle = () => {
    const { theme, setTheme, effectiveTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const options = [
        { id: 'dark', label: 'Dark', icon: <Moon size={14} /> },
        { id: 'light', label: 'Light', icon: <Sun size={14} /> },
        { id: 'system', label: 'System', icon: <Laptop size={14} /> },
    ];

    const currentIcon = effectiveTheme === 'light' ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-blue-400" />;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all text-xs font-semibold cursor-pointer shadow-sm"
                title="Switch Theme (Light / Dark / System)"
            >
                {currentIcon}
                <span className="capitalize hidden sm:inline text-xs font-medium">{theme}</span>
                <ChevronDown size={13} className={`transition-transform duration-200 ${open ? 'rotate-180 text-blue-400' : ''}`} />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-36 py-1 bg-gray-900/95 border border-white/15 rounded-xl shadow-2xl backdrop-blur-2xl z-50 divide-y divide-white/5"
                    >
                        {options.map((opt) => {
                            const isSelected = theme === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                        setTheme(opt.id);
                                        setOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold transition-all text-left cursor-pointer ${
                                        isSelected ? 'bg-blue-600/20 text-blue-300' : 'text-gray-300 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        {opt.icon}
                                        <span>{opt.label}</span>
                                    </div>
                                    {isSelected && <Check size={13} className="text-blue-400" />}
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ThemeToggle;
