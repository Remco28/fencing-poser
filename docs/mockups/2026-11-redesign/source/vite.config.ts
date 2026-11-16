import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here,
  cacheDir: here + '.vite-cache',
  plugins: [react()],
  resolve: { alias: { '@app': '/home/frank/Projects/fencing-poser/src' } },
  server: { fs: { allow: ['/home/frank/Projects/fencing-poser', here] } },
});
