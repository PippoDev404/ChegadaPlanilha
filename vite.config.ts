import react from '@vitejs/plugin-react-swc';
import legacy from '@vitejs/plugin-legacy';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import tsconfigPaths from 'vite-tsconfig-paths';

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
        'Android >= 5',
        'Chrome >= 37',
        'iOS >= 10',
      ],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      renderLegacyChunks: true,
      modernPolyfills: true,
    }),
    tsconfigPaths(),
    process.env.HTTPS ? mkcert() : undefined,
  ].filter(Boolean),
  build: {
    target: 'es2015',
    minify: false,
    cssCodeSplit: false,
    sourcemap: false,
  },
  publicDir: './public',
  server: {
    host: true,
  },
});