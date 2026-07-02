/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#14112A',
          850: '#1D1938',
          700: '#2C2650',
        },
        paper: '#FAF8F4',
        signal: '#FF6B47',
        pulse: '#2FD4A8',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}