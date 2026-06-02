import path from 'node:path'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  // Relative asset URLs: the server injects a `<base href>` (e.g. `/wiki/web/`
  // or `/web/`) so the bundle resolves under any configured base path / web
  // slug without a per-deployment rebuild. See ai-memory `--base-path`.
  base: './',
  plugins: [
    tailwindcss(),
    // i18n via inlang Paraglide — compila messages/{locale}.json p/ src/paraglide.
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
    }),
    tanstackRouter({
      autoCodeSplitting: true,
      target: 'solid',
    }),
    solid(),
  ],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
  // Dev-only: proxy /api/v1 para um ai-memory rodando localmente. Override com
  // AI_MEMORY_PROXY (ex: http://127.0.0.1:49374 p/ o workspace zomme).
  server: {
    proxy: {
      '/api/v1': {
        target: process.env.AI_MEMORY_PROXY ?? 'http://127.0.0.1:49380',
        changeOrigin: true,
      },
    },
  },
})
