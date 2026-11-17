import { defineConfig } from 'vite';

// base './' so the build works at https://<user>.github.io/space-trooper/
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  define: { __BUILD__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'local') },
});
