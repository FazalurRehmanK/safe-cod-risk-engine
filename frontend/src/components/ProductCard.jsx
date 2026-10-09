import { useState } from 'react';
import { useCart } from '../context/CartContext';
import toast from 'react-hot-toast';

const ProductCard = ({ product }) => {
  const { addToCart, cartItems } = useCart();
  const [adding, setAdding]     = useState(false);

  const inCart     = cartItems.find((i) => i.id === product.id);
  const outOfStock = product.stock_quantity === 0;

  const handleAdd = () => {
    if (outOfStock) return;
    setAdding(true);
    addToCart(product);
    toast.success(`${product.name} added to cart!`);
    setTimeout(() => setAdding(false), 600);
  };

  return (
    <div
      className="glass-card group flex flex-col overflow-hidden animate-fade-in
                 hover:-translate-y-1 hover:shadow-glow-brand transition-all duration-300"
    >
      {/* ── Product Image ────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden aspect-square bg-surface-2">
        <img
          src={product.image_url}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {/* Stock badge */}
        {product.stock_quantity <= 5 && product.stock_quantity > 0 && (
          <span className="absolute top-2 right-2 badge text-amber-400 bg-amber-400/10 border border-amber-400/20">
            Only {product.stock_quantity} left
          </span>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="badge text-slate-400 bg-slate-800/80">Out of Stock</span>
          </div>
        )}
      </div>

      {/* ── Product Info ─────────────────────────────────────────────────── */}
      <div className="p-4 flex flex-col flex-1 gap-3">
        <div className="flex-1">
          <h3 className="font-semibold text-slate-100 text-sm leading-snug line-clamp-2">
            {product.name}
          </h3>
          <p className="text-slate-500 text-xs mt-1 line-clamp-2">{product.description}</p>
        </div>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/[0.06]">
          <div>
            <p className="text-xl font-bold text-slate-100">
              <span className="text-sm font-normal text-slate-500 mr-0.5">Rs.</span>
              {parseFloat(product.price).toLocaleString('en-PK')}
            </p>
          </div>
          <button
            onClick={handleAdd}
            disabled={outOfStock}
            className={`
              flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-2
              transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
              ${adding ? 'scale-95' : ''}
              ${inCart && !outOfStock
                ? 'text-brand-400 border border-brand-500/40 bg-brand-500/10 hover:bg-brand-500/20'
                : 'btn-primary text-sm py-2 px-3'
              }
            `}
          >
            {adding ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="32" strokeDashoffset="32" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            )}
            {inCart ? 'In Cart' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
