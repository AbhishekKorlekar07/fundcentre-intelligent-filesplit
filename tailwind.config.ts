import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#dbe5ff',
          500: '#3b5bdb',
          600: '#2f4bc9',
          700: '#243a9e',
          900: '#142055',
        },
      },
    },
  },
  plugins: [],
};
export default config;
