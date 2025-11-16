// @ts-nocheck
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


@import 'tailwindcss/base';
@import 'tailwindcss/components';
@import 'tailwindcss/utilities';



* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #1A1D21;
  color: #fff;
}