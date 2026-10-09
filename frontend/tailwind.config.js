/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
        surface: {
          DEFAULT: '#13131a',
          2: '#1a1a24',
          3: '#21212f',
        },
        safe:    '#10b981',
        caution: '#f59e0b',
        moderate:'#f97316',
        risk:    '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in':    'fadeIn 0.5s ease-out',
        'slide-up':   'slideUp 0.4s ease-out',
        'pulse-glow': 'pulseGlow 2s infinite',
        'shake':      'shake 0.45s ease-in-out',
        'bounce-in':  'bounceIn 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        'spin-slow':  'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(99, 102, 241, 0.4)' },
          '50%':      { boxShadow: '0 0 24px 6px rgba(99, 102, 241, 0.15)' },
        },
        shake: {
          '0%, 100%':           { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-6px)' },
          '20%, 40%, 60%, 80%':     { transform: 'translateX(6px)' },
        },
        bounceIn: {
          '0%':   { transform: 'scale(0.9)', opacity: '0' },
          '60%':  { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
      },
      boxShadow: {
        'glow-brand': '0 0 32px rgba(99, 102, 241, 0.25)',
        'glow-safe':  '0 0 24px rgba(16, 185, 129, 0.3)',
        'glow-risk':  '0 0 24px rgba(239, 68, 68, 0.3)',
        'card':       '0 4px 24px rgba(0, 0, 0, 0.4)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
