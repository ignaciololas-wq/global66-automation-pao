import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Identidad Global66 (heredada del stack vanilla)
        brand: {
          50:  '#f5f7fe',
          100: '#E9EDF8',
          200: '#9ba9d0',
          400: '#3F5EDF',
          500: '#1F49B6',
          600: '#003eea',
          700: '#102a97',
          800: '#0b1f4b',
          900: '#132046',
        },
        mint:   '#33d9b2',
        ok:     '#02A757',
        warn:   '#f0b429',
        danger: '#e64a4a',
        ink:    '#132046',
        muted:  '#565656',
        border: '#E9EDF8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'sans-serif'],
        serif: ['Times New Roman', 'serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(19,32,70,0.04), 0 8px 24px rgba(19,32,70,0.06)',
        lift: '0 4px 12px rgba(19,32,70,0.08), 0 20px 60px rgba(19,32,70,0.12)',
      },
      borderRadius: {
        pill: '999px',
      },
      keyframes: {
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.32s cubic-bezier(0.22, 0.61, 0.36, 1) both',
        'fade-in':  'fade-in 0.15s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
