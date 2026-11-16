import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
// The app this mock-up borrows its figures from: the repository this folder sits in.
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
export default defineConfig({
  root: here,
  cacheDir: here + '.vite-cache',
  plugins: [react()],
  resolve: { alias: { '@app': repo + 'src' } },
  server: { fs: { allow: [repo, here] } },
});
