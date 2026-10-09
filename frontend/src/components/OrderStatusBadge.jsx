/**
 * OrderStatusBadge
 * Color-coded pill for each order status in the lifecycle.
 */

const STATUS_META = {
  pending_otp: { label: 'Awaiting OTP',  color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', dot: '#94a3b8' },
  verified:    { label: 'Verified',      color: '#818cf8', bg: 'rgba(129,140,248,0.12)', dot: '#818cf8' },
  dispatched:  { label: 'Dispatched',   color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',   dot: '#38bdf8' },
  delivered:   { label: 'Delivered',    color: '#10b981', bg: 'rgba(16,185,129,0.12)',   dot: '#10b981' },
  rto:         { label: 'RTO',          color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    dot: '#ef4444' },
};

const OrderStatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.pending_otp;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full"
      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.bg}` }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          background: meta.dot,
          // Animate the RTO and delivered states to draw the eye
          animation: (status === 'rto' || status === 'delivered')
            ? 'pulseGlow 2s infinite' : 'none',
        }}
      />
      {meta.label}
    </span>
  );
};

export default OrderStatusBadge;
