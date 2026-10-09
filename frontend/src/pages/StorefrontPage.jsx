import { useEffect, useState } from 'react';
import { getProducts } from '../api';
import ProductCard from '../components/ProductCard';

// ── Skeleton loader ──────────────────────────────────────────────────────────
const ProductSkeleton = () => (
  <div className="glass-card overflow-hidden">
    <div className="skeleton aspect-square" />
    <div className="p-4 flex flex-col gap-3">
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-3 w-2/3" />
      <div className="flex justify-between items-center mt-2">
        <div className="skeleton h-6 w-20" />
        <div className="skeleton h-9 w-20 rounded-lg" />
      </div>
    </div>
  </div>
);

const StorefrontPage = () => {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    getProducts()
      .then((res) => setProducts(res.data.data.products))
      .catch(() => setError('Failed to load products. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-enter min-h-screen">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative pt-24 pb-16 px-4 overflow-hidden">
        {/* Ambient glow blobs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 pointer-events-none"
             style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
        <div className="absolute top-0 right-1/4 w-[400px] h-[300px] translate-x-1/2 -translate-y-1/2 rounded-full opacity-10 pointer-events-none"
             style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }} />

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6
                           border border-brand-500/30 text-brand-400 bg-brand-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-safe animate-pulse" />
            Pakistan's First COD Risk Engine
          </span>
          <h1 className="text-5xl sm:text-6xl font-black leading-tight tracking-tight mb-5">
            Shop Smart.
            <br />
            <span className="gradient-text">Deliver Safer.</span>
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed max-w-xl mx-auto">
            Our AI-powered risk engine verifies every COD order before dispatch,
            slashing Return-to-Origin losses for Pakistani e-commerce.
          </p>

          {/* Trust pills */}
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            {[
              { icon: '🛡️', text: 'OTP Verified Orders' },
              { icon: '📊', text: 'Dynamic Risk Scoring' },
              { icon: '🚀', text: 'Karachi Localized' },
            ].map(({ icon, text }) => (
              <span key={text} className="glass-card px-4 py-2 text-sm text-slate-400 rounded-full">
                {icon} {text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product Grid ──────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="section-label">Featured Products</p>
            <h2 className="text-2xl font-bold text-slate-100">
              {loading ? 'Loading…' : `${products.length} products available`}
            </h2>
          </div>
        </div>

        {error && (
          <div className="glass-card p-6 text-center text-risk border-risk/20">
            ⚠️ {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)
            : products.map((p, i) => (
                <div key={p.id} className={`delay-${Math.min(i * 75, 375)}`}>
                  <ProductCard product={p} />
                </div>
              ))}
        </div>
      </section>
    </div>
  );
};

export default StorefrontPage;
