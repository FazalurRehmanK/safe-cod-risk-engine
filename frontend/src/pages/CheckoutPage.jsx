import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { getDistricts, getTowns, getBlockSectors, placeOrder, verifyOtp } from '../api';
import OtpModal from '../components/OtpModal';
import RiskScoreBadge from '../components/RiskScoreBadge';
import toast from 'react-hot-toast';

// ── Step Indicator ────────────────────────────────────────────────────────────
const StepDot = ({ n, label, current }) => {
  const done   = n < current;
  const active = n === current;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold
                       border-2 transition-all duration-300
                       ${done   ? 'bg-safe border-safe text-white'
                        : active ? 'border-brand-500 text-brand-400 bg-brand-500/10'
                                 : 'border-white/10 text-slate-600'}`}>
        {done ? '✓' : n}
      </div>
      <span className={`text-xs font-medium hidden sm:block
                        ${active ? 'text-slate-200' : 'text-slate-600'}`}>
        {label}
      </span>
    </div>
  );
};

// ── COD Blocked Screen ────────────────────────────────────────────────────────
const CodBlockedScreen = ({ riskData, onSwitchToPrepaid, onBack }) => (
  <div className="animate-bounce-in flex flex-col items-center text-center gap-6 py-8 px-4 max-w-md mx-auto">
    <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
         style={{ background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.35)',
                  boxShadow: '0 0 40px rgba(239,68,68,0.2)' }}>
      <svg className="w-10 h-10 text-risk" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3L4 7v5c0 4.4 3.4 8.5 8 9.5 4.6-1 8-5.1 8-9.5V7l-8-4z"
              strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
        <circle cx="12" cy="16" r="0.5" fill="currentColor" strokeWidth="1" />
      </svg>
    </div>

    <div>
      <h2 className="text-2xl font-black text-risk">COD Blocked</h2>
      <p className="text-slate-400 text-sm mt-2 leading-relaxed">
        Your COD Risk Score is below the minimum threshold required to place
        a Cash on Delivery order.
      </p>
    </div>

    {/* Risk Score display */}
    <RiskScoreBadge score={riskData.riskScore} size="lg" />

    {/* Breakdown */}
    <div className="glass-card w-full p-4 grid grid-cols-3 gap-3 text-center">
      {[
        { label: 'Total Orders', value: riskData.totalOrders, color: 'text-slate-200' },
        { label: 'Delivered',    value: riskData.totalDelivered, color: 'text-safe'   },
        { label: 'RTOs',         value: riskData.totalRto,   color: 'text-risk'       },
      ].map(({ label, value, color }) => (
        <div key={label}>
          <p className={`text-2xl font-black ${color}`}>{value}</p>
          <p className="text-xs text-slate-600 mt-0.5">{label}</p>
        </div>
      ))}
    </div>

    <div className="w-full" style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'0.875rem', padding:'0.875rem' }}>
      <p className="text-amber-400 text-sm">
        💡 Each <strong>delivered order (COD or prepaid)</strong> adds{' '}
        <strong>+10 points</strong>. Place a prepaid order and receive it to
        rebuild your score and restore COD access.
      </p>
    </div>

    <div className="flex flex-col sm:flex-row gap-3 w-full">
      <button onClick={onSwitchToPrepaid} className="btn-primary flex-1">
        Switch to Prepaid →
      </button>
      <button onClick={onBack} className="btn-ghost flex-1">Go Back</button>
    </div>
  </div>
);

// =============================================================================
// CHECKOUT PAGE — 3-step flow
// =============================================================================
const CheckoutPage = () => {
  const { cartItems, totalAmount, clearCart } = useCart();
  const { user } = useAuth();
  const navigate  = useNavigate();

  // Steps: 1 = Address, 2 = Review & Payment, 3 = OTP
  const [step, setStep] = useState(1);

  // Address form state
  const [districts,    setDistricts]    = useState([]);
  const [towns,        setTowns]        = useState([]);
  const [blockSectors, setBlockSectors] = useState([]);
  const [address, setAddress] = useState({
    districtId:    '',
    townId:        '',
    blockSectorId: '',
    streetAddress: '',
    apartment:     '',
    landmark:      '',
  });

  // Payment & order state
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [notes,         setNotes]         = useState('');
  const [loading,       setLoading]       = useState(false);

  // Post-checkout state
  const [placedOrder,   setPlacedOrder]   = useState(null);
  const [blockedData,   setBlockedData]   = useState(null);
  const [showOtp,       setShowOtp]       = useState(false);
  const [orderSuccess,  setOrderSuccess]  = useState(false);

  // ── Redirect empty cart ─────────────────────────────────────────────────
  useEffect(() => {
    if (cartItems.length === 0 && !orderSuccess) navigate('/cart');
  }, [cartItems, navigate, orderSuccess]);

  // ── Load districts on mount ─────────────────────────────────────────────
  useEffect(() => {
    getDistricts().then((r) => setDistricts(r.data.data.districts));
  }, []);

  const onDistrictChange = async (e) => {
    const id = e.target.value;
    setAddress((a) => ({ ...a, districtId: id, townId: '', blockSectorId: '' }));
    setTowns([]); setBlockSectors([]);
    if (id) {
      const r = await getTowns(id);
      setTowns(r.data.data.towns);
    }
  };

  const onTownChange = async (e) => {
    const id = e.target.value;
    setAddress((a) => ({ ...a, townId: id, blockSectorId: '' }));
    setBlockSectors([]);
    if (id) {
      const r = await getBlockSectors(id);
      setBlockSectors(r.data.data.blockSectors);
    }
  };

  // ── Step 1 → 2 validation ───────────────────────────────────────────────
  const validateAddress = () => {
    if (!address.blockSectorId) { toast.error('Please select your Block/Sector.'); return false; }
    if (!address.streetAddress.trim()) { toast.error('Street address is required.'); return false; }
    return true;
  };

  // ── Place order (Step 2 → 3 or Blocked) ────────────────────────────────
  const handlePlaceOrder = async () => {
    setLoading(true);
    try {
      const payload = {
        cartItems: cartItems.map((i) => ({ productId: i.id, quantity: i.quantity })),
        paymentMethod,
        address: {
          blockSectorId: address.blockSectorId,
          streetAddress: address.streetAddress,
          apartment:     address.apartment || undefined,
          landmark:      address.landmark  || undefined,
        },
        notes: notes || undefined,
      };

      const res = await placeOrder(payload);
      const order = res.data.data.order;
      setPlacedOrder(res.data.data);

      if (paymentMethod === 'cod') {
        setShowOtp(true);  // Move to OTP step
      } else {
        // Prepaid: immediately successful
        clearCart();
        setOrderSuccess(true);
        toast.success('Order placed successfully!');
      }
      setStep(3);
    } catch (err) {
      if (err.response?.status === 403) {
        // ── COD BLOCKED by Risk Engine ──────────────────────────────────
        setBlockedData(err.response.data.data);
        setStep('blocked');
      } else {
        toast.error(err.response?.data?.message || 'Failed to place order.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── OTP verified ────────────────────────────────────────────────────────
  const handleOtpVerified = async (otp) => {
    await verifyOtp(placedOrder.order.id, otp);  // throws on failure
    clearCart();
    setOrderSuccess(true);
    setShowOtp(false);
    setTimeout(() => navigate('/orders'), 2500);
  };

  // ── Switch to prepaid after COD block ──────────────────────────────────
  const switchToPrepaid = () => {
    setPaymentMethod('prepaid');
    setBlockedData(null);
    setStep(2);
  };

  // ── Order success screen ────────────────────────────────────────────────
  if (orderSuccess) {
    return (
      <div className="page-enter min-h-[80vh] flex flex-col items-center justify-center gap-6 px-4">
        <div className="animate-bounce-in flex flex-col items-center gap-5 text-center max-w-sm">
          <div className="w-24 h-24 rounded-full flex items-center justify-center"
               style={{ background:'rgba(16,185,129,0.12)', border:'2px solid rgba(16,185,129,0.4)',
                        boxShadow:'0 0 48px rgba(16,185,129,0.25)' }}>
            <svg className="w-12 h-12 text-safe" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-safe">Order Confirmed!</h1>
          <p className="text-slate-400">
            Your order is verified and stock has been reserved. Redirecting to your orders…
          </p>
          <button onClick={() => navigate('/orders')} className="btn-primary">
            View My Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-black text-slate-100 mb-8">Checkout</h1>

      {/* ── Step Indicator ──────────────────────────────────────────────── */}
      {step !== 'blocked' && (
        <div className="flex items-center justify-center gap-4 mb-10">
          <StepDot n={1} label="Address"  current={typeof step === 'number' ? step : 3} />
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)', maxWidth: 80 }} />
          <StepDot n={2} label="Review"   current={typeof step === 'number' ? step : 3} />
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)', maxWidth: 80 }} />
          <StepDot n={3} label="Confirm"  current={typeof step === 'number' ? step : 3} />
        </div>
      )}

      {/* ── Blocked Screen ──────────────────────────────────────────────── */}
      {step === 'blocked' && blockedData && (
        <CodBlockedScreen
          riskData={blockedData}
          onSwitchToPrepaid={switchToPrepaid}
          onBack={() => setStep(2)}
        />
      )}

      {/* ── Step 1: Address ─────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="glass-card p-6 animate-fade-in flex flex-col gap-5">
          <h2 className="font-bold text-slate-100 text-lg">Delivery Address</h2>
          <p className="text-slate-500 text-sm -mt-2">Karachi area only (no ZIP codes)</p>

          {/* District */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">District *</label>
            <select value={address.districtId} onChange={onDistrictChange} className="select-field">
              <option value="">Select District</option>
              {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Town */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Town *</label>
            <select value={address.townId} onChange={onTownChange} className="select-field"
                    disabled={!address.districtId}>
              <option value="">Select Town</option>
              {towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Block / Sector */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Block / Sector *</label>
            <select value={address.blockSectorId}
                    onChange={(e) => setAddress((a) => ({ ...a, blockSectorId: e.target.value }))}
                    className="select-field" disabled={!address.townId}>
              <option value="">Select Block / Sector</option>
              {blockSectors.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Street Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Street Address *</label>
            <input type="text" placeholder='e.g. Plot 45, Street 7'
                   value={address.streetAddress}
                   onChange={(e) => setAddress((a) => ({ ...a, streetAddress: e.target.value }))}
                   className="input-field" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Apartment (optional)</label>
              <input type="text" placeholder='e.g. Flat 3B'
                     value={address.apartment}
                     onChange={(e) => setAddress((a) => ({ ...a, apartment: e.target.value }))}
                     className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Landmark{' '}
                <span className="text-brand-400 font-normal">(important in Karachi)</span>
              </label>
              <input type="text" placeholder='e.g. Near Faisal Masjid'
                     value={address.landmark}
                     onChange={(e) => setAddress((a) => ({ ...a, landmark: e.target.value }))}
                     className="input-field" />
            </div>
          </div>

          <button
            onClick={() => { if (validateAddress()) setStep(2); }}
            className="btn-primary self-end px-8"
          >
            Next: Review Order →
          </button>
        </div>
      )}

      {/* ── Step 2: Review & Payment ─────────────────────────────────────── */}
      {step === 2 && (
        <div className="flex flex-col gap-5 animate-fade-in">
          {/* Order Summary */}
          <div className="glass-card p-6">
            <h2 className="font-bold text-slate-100 text-lg mb-4">Order Summary</h2>
            <div className="flex flex-col gap-3">
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-slate-400">{item.name} × {item.quantity}</span>
                  <span className="text-slate-200 font-semibold">
                    Rs. {(parseFloat(item.price) * item.quantity).toLocaleString('en-PK')}
                  </span>
                </div>
              ))}
              <div className="divider" />
              <div className="flex justify-between font-bold">
                <span className="text-slate-200">Total</span>
                <span className="gradient-text text-xl">Rs. {totalAmount.toLocaleString('en-PK')}</span>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="glass-card p-6">
            <h2 className="font-bold text-slate-100 text-lg mb-4">Payment Method</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {['cod', 'prepaid'].map((pm) => (
                <button key={pm} onClick={() => setPaymentMethod(pm)}
                        className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                          paymentMethod === pm
                            ? 'border-brand-500 bg-brand-500/10'
                            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                        }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{pm === 'cod' ? '💵' : '💳'}</span>
                    <div>
                      <p className={`font-semibold text-sm ${paymentMethod === pm ? 'text-brand-400' : 'text-slate-300'}`}>
                        {pm === 'cod' ? 'Cash on Delivery' : 'Prepaid'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {pm === 'cod'
                          ? 'Requires OTP verification + risk check'
                          : 'JazzCash / EasyPaisa / Card'}
                      </p>
                    </div>
                  </div>
                  {pm === 'cod' && user?.riskScore !== undefined && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06]">
                      <p className="text-xs text-slate-500 mb-1.5">Your current risk score:</p>
                      <RiskScoreBadge score={user.riskScore} size="sm" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Notes */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Delivery Notes (optional)
              </label>
              <textarea rows={2} placeholder='e.g. "Call before arriving"'
                        value={notes} onChange={(e) => setNotes(e.target.value)}
                        className="input-field resize-none" />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="btn-ghost">← Back</button>
            <button onClick={handlePlaceOrder} disabled={loading}
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Placing…</>
                : `Place Order — Rs. ${totalAmount.toLocaleString('en-PK')}`
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: OTP Modal ────────────────────────────────────────────── */}
      {step === 3 && showOtp && placedOrder && (
        <OtpModal
          orderId={placedOrder.order.id}
          phoneNumber={user?.phone_number || user?.phoneNumber}
          onVerify={handleOtpVerified}
          onClose={() => navigate('/orders')}
        />
      )}
    </div>
  );
};

export default CheckoutPage;
