import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  // Ensure built assets resolve under /app when served by Axum
  base: '/app/',
  plugins: [
    react(),
    // Bundle analyzer for development
    visualizer({
      filename: 'dist/bundle-analysis.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    })
  ],
  server: {
    port: 5173,
    proxy: {
      // Proxy API + WS to backend for local dev
      '/api': 'http://127.0.0.1:8080',
      '/ws': {
        target: 'http://127.0.0.1:8080',
        ws: true
      },
      '/healthz': 'http://127.0.0.1:8080',
      '/readyz': 'http://127.0.0.1:8080',
      '/metrics': 'http://127.0.0.1:8080',
      '/api-docs': 'http://127.0.0.1:8080'
    }
  },
  build: {
    // Target modern browsers for smaller bundle
    target: 'es2020',
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    // Code splitting configuration
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk for React and related libraries
          vendor: ['react', 'react-dom'],
          // Chart libraries chunk
          charts: ['echarts-for-react', 'echarts'],
          // Utility libraries chunk
          utils: ['@tanstack/react-query', 'zustand'],
          // UI component chunk
          ui: ['clsx', 'tailwind-merge'],
        },
        // Optimize chunk file names
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
          if (facadeModuleId) {
            if (facadeModuleId.includes('pages/')) {
              return 'pages/[name]-[hash].js'
            }
            if (facadeModuleId.includes('components/')) {
              return 'components/[name]-[hash].js'
            }
          }
          return 'chunks/[name]-[hash].js'
        },
        // Asset file names
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name?.split('.').at(1)
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType ?? '')) {
            return 'assets/images/[name]-[hash][extname]'
          }
          if (/woff|woff2|eot|ttf|otf/i.test(extType ?? '')) {
            return 'assets/fonts/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
    // Increase chunk size warning limit for chart libraries
    chunkSizeWarningLimit: 1000,
    // Source maps for debugging in production
    sourcemap: true,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'zustand',
      'clsx',
      'tailwind-merge',
      'fast-deep-equal',
      'size-sensor'
    ],
    exclude: [
      'echarts-for-react',
      'echarts'
    ]
  },
  // Preview server configuration
  preview: {
    port: 4173,
    host: true,
  },
})
