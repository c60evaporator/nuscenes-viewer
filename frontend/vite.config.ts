export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://api:8000',  // Docker サービス名で解決
        rewrite: path => path.replace(/^\/api/, ''),
      }
    }
  }
})
