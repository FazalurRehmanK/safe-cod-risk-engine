import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import RiskScoreBadge from './RiskScoreBadge';
import toast from 'react-hot-toast';

// ── Shield Logo SVG ─────────────────────────────────────────────────────────
const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="url(#g)" strokeWidth="1.8">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#c084fc" />
      </linearGradient>
    </defs>
    <path d="M12 3L4 7v5c0 4.4 3.4 8.5 8 9.5 4.6-1 8-5.1 8-9.5V7l-8-4z"
          strokeLinejoin="round" strokeLinecap="round" />
    <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CartBagIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.8">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" strokeLinejoin="round" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 01-8 0" />
  </svg>
);

const Navbar = () => {
  const { user, logout } = useAuth();
  const { totalItems }   = useCart();
  const navigate         = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully.');
    navigate('/');
  };

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        background: 'rgba(10,10,15,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderColor: 'rgba(255,255,255,0.07)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

        {/* ── Logo ─────────────────────────────────────────────────── */}
        <Link to="/" className="flex items-center gap-2.5 group flex-shrink-0">
          <ShieldIcon />
          <span className="font-extrabold text-lg tracking-tight">
            <span className="gradient-text">Safe</span>
            <span className="text-slate-300">-COD</span>
          </span>
        </Link>

        {/* ── Nav Links ────────────────────────────────────────────── */}
        <div className="hidden sm:flex items-center gap-1">
          <NavLink to="/">Shop</NavLink>
          {user && <NavLink to="/orders">My Orders</NavLink>}
          {user?.role === 'admin' && (
            <NavLink to="/admin">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-safe" />
                Admin
              </span>
            </NavLink>
          )}
        </div>

        {/* ── Right Section ────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          {/* Risk score badge for logged-in customers */}
          {user && user.role === 'customer' && user.riskScore !== undefined && (
            <RiskScoreBadge score={user.riskScore} size="sm" showLabel={false} />
          )}

          {/* Cart */}
          <Link
            to="/cart"
            className="relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200
                       hover:bg-white/[0.06] text-slate-400 hover:text-slate-100"
            aria-label="Cart"
          >
            <CartBagIcon />
            {totalItems > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full
                           flex items-center justify-center text-[10px] font-bold text-white
                           animate-bounce-in"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              >
                {totalItems > 9 ? '9+' : totalItems}
              </span>
            )}
          </Link>

          {/* Auth actions */}
          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden md:block text-xs text-slate-500">
                {user.fullName || user.full_name || user.phone_number}
              </span>
              <button
                onClick={handleLogout}
                className="text-xs text-slate-500 hover:text-slate-200 transition-colors px-3 py-1.5
                           rounded-lg hover:bg-white/[0.06] border border-transparent hover:border-white/10"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login"
                className="text-sm text-slate-400 hover:text-slate-100 transition-colors px-3 py-1.5">
                Login
              </Link>
              <Link to="/register" className="btn-primary text-sm py-2 px-4">
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

// Small helper for nav links
const NavLink = ({ to, children }) => (
  <Link
    to={to}
    className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-100
               hover:bg-white/[0.06] transition-all duration-150"
  >
    {children}
  </Link>
);

export default Navbar;
