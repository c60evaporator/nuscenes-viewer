import { defineConfig } from 'vitest/config'
import yaml from '@rollup/plugin-yaml'
import path from 'path'

export default defineConfig({
  plugins: [yaml()],
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
