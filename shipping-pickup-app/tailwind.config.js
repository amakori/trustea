/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: '#0284C7', // Sky Blue Express
        'brand-dark': '#0369A1',
        trustea: '#E11900', // Airtel/Trustea Red
        gov: '#059669', // Emerald Government Green
      }
    },
  },
  plugins: [],
}
