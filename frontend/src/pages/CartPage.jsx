import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

const CartPage = () => {
  const { cartItems, removeFromCart, updateQuantity, totalAmount } = useCart();
  const { user } = useAuth();
  const navigate  = useNavigate();

  if (cartItems.length === 0) {
    return (
      <div className="page-enter min-h-[80vh] flex flex-col items-center justify-center gap-6 px-4">
        <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl"
             style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          🛒
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-100">Your cart is empty</h2>
          <p className="text-slate-500 text-sm mt-2">Add products to start shopping.</p>
        </div>
        <Link to="/" className="btn-primary">Browse Products</Link>
      </div>
    );
  }

  return (
    <div className="page-enter max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-black text-slate-100 mb-8">
        Your Cart
        <span className="ml-3 text-lg font-normal text-slate-500">
          ({cartItems.length} item{cartItems.length > 1 ? 's' : ''})
        </span>
      </h1>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Items List ───────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {cartItems.map((item) => (
            <div key={item.id}
                 className="glass-card p-4 flex items-center gap-4 animate-fade-in">
              <img
                src={item.image_url}
                alt={item.name}
                className="w-20 h-20 rounded-xl object-cover flex-shrink-0 bg-surface-2"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-100 text-sm line-clamp-2">{item.name}</h3>
                <p className="text-brand-400 font-bold text-base mt-1">
                  Rs. {(parseFloat(item.price) * item.quantity).toLocaleString('en-PK')}
                </p>
                <p className="text-slate-600 text-xs">
                  Rs. {parseFloat(item.price).toLocaleString('en-PK')} each
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Quantity Control */}
                <div className="flex items-center rounded-lg overflow-hidden"
                     style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}>
                  <button onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="w-8 h-8 flex items-center justify-center text-slate-400
                                     hover:text-slate-100 hover:bg-white/[0.06] transition-colors">
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-slate-100">
                    {item.quantity}
                  </span>
                  <button onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-8 h-8 flex items-center justify-center text-slate-400
                                     hover:text-slate-100 hover:bg-white/[0.06] transition-colors">
                    +
                  </button>
                </div>
                <button onClick={() => removeFromCart(item.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600
                                   hover:text-risk hover:bg-risk/10 transition-all duration-200">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── Order Summary ────────────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="glass-card p-6 sticky top-24">
            <h2 className="font-bold text-slate-100 text-lg mb-5">Order Summary</h2>

            <div className="flex flex-col gap-3 mb-5">
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-slate-400 truncate mr-2">
                    {item.name} × {item.quantity}
                  </span>
                  <span className="text-slate-200 font-medium flex-shrink-0">
                    Rs. {(parseFloat(item.price) * item.quantity).toLocaleString('en-PK')}
                  </span>
                </div>
              ))}
            </div>

            <div className="divider mb-4" />

            <div className="flex justify-between items-center mb-6">
              <span className="text-slate-300 font-semibold">Total</span>
              <span className="text-2xl font-black gradient-text">
                Rs. {totalAmount.toLocaleString('en-PK')}
              </span>
            </div>

            {user ? (
              <button onClick={() => navigate('/checkout')} className="btn-primary w-full text-center">
                Proceed to Checkout →
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-slate-500 text-center">Login to place your order</p>
                <Link to="/login" className="btn-primary w-full text-center block">
                  Login to Checkout
                </Link>
              </div>
            )}

            <Link to="/" className="block text-center text-xs text-slate-600 hover:text-slate-400 mt-4 transition-colors">
              ← Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
