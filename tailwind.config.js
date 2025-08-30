/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        ink: '#e9f5ef',
        bg: '#0f1e16',
        panel: '#15241e',
        panel2: '#1a2d25',
        borderc: '#244437',
        accent: '#14b893',
        danger: '#ff6b6b',
        muted: '#a9c8ba'
      },
      borderRadius: { xl: '0.75rem' }
    }
  },
  plugins: []
}

