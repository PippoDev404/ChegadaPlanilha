import react from '@vitejs/plugin-react-swc';
import legacy from '@vitejs/plugin-legacy';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ChegadaPlanilha',
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern',
      },
    },
  },
  plugins: [
    react(),
    legacy({
      targets: [
        'defaults',
        'Android >= 7',
        'Chrome >= 70',
        'iOS >= 12',
      ],
    }),
    tsconfigPaths(),
    process.env.HTTPS ? mkcert() : undefined,
  ].filter(Boolean),
  build: {
    minify: 'terser',
  },
  publicDir: './public',
  server: {
    host: true,
  },
});