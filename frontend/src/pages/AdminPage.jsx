import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Users, HardDrive, RefreshCw, Loader2, AlertCircle,
  CheckCircle, XCircle, UserX, Star, Zap, Search
} from 'lucide-react';
import { isAdmin, logout, validate, getUser } from '../services/auth';
import { listUsers, setPlan, revokeSessions, getQuota } from '../services/admin';

const AdminPage = () => {
  const navigate = useNavigate();
  const [userList, setUserList] = useState([]);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [search, setSearch] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  useEffect(() => {
    if (!isAdmin()) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [users, q] = await Promise.all([listUsers(), getQuota()]);
      setUserList(users);
      setQuota(q);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to load admin data';
      setError(msg);
      if (err.response?.status === 401 || err.response?.status === 403) {
        logout();
        navigate('/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSetPlan = async (userId, plan) => {
    setActionLoading(`plan-${userId}`);
    try {
      await setPlan(userId, plan);
      setUserList(prev => prev.map(u =>
        u.id === userId
          ? { ...u, plan, max_signals: plan === 'priority' ? 5000 : 100, max_file_size_mb: plan === 'priority' ? 10 : 2 }
          : u
      ));
      const currentUser = getUser();
      if (currentUser && currentUser.id === userId) {
        await validate();
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to update plan');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeSessions = async (userId) => {
    setConfirmRevoke(null);
    setActionLoading(`revoke-${userId}`);
    try {
      await revokeSessions(userId);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to revoke sessions');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = userList.filter(u =>
    !search || u.email.toLowerCase().includes(search.toLowerCase()) || u.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-blue-400" />
          <p className="text-gray-400 text-lg">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-amber-500/20 to-orange-600/20 rounded-2xl border border-amber-500/20">
              <Shield size={28} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-gray-400 text-sm mt-1">Manage users, plans, and D1 quota</p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={loadData}
            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            title="Refresh"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </motion.button>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3"
          >
            <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">
              <XCircle size={18} />
            </button>
          </motion.div>
        )}

        {/* Quota Gauge */}
        {quota && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <HardDrive size={22} className="text-blue-400" />
              <h2 className="text-lg font-semibold text-white">D1 Write Quota</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{quota.total_writes.toLocaleString()} / {quota.write_limit.toLocaleString()} writes</span>
                <span className={`font-medium ${quota.soft_blocked ? 'text-red-400' : 'text-green-400'}`}>
                  {quota.percent_used}%
                </span>
              </div>
              <div className="h-3 bg-gray-900/50 rounded-full overflow-hidden border border-white/5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(quota.percent_used, 100)}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className={`h-full rounded-full transition-colors ${
                    quota.soft_blocked ? 'bg-red-500' : quota.percent_used > 80 ? 'bg-amber-500' : 'bg-gradient-to-r from-blue-500 to-purple-500'
                  }`}
                />
              </div>
              {quota.soft_blocked && (
                <p className="text-red-400 text-xs flex items-center gap-1 mt-2">
                  <AlertCircle size={14} /> Soft block threshold reached — new writes may be rejected
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* Users Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-800/50 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-white/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Users size={22} className="text-purple-400" />
                <h2 className="text-lg font-semibold text-white">Users ({userList.length})</h2>
              </div>
              <div className="relative max-w-xs w-full sm:w-auto">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by email or name..."
                  className="w-full bg-gray-900/50 border border-gray-700 rounded-xl py-2 pl-10 pr-4 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="text-center px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Plan</th>
                  <th className="text-center px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Admin</th>
                  <th className="text-center px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Signals</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Created</th>
                  <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      {search ? 'No users match your search' : 'No users registered yet'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u, i) => (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className="text-white text-sm font-medium">{u.email}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-gray-300 text-sm">{u.name || '—'}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          u.plan === 'priority'
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                            : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                        }`}>
                          {u.plan === 'priority' ? <Zap size={12} /> : <Star size={12} />}
                          {u.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {u.is_admin ? (
                          <CheckCircle size={18} className="text-green-400 inline" />
                        ) : (
                          <XCircle size={18} className="text-gray-600 inline" />
                        )}
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-gray-400">
                        {u.max_signals || 100}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-gray-400 text-sm">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSetPlan(u.id, u.plan === 'priority' ? 'free' : 'priority')}
                            disabled={actionLoading === `plan-${u.id}`}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                              u.plan === 'priority'
                                ? 'bg-gray-500/10 text-gray-400 border-gray-500/20 hover:bg-gray-500/20'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {actionLoading === `plan-${u.id}` ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : u.plan === 'priority' ? (
                              'Downgrade'
                            ) : (
                              'Upgrade'
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmRevoke(u)}
                            disabled={actionLoading === `revoke-${u.id}`}
                            className="p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Revoke sessions"
                          >
                            {actionLoading === `revoke-${u.id}` ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <UserX size={14} />
                            )}
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Refresh hint */}
        <p className="text-center text-gray-500 text-xs">
          Data fetched from Cloudflare D1 • Admin access limited to authorized users
        </p>
      </div>

      {/* Confirm Revoke Modal */}
      {confirmRevoke && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmRevoke(null)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-800 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/10 rounded-xl">
                <UserX size={24} className="text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Revoke Sessions</h3>
            </div>
            <p className="text-gray-300 text-sm mb-6">
              This will invalidate all active sessions for <strong className="text-white">{confirmRevoke.email}</strong>.
              They will be logged out on next request.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmRevoke(null)}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRevokeSessions(confirmRevoke.id)}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all text-sm font-medium"
              >
                Revoke All
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default AdminPage;
