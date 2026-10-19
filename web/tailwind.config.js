/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14201f',
        paper: '#f6f4ef',
        line: '#e4e0d7',
        muted: '#66706d',
        accent: {
          DEFAULT: '#0f5c63',
          dark: '#0b464b',
          soft: '#e8f1f0',
        },
        brass: '#a9844f',
        brand: {
          navy: '#14201f',
          deep: '#0b464b',
          accent: '#0f5c63',
          mint: '#e8f1f0',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Inter', 'Arial', 'sans-serif'],
        display: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      maxWidth: {
        '8xl': '88rem',
      },
    },
  },
  plugins: [],
};
