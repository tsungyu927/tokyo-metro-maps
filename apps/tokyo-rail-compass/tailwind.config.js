import { fileURLToPath } from 'node:url';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    fileURLToPath(new URL('./index.html', import.meta.url)),
    fileURLToPath(new URL('./src/**/*.{ts,tsx}', import.meta.url)),
    fileURLToPath(new URL('../../packages/map-ui/src/**/*.{ts,tsx}', import.meta.url)),
  ],
  theme: {
    extend: {
      boxShadow: {
        glass: '0 12px 36px -8px rgba(15, 23, 42, 0.14), 0 4px 12px -2px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
};
