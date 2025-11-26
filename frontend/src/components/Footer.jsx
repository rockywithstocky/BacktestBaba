import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Mail, Twitter, Github, Heart } from 'lucide-react';

const Footer = () => {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="bg-gray-900 border-t border-white/10 pt-16 pb-8 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-blue-600/10 blur-[60px] rounded-full pointer-events-none" />

            <div className="container mx-auto px-6 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
                    {/* Brand Column */}
                    <div className="col-span-1 md:col-span-2">
                        <Link to="/" className="flex items-center gap-2 mb-4 group w-fit">
                            <div className="p-2 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded-xl border border-white/10 group-hover:border-blue-500/30 transition-colors">
                                <TrendingUp size={24} className="text-blue-400" />
                            </div>
                            <span className="font-display font-bold text-xl text-white tracking-tight">
                                StockBacktester<span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Pro</span>
                            </span>
                        </Link>
                        <p className="text-gray-400 leading-relaxed max-w-sm mb-6">
                            Empowering traders with professional-grade backtesting tools, real-time screening, and fundamental analysis. Validate your strategies before you trade.
                        </p>
                        <div className="flex items-center gap-4">
                            <SocialLink href="#" icon={<Twitter size={20} />} label="Twitter" />
                            <SocialLink href="#" icon={<Github size={20} />} label="GitHub" />
                            <SocialLink href="mailto:contact@stockbacktesterpro.com" icon={<Mail size={20} />} label="Email" />
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h4 className="font-display font-semibold text-white mb-6">Product</h4>
                        <ul className="space-y-3">
                            <FooterLink to="/dashboard">Dashboard Hub</FooterLink>
                            <FooterLink to="/dashboard/backtester">Backtester</FooterLink>
                            <FooterLink to="#">Live Screener <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 ml-2">Soon</span></FooterLink>
                            <FooterLink to="#">Pricing</FooterLink>
                        </ul>
                    </div>

                    {/* Company */}
                    <div>
                        <h4 className="font-display font-semibold text-white mb-6">Company</h4>
                        <ul className="space-y-3">
                            <FooterLink to="#">About Us</FooterLink>
                            <FooterLink to="#">Blog</FooterLink>
                            <FooterLink to="#">Terms of Service</FooterLink>
                            <FooterLink to="#">Privacy Policy</FooterLink>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
                    <p>© {currentYear} StockBacktester Pro. All rights reserved.</p>
                    <div className="flex items-center gap-1">
                        <span>Made with</span>
                        <Heart size={14} className="text-red-500 fill-red-500/20" />
                        <span>for traders worldwide.</span>
                    </div>
                </div>
            </div>
        </footer>
    );
};

const SocialLink = ({ href, icon, label }) => (
    <a
        href={href}
        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all hover:-translate-y-1 border border-white/5 hover:border-white/10"
        aria-label={label}
    >
        {icon}
    </a>
);

const FooterLink = ({ to, children }) => (
    <li>
        <Link to={to} className="text-gray-400 hover:text-blue-400 transition-colors flex items-center">
            {children}
        </Link>
    </li>
);

export default Footer;
