import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base — CrazyGames serves the game from a sandboxed iframe whose
  // path is not '/NeonFactoryRaid/'. Using './' makes asset URLs work on CG,
  // itch.io, file:// previews, and most static hosts without a redirect.
  base: './',
  publicDir: 'public',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          // Three.js gets its own chunk so it doesn't bloat the initial JS
          // bundle. The Scrapyard scene is dynamically imported from main.ts,
          // so this chunk is fetched on demand the first time the player
          // enters the violet pad.
          three: ['three'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
