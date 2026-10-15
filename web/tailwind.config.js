/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { brand: { navy: '#0B3D91', deep: '#082C6B', accent: '#F59E0B', mint: '#ECFDF5' } },
    },
  },
  plugins: [],
};
