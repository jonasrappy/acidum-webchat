import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    svelte(),
    {
      name: 'development-policy',
      transformIndexHtml(html) {
        if (command !== 'serve') return html;
        return html
          .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
          .replace(
            "connect-src 'self' https: wss://ws0.acium.app",
            "connect-src 'self' https: ws://127.0.0.1:8765 wss://ws0.acium.app",
          );
      },
    },
  ],
  server: { host: '127.0.0.1', port: 8765, strictPort: true },
  preview: { host: '127.0.0.1', port: 8765, strictPort: true },
  build: { target: 'es2022' },
}));
