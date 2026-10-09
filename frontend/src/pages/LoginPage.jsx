import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginUser } from '../api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const LoginPage = () => {
  const { login, user } = useAuth();
  const navigate        = useNavigate();
  const [form, setForm] = useState({ phoneNumber: '', password: '' });
  const [loading, setLoading] = useState(false);

  // Already logged in — redirect
  if (user) { navigate('/'); return null; }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.phoneNumber || !form.password) {
      toast.error('Please fill in all fields.'); return;
    }
    setLoading(true);
    try {
      const res  = await loginUser(form);
      const data = res.data.data.user;
      login(res.data.token, {
        id:          data.id,
        fullName:    data.fullName,
        phoneNumber: data.phoneNumber,
        role:        data.role,
        riskScore:   data.riskScore,
        isCodEligible: data.isCodEligible,
      });
      toast.success(`Welcome back, ${data.fullName}!`);
      navigate(data.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-enter min-h-[90vh] flex items-center justify-center px-4 py-16">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px]
                      rounded-full pointer-events-none opacity-10"
           style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-slate-100">Welcome Back</h1>
          <p className="text-slate-500 text-sm mt-2">
            Sign in to shop and track your orders
          </p>
        </div>

        {/* Card */}
        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">
                  🇵🇰
                </span>
                <input
                  type="tel"
                  placeholder="+923001234567"
                  value={form.phoneNumber}
                  onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  className="input-field pl-10"
                  autoComplete="tel"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="input-field"
                autoComplete="current-password"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-1">
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</>
              ) : 'Sign In'}
            </button>
          </form>

          {/* Demo hint */}
          <div className="mt-5 rounded-xl p-3 text-center"
               style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <p className="text-brand-400 text-xs">
              🔐 Admin demo:{' '}
              <span className="font-mono font-bold">+923001234567</span>
              {' '}/{' '}
              <span className="font-mono font-bold">any password</span>
            </p>
          </div>

          <p className="text-center text-sm text-slate-600 mt-5">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-semibold transition-colors">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
