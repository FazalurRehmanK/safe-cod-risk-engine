import { useState, useEffect } from 'react';
import { getMyOrders } from '../api';
import OrderStatusBadge from '../components/OrderStatusBadge';

const MyOrdersPage = () => {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    getMyOrders()
      .then((r) => setOrders(r.data.data.orders))
      .catch(() => setError('Could not load orders.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="skeleton h-8 w-48 mb-8" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-card p-6 mb-4">
            <div className="skeleton h-5 w-32 mb-3" />
            <div className="skeleton h-4 w-full mb-2" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="page-enter max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-black text-slate-100 mb-8">My Orders</h1>

      {error && (
        <div className="glass-card p-6 text-center text-risk mb-6">⚠️ {error}</div>
      )}

      {!loading && orders.length === 0 && (
        <div className="glass-card p-12 text-center">
          <p className="text-5xl mb-4">📦</p>
          <h2 className="text-xl font-bold text-slate-200">No orders yet</h2>
          <p className="text-slate-500 text-sm mt-2">Place your first order to see it here.</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {orders.map((order, i) => (
          <div
            key={order.id}
            className={`glass-card p-6 animate-fade-in delay-${Math.min(i * 75, 375)}`}
          >
            {/* ── Order Header ────────────────────────────────────────── */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs text-slate-600 font-mono">
                  #{order.id.split('-')[0].toUpperCase()}
                </p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {new Date(order.created_at).toLocaleString('en-PK', {
                    dateStyle: 'medium', timeStyle: 'short',
                  })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="badge text-slate-400 bg-white/[0.04] border-white/[0.08]">
                  {order.payment_method === 'cod' ? '💵 COD' : '💳 Prepaid'}
                </span>
                <OrderStatusBadge status={order.status} />
              </div>
            </div>

            {/* ── Delivery Address ─────────────────────────────────── */}
            <div className="flex items-start gap-2 mb-4 text-sm text-slate-400">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-600" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>
                {order.street_address}
                {order.landmark && `, near ${order.landmark}`}
                {' · '}{order.block_sector}, {order.town}, {order.district}
              </span>
            </div>

            {/* ── Order Items ──────────────────────────────────────── */}
            <div className="rounded-xl overflow-hidden mb-4"
                 style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              {(order.items || []).map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center px-4 py-2.5 text-sm"
                  style={{
                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                    borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  <span className="text-slate-400">
                    {item.name} <span className="text-slate-600">×{item.quantity}</span>
                  </span>
                  <span className="text-slate-200 font-medium">
                    Rs. {parseFloat(item.lineTotal).toLocaleString('en-PK')}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Footer ──────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-600">
                {order.risk_score_snapshot !== null && order.payment_method === 'cod' && (
                  <>Risk score at checkout: <strong className="text-slate-400">{order.risk_score_snapshot}</strong></>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-600">Order Total</p>
                <p className="text-xl font-black gradient-text">
                  Rs. {parseFloat(order.total_amount).toLocaleString('en-PK')}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyOrdersPage;
