import { useState, useEffect, useCallback } from 'react';
import { getAdminOrders, updateOrderStatus } from '../api';
import RiskScoreBadge from '../components/RiskScoreBadge';
import OrderStatusBadge from '../components/OrderStatusBadge';
import toast from 'react-hot-toast';

// ── Allowed status transitions (mirrors backend logic) ────────────────────────
const NEXT_STATUSES = {
  pending_otp: [],
  verified:    ['dispatched', 'rto'],
  dispatched:  ['delivered', 'rto'],
  delivered:   [],
  rto:         [],
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon, color, delay = 0 }) => (
  <div
    className={`glass-card p-5 flex items-center gap-4 animate-fade-in delay-${delay}`}
    style={{ borderLeft: `3px solid ${color}` }}
  >
    <div className="text-3xl leading-none">{icon}</div>
    <div>
      <p className="text-3xl font-black" style={{ color }}>{value}</p>
      <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
    </div>
  </div>
);

// ── Status Filter Tab ─────────────────────────────────────────────────────────
const FilterTab = ({ label, active, onClick, count }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200
                flex items-center gap-2
                ${active
                  ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'}`}
  >
    {label}
    {count !== undefined && (
      <span className={`text-xs rounded-full px-2 py-0.5 font-bold
                        ${active ? 'bg-brand-500/30 text-brand-300' : 'bg-white/[0.06] text-slate-500'}`}>
        {count}
      </span>
    )}
  </button>
);

// =============================================================================
// ADMIN DASHBOARD PAGE
// =============================================================================
const AdminDashboardPage = () => {
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [updating,   setUpdating]   = useState(null); // orderId being updated

  // Derived stats from current page data (full stats need backend aggregate)
  const stats = orders.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      acc.total++;
      return acc;
    },
    { total: 0, pending_otp: 0, verified: 0, dispatched: 0, delivered: 0, rto: 0 }
  );

  // ── Fetch orders ─────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (page = 1, status = statusFilter) => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (status) params.status = status;
      const res = await getAdminOrders(params);
      setOrders(res.data.data.orders);
      setPagination(res.data.pagination);
    } catch {
      toast.error('Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchOrders(1); }, [statusFilter]); // eslint-disable-line

  // ── Status update ─────────────────────────────────────────────────────────
  const handleStatusChange = async (orderId, newStatus) => {
    if (!newStatus) return;
    setUpdating(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      // Optimistically update the row in UI
      setOrders((prev) =>
        prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o)
      );
      toast.success(`Order marked as "${newStatus}".`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed.');
    } finally {
      setUpdating(null);
    }
  };

  const FILTERS = [
    { value: '',            label: 'All Orders' },
    { value: 'pending_otp', label: 'Pending OTP' },
    { value: 'verified',    label: 'Verified' },
    { value: 'dispatched',  label: 'Dispatched' },
    { value: 'delivered',   label: 'Delivered' },
    { value: 'rto',         label: 'RTO' },
  ];

  return (
    <div className="page-enter max-w-[1400px] mx-auto px-4 sm:px-6 py-10">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="section-label">Admin Panel</p>
          <h1 className="text-3xl font-black text-slate-100">
            Order <span className="gradient-text">Command Centre</span>
          </h1>
        </div>
        <button onClick={() => fetchOrders(pagination.page)}
                className="btn-ghost flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Stats Row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Total Orders"  value={pagination.total} icon="📦" color="#818cf8" delay={0}   />
        <StatCard label="Pending OTP"   value={stats.pending_otp} icon="⏳" color="#94a3b8" delay={75}  />
        <StatCard label="Verified"      value={stats.verified}    icon="✅" color="#818cf8" delay={150} />
        <StatCard label="Dispatched"    value={stats.dispatched}  icon="🚚" color="#38bdf8" delay={225} />
        <StatCard label="Delivered"     value={stats.delivered}   icon="🎉" color="#10b981" delay={300} />
        <StatCard label="RTOs"          value={stats.rto}         icon="↩️" color="#ef4444" delay={375} />
      </div>

      {/* ── RTO Rate Banner ───────────────────────────────────────────────── */}
      {stats.total > 0 && (
        <div className="glass-card p-4 mb-6 flex items-center justify-between flex-wrap gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="text-xl">📊</span>
            <div>
              <p className="text-sm font-semibold text-slate-200">Live RTO Rate (this page)</p>
              <p className="text-xs text-slate-500">
                {stats.rto} returns out of {stats.total} orders on this page
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 rounded-full overflow-hidden"
                 style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${stats.total ? (stats.rto / stats.total) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, #10b981, #ef4444)',
                }}
              />
            </div>
            <span className="text-sm font-bold text-slate-200">
              {stats.total ? Math.round((stats.rto / stats.total) * 100) : 0}%
            </span>
          </div>
        </div>
      )}

      {/* ── Filter Tabs ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <FilterTab
            key={f.value}
            label={f.label}
            active={statusFilter === f.value}
            onClick={() => setStatusFilter(f.value)}
          />
        ))}
      </div>

      {/* ── Orders Table ──────────────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)',
                           background: 'rgba(255,255,255,0.02)' }}>
                {['Order', 'Customer', 'Risk Score', 'Payment', 'Amount', 'Status', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="skeleton h-4 rounded" style={{ width: `${40 + (j * 13) % 50}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-600">
                    No orders found for this filter.
                  </td>
                </tr>
              ) : (
                orders.map((order, i) => {
                  const nextOptions = NEXT_STATUSES[order.status] || [];
                  const isUpdating  = updating === order.id;

                  return (
                    <tr
                      key={order.id}
                      className={`animate-fade-in transition-colors duration-150
                                  hover:bg-white/[0.02] delay-${Math.min(i * 75, 375)}`}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    >
                      {/* Order ID */}
                      <td className="px-4 py-4">
                        <span className="font-mono text-xs text-slate-500">
                          #{order.id.split('-')[0].toUpperCase()}
                        </span>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-200 whitespace-nowrap">
                          {order.customer_name}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">{order.phone_number}</p>
                        <p className="text-xs text-slate-700 mt-0.5 max-w-[180px] truncate">
                          {order.block_sector}, {order.town}
                        </p>
                      </td>

                      {/* ── Risk Score — The Portfolio Showpiece Column ── */}
                      <td className="px-4 py-4">
                        <RiskScoreBadge score={parseInt(order.live_risk_score, 10)} size="sm" />
                        {/* Show tooltip breakdown as sub-text */}
                        <div className="flex gap-2 mt-1.5 text-[10px] text-slate-600">
                          <span title="Delivered" className="text-safe">▲{order.total_delivered}</span>
                          <span title="RTO" className="text-risk">▼{order.total_rto}</span>
                          <span title="Total orders" className="text-slate-500">/{order.total_orders}</span>
                        </div>
                        {/* Snapshot vs live diff indicator */}
                        {order.risk_score_snapshot !== null &&
                          parseInt(order.live_risk_score, 10) !== parseInt(order.risk_score_snapshot, 10) && (
                          <p className="text-[10px] text-amber-600 mt-0.5">
                            Was {order.risk_score_snapshot} at checkout
                          </p>
                        )}
                      </td>

                      {/* Payment */}
                      <td className="px-4 py-4">
                        <span className="text-xs text-slate-400">
                          {order.payment_method === 'cod' ? '💵 COD' : '💳 Prepaid'}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-4">
                        <span className="font-bold text-slate-200 whitespace-nowrap">
                          Rs. {parseFloat(order.total_amount).toLocaleString('en-PK')}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <OrderStatusBadge status={order.status} />
                      </td>

                      {/* Date */}
                      <td className="px-4 py-4">
                        <span className="text-xs text-slate-600 whitespace-nowrap">
                          {new Date(order.created_at).toLocaleDateString('en-PK', {
                            day: '2-digit', month: 'short', year: '2-digit',
                          })}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4">
                        {nextOptions.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <select
                              defaultValue=""
                              onChange={(e) => handleStatusChange(order.id, e.target.value)}
                              disabled={isUpdating}
                              className="text-xs rounded-lg px-2 py-1.5 appearance-none cursor-pointer
                                         disabled:opacity-50 outline-none"
                              style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#94a3b8',
                              }}
                            >
                              <option value="" disabled>Update status…</option>
                              {nextOptions.map((s) => (
                                <option key={s} value={s}>
                                  {s === 'dispatched' ? '🚚 Dispatched'
                                   : s === 'delivered' ? '✅ Delivered'
                                   : s === 'rto'       ? '↩️ Mark RTO'
                                   : s}
                                </option>
                              ))}
                            </select>
                            {isUpdating && (
                              <div className="w-4 h-4 border-2 border-brand-500/30 border-t-brand-500
                                              rounded-full animate-spin flex-shrink-0" />
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-700 italic">Terminal</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ────────────────────────────────────────────────── */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4"
               style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs text-slate-600">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} total orders
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchOrders(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="btn-ghost text-xs py-1.5 px-3 disabled:opacity-30"
              >
                ← Prev
              </button>
              <button
                onClick={() => fetchOrders(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="btn-ghost text-xs py-1.5 px-3 disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Risk Score Legend ─────────────────────────────────────────────── */}
      <div className="mt-6 glass-card p-4 flex flex-wrap items-center gap-4 text-xs">
        <span className="text-slate-600 font-semibold uppercase tracking-wider">Risk Legend:</span>
        {[
          { range: '80–100', color: '#10b981', label: 'Safe' },
          { range: '60–79',  color: '#f59e0b', label: 'Low Risk' },
          { range: '40–59',  color: '#f97316', label: 'Medium Risk' },
          { range: '0–39',   color: '#ef4444', label: 'High Risk / COD Blocked' },
        ].map(({ range, color, label }) => (
          <div key={range} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-slate-400">
              <strong style={{ color }}>{range}</strong> — {label}
            </span>
          </div>
        ))}
        <span className="text-slate-700 ml-auto">▲ Delivered · ▼ RTO · / Total</span>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
