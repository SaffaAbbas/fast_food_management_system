import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

const isWebDeploy = Boolean(process.env.VERCEL || process.env.WEB_ONLY)

export default defineConfig({
  plugins: [
    react(),
    ...(!isWebDeploy
      ? [
          electron({
            main: {
              entry: 'electron/main.js',
              vite: {
                build: {
                  rollupOptions: {
                    external: ['better-sqlite3'],
                  },
                },
              },
            },
            preload: {
              input: path.join(__dirname, 'electron/preload.js'),
              vite: {
                build: {
                  rollupOptions: {
                    output: {
                      format: 'cjs',
                      entryFileNames: 'preload.cjs',
                    },
                  },
                },
              },
            },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    watch: {
      ignored: ['**/*.sqlite*', '**/database_storage/**', '**/test_*/**'],
    },
  },
})
