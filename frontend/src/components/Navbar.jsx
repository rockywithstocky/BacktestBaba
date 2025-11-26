import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { TrendingUp, Menu, X, LogOut, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    // Mock auth state - in real app this would come from context/store
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

    const handleLogout = () => {
        localStorage.removeItem('isLoggedIn');
        navigate('/login');
    };

    const toggleMenu = () => setIsOpen(!isOpen);

    const isDashboard = location.pathname.startsWith('/dashboard');

    return (
        <nav className={`fixed w-full z-50 transition-all duration-300 ${isDashboard ? 'bg-gray-900/80' : 'bg-black/30'} backdrop-blur-xl border-b border-white/10`}>
            <div className="container mx-auto px-6 py-4">
                <div className="flex justify-between items-center">
                    {/* Logo */}
                    <Link to={isLoggedIn ? "/dashboard" : "/"} className="flex items-center gap-2 group">
                        <motion.div
                            className="p-2 bg-gradient-to-br from-blue-600/30 to-purple-600/30 rounded-xl group-hover:from-blue-600/40 group-hover:to-purple-600/40 transition-all duration-300 backdrop-blur-sm border border-white/10"
                            whileHover={{ scale: 1.05, rotate: 5 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <TrendingUp size={24} className="text-blue-400" />
                        </motion.div>
                        <span className="font-display font-bold text-xl text-white tracking-tight">
                            StockBacktester<span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Pro</span>
                        </span>
                    </Link>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center gap-6">
                        {!isLoggedIn ? (
                            <>
                                <Link to="/login" className="text-gray-300 hover:text-white transition-colors font-medium">
                                    Log In
                                </Link>
                                <Link to="/signup">
                                    <motion.button
                                        whileHover={{ scale: 1.05, boxShadow: "0 10px 30px rgba(59, 130, 246, 0.3)" }}
                                        whileTap={{ scale: 0.95 }}
                                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-full font-semibold transition-all shadow-lg shadow-blue-600/20 border border-white/10"
                                    >
                                        Sign Up
                                    </motion.button>
                                </Link>
                            </>
                        ) : (
                            <>
                                <Link
                                    to="/dashboard"
                                    className={`text-sm font-semibold transition-colors ${location.pathname === '/dashboard' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Hub
                                </Link>
                                <div className="h-5 w-px bg-white/10"></div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                                            <User size={16} className="text-white" />
                                        </div>
                                        <span className="text-sm font-semibold text-white">Trader</span>
                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={handleLogout}
                                        className="p-2.5 hover:bg-red-500/10 rounded-xl text-gray-400 hover:text-red-400 transition-all border border-transparent hover:border-red-500/20"
                                        title="Logout"
                                    >
                                        <LogOut size={20} />
                                    </motion.button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden">
                        <motion.button
                            onClick={toggleMenu}
                            className="text-gray-300 hover:text-white p-2"
                            whileTap={{ scale: 0.9 }}
                        >
                            {isOpen ? <X size={24} /> : <Menu size={24} />}
                        </motion.button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden bg-gray-900/95 backdrop-blur-xl border-t border-white/10 overflow-hidden"
                    >
                        <div className="px-6 py-5 flex flex-col gap-4">
                            {!isLoggedIn ? (
                                <>
                                    <Link
                                        to="/login"
                                        className="text-gray-300 hover:text-white py-3 px-4 rounded-xl hover:bg-white/5 transition-all font-medium"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        Log In
                                    </Link>
                                    <Link to="/signup" onClick={() => setIsOpen(false)}>
                                        <button className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-600/20 border border-white/10">
                                            Sign Up
                                        </button>
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link
                                        to="/dashboard"
                                        className="text-gray-300 hover:text-white py-3 px-4 rounded-xl hover:bg-white/5 transition-all font-medium"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        Dashboard Hub
                                    </Link>
                                    <button
                                        onClick={() => { handleLogout(); setIsOpen(false); }}
                                        className="text-left text-red-400 hover:text-red-300 py-3 px-4 flex items-center gap-2 rounded-xl hover:bg-red-500/10 transition-all font-medium"
                                    >
                                        <LogOut size={18} /> Logout
                                    </button>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </nav>
    );
};

export default Navbar;
