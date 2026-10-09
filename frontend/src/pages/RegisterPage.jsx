import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerUser } from '../api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const RegisterPage = () => {
  const { login, user } = useAuth();
  const navigate        = useNavigate();
  const [form, setForm] = useState({
    fullName: '', phoneNumber: '', email: '', password: '', confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);

  if (user) { navigate('/'); return null; }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.fullName || !form.phoneNumber || !form.password) {
      toast.error('Full name, phone number, and password are required.'); return;
    }
    if (!/^\+92[0-9]{10}$/.test(form.phoneNumber)) {
      toast.error('Phone must be in format: +92XXXXXXXXXX'); return;
    }
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters.'); return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match.'); return;
    }

    setLoading(true);
    try {
      const res  = await registerUser({
        fullName:    form.fullName,
        phoneNumber: form.phoneNumber,
        email:       form.email || undefined,
        password:    form.password,
      });
      const data = res.data.data.user;
      login(res.data.token, {
        id:          data.id,
        fullName:    data.full_name,
        phoneNumber: data.phone_number,
        role:        data.role,
        riskScore:   100,
        isCodEligible: true,
      });
      toast.success('Account created! Welcome to Safe-COD 🎉');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-enter min-h-[90vh] flex items-center justify-center px-4 py-16">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px]
                      rounded-full pointer-events-none opacity-10"
           style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }} />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-slate-100">Create Account</h1>
          <p className="text-slate-500 text-sm mt-2">
            New accounts start with a{' '}
            <span className="text-safe font-semibold">Risk Score of 100</span>
          </p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Full Name *</label>
              <input type="text" placeholder="Ahmed Khan"
                     value={form.fullName} onChange={set('fullName')}
                     className="input-field" autoComplete="name" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Phone Number *{' '}
                <span className="text-slate-600 font-normal">(E.164 format)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">🇵🇰</span>
                <input type="tel" placeholder="+923001234567"
                       value={form.phoneNumber} onChange={set('phoneNumber')}
                       className="input-field pl-10" autoComplete="tel" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Email{' '}
                <span className="text-slate-600 font-normal">(optional)</span>
              </label>
              <input type="email" placeholder="you@email.com"
                     value={form.email} onChange={set('email')}
                     className="input-field" autoComplete="email" />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password *</label>
                <input type="password" placeholder="Min. 6 characters"
                       value={form.password} onChange={set('password')}
                       className="input-field" autoComplete="new-password" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Confirm *</label>
                <input type="password" placeholder="Repeat password"
                       value={form.confirmPassword} onChange={set('confirmPassword')}
                       className="input-field" autoComplete="new-password" />
              </div>
            </div>

            {/* Risk score explainer */}
            <div className="rounded-xl p-4"
                 style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
              <p className="text-safe text-xs font-semibold mb-1">🛡️ How the Risk Score Works</p>
              <p className="text-slate-500 text-xs leading-relaxed">
                You start at <strong className="text-slate-300">100/100</strong>.
                Each delivered COD order earns <strong className="text-safe">+10 pts</strong>.
                Each RTO (return) costs <strong className="text-risk">−30 pts</strong>.
                Stay above <strong className="text-slate-300">40</strong> to keep COD access.
              </p>
            </div>

            <button type="submit" disabled={loading}
                    className="btn-primary w-full flex items-center justify-center gap-2 mt-1">
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</>
              ) : 'Create Account →'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-600 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
