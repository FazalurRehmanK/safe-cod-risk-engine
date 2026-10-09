/**
 * RiskScoreBadge
 * A visual indicator for a customer's COD risk score (0-100).
 *
 * Color bands:
 *   80–100 → Emerald  (Safe)
 *   60–79  → Amber    (Low Risk)
 *   40–59  → Orange   (Medium Risk)
 *    0–39  → Red      (High Risk / COD Blocked)
 */

const getScoreMeta = (score) => {
  if (score >= 80) return { label: 'Safe',        color: '#10b981', bg: 'rgba(16,185,129,0.12)',  ring: 'rgba(16,185,129,0.3)' };
  if (score >= 60) return { label: 'Low Risk',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  ring: 'rgba(245,158,11,0.3)' };
  if (score >= 40) return { label: 'Medium Risk', color: '#f97316', bg: 'rgba(249,115,22,0.12)',  ring: 'rgba(249,115,22,0.3)' };
  return           { label: 'High Risk',          color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   ring: 'rgba(239,68,68,0.3)' };
};

/**
 * @param {number}  score     - 0-100
 * @param {'sm'|'md'|'lg'} size - defaults to 'md'
 * @param {boolean} showLabel - show the text label beside the score
 */
const RiskScoreBadge = ({ score, size = 'md', showLabel = true }) => {
  const meta = getScoreMeta(score ?? 100);

  const sizes = {
    sm: { pill: 'px-2 py-0.5 text-xs gap-1.5', dot: 'w-1.5 h-1.5' },
    md: { pill: 'px-3 py-1   text-sm gap-2',   dot: 'w-2 h-2'     },
    lg: { pill: 'px-4 py-2   text-base gap-2', dot: 'w-2.5 h-2.5' },
  };
  const s = sizes[size];

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ${s.pill}`}
      style={{
        background: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.ring}`,
        boxShadow: `0 0 8px ${meta.ring}`,
      }}
      title={`Risk Score: ${score}/100 — ${meta.label}`}
    >
      {/* Pulsing dot */}
      <span
        className={`${s.dot} rounded-full flex-shrink-0`}
        style={{ background: meta.color, boxShadow: `0 0 4px ${meta.color}` }}
      />
      <span className="font-bold tabular-nums">{score}</span>
      <span className="opacity-60">/100</span>
      {showLabel && (
        <span
          className="text-xs opacity-75 border-l pl-2 ml-1"
          style={{ borderColor: meta.ring }}
        >
          {meta.label}
        </span>
      )}
    </span>
  );
};

export default RiskScoreBadge;
