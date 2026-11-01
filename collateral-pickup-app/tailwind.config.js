/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: '#E11900', // Airtel/Instapay Red
        'brand-dark': '#B31400',
        gold: '#F59E0B',
      }
    },
  },
  plugins: [],
}
