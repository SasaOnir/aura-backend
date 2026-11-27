/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        aura: {
          night: '#0f0a2e',
          deep: '#1a0b3d',
          card: '#1e1145',
          line: '#2d2059',
          accent: '#ff7eb6',
          violet: '#a26bff',
          teal: '#5ef0e8',
          gold: '#ffd166',
          text: '#e8e6f5',
          mute: '#a3a0c0',
          dim: '#6a678a',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
