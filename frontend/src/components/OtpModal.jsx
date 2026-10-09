import { useRef, useState, useEffect } from 'react';

/**
 * OtpModal
 * A full-screen overlay with a 4-digit OTP entry UI.
 * - Auto-advances focus on input
 * - Handles backspace/paste
 * - Shows shake animation on wrong OTP
 * - Shows green success state on correct OTP
 *
 * Props:
 *   orderId     — the order UUID to verify
 *   phoneNumber — displayed to user ("sent to +92...")
 *   onVerify    — async fn(otp: string) → throws on failure
 *   onClose     — called to close modal (e.g., go back)
 */
const OtpModal = ({ orderId, phoneNumber, onVerify, onClose }) => {
  const [digits, setDigits]     = useState(['', '', '', '']);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(false);
  const [shake, setShake]       = useState(false);
  const inputRefs               = [useRef(), useRef(), useRef(), useRef()];

  // Focus first box on mount
  useEffect(() => { inputRefs[0].current?.focus(); }, []); // eslint-disable-line

  const handleChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;           // Only single digits
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    setError('');
    if (value && index < 3) {
      inputRefs[index + 1].current?.focus();    // Auto-advance
    }
    // Auto-submit when all 4 filled
    if (value && index === 3) {
      const full = [...next.slice(0, 3), value].join('');
      if (full.length === 4) handleSubmit(full);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs[index - 1].current?.focus();    // Back-track on backspace
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    const next = ['', '', '', ''];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    if (pasted.length === 4) {
      inputRefs[3].current?.focus();
      handleSubmit(pasted);
    } else {
      inputRefs[pasted.length]?.current?.focus();
    }
  };

  const handleSubmit = async (otp = digits.join('')) => {
    if (otp.length < 4) { setError('Please enter the 4-digit OTP.'); return; }
    setLoading(true);
    setError('');
    try {
      await onVerify(otp);
      setSuccess(true);
    } catch (err) {
      const msg = err.response?.data?.message || 'Incorrect OTP. Please try again.';
      setError(msg);
      setShake(true);
      setDigits(['', '', '', '']);
      setTimeout(() => {
        setShake(false);
        inputRefs[0].current?.focus();
      }, 600);
    } finally {
      setLoading(false);
    }
  };

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>

      <div className="glass-card w-full max-w-sm p-8 animate-bounce-in">

        {/* ── Header ──────────────────────────────────────────────── */}
        {!success ? (
          <>
            {/* WhatsApp-inspired icon */}
            <div className="flex flex-col items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                   style={{ background: 'linear-gradient(135deg,rgba(37,211,102,0.2),rgba(37,211,102,0.05))',
                            border: '1px solid rgba(37,211,102,0.3)' }}>
                <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="#25d366" strokeWidth="1.6">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
                        strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold text-slate-100">Verify Your Order</h2>
                <p className="text-slate-500 text-sm mt-1">
                  OTP sent via WhatsApp to<br />
                  <span className="text-slate-300 font-medium">{phoneNumber}</span>
                </p>
              </div>
            </div>

            {/* ── OTP Inputs ───────────────────────────────────────── */}
            <div className={`flex gap-3 justify-center mb-6 ${shake ? 'animate-shake' : ''}`}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={inputRefs[i]}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  className="w-14 h-14 text-center text-2xl font-bold rounded-xl
                             outline-none transition-all duration-200 caret-transparent"
                  style={{
                    background:  d ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                    border:      `2px solid ${d ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
                    color:       '#f1f5f9',
                    boxShadow:   d ? '0 0 12px rgba(99,102,241,0.25)' : 'none',
                  }}
                />
              ))}
            </div>

            {/* Error */}
            {error && (
              <p className="text-center text-risk text-sm mb-4 animate-fade-in">{error}</p>
            )}

            {/* Submit */}
            <button
              onClick={() => handleSubmit()}
              disabled={loading || digits.join('').length < 4}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying…</>
              ) : 'Confirm Order'}
            </button>

            {/* Demo hint */}
            <div className="mt-5 rounded-xl p-3 text-center"
                 style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p className="text-amber-400 text-xs font-medium">
                🔑 Demo OTP: <span className="font-bold tracking-widest">1234</span>
              </p>
            </div>

            <button onClick={onClose}
                    className="w-full mt-3 text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Cancel order
            </button>
          </>
        ) : (
          /* ── Success State ──────────────────────────────────────── */
          <div className="flex flex-col items-center gap-5 py-4 animate-bounce-in">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
                 style={{ background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.4)',
                          boxShadow: '0 0 32px rgba(16,185,129,0.25)' }}>
              <svg className="w-10 h-10 text-safe" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-safe">Order Confirmed!</h2>
              <p className="text-slate-400 text-sm mt-2">
                Your order has been verified and stock has been reserved.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OtpModal;
