import path from 'node:path'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import solid from '@solidjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { defineConfig } from 'vite'

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
    // One runtime copy in the bundle and in the split chunks (see `overrides`
    // in package.json for the rc pin).
    dedupe: ['solid-js', '@solidjs/web'],
  },
  // Dev-only: encaminha a API para o engine local (compose em ~/.ai-memory-local,
  // porta 49380). Sem isso o Vite responde 404 em /admin e a visão geral mostra
  // "Could not load". Override com AI_MEMORY_PROXY.
  server: {
    proxy: {
      '/api/v1': {
        target: process.env.AI_MEMORY_PROXY ?? 'http://127.0.0.1:49380',
        changeOrigin: true,
      },
      '/admin': {
        target: process.env.AI_MEMORY_PROXY ?? 'http://127.0.0.1:49380',
        changeOrigin: true,
      },
      '/auth': {
        target: process.env.AI_MEMORY_PROXY ?? 'http://127.0.0.1:49380',
        changeOrigin: true,
      },
    },
  },
})
