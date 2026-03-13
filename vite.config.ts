import legacy from '@vitejs/plugin-legacy';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  base: '/ChegadaPlanilha',

  plugins: [
    react(),

    legacy({
      targets: [
        'Android >= 5',
        'Chrome >= 37',
        'iOS >= 10'
      ],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    }),

    tsconfigPaths(),

    process.env.HTTPS ? mkcert() : undefined
  ].filter(Boolean),

  build: {
    target: 'es2015',
    minify: 'terser'
  },

  publicDir: './public',

  server: {
    host: true
  }
});