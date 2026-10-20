/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#102d36',
        paper: '#f3f9fa',
        line: '#dbe8ea',
        muted: '#5e7278',
        accent: {
          DEFAULT: '#07809d',
          dark: '#05657c',
          soft: '#e2f4f7',
        },
        brass: '#d99a36',
        brand: {
          navy: '#102d36',
          deep: '#0b3c49',
          accent: '#07809d',
          mint: '#e2f4f7',
        },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        display: ['var(--font-display)', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      maxWidth: {
        '8xl': '88rem',
      },
    },
  },
  plugins: [],
};
