/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        slack: {
          purple: '#4A154B',
          dark: '#1A1D21',
          light: '#F8F8F8'
        }
      }
    },
  },
  plugins: [],
}