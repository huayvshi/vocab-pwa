import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base 用相对路径，方便放到任意子目录或静态托管的任意路径下
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  // 通过 Cloudflare 隧道/反向代理访问时，Host 头是外部域名，
  // Vite 默认会拦掉（返回 403 "Blocked request"），这里放行隧道域名与局域网 IP
  server: {
    allowedHosts: ['.trycloudflare.com', '.cfargotunnel.com', 'localhost', '127.0.0.1'],
  },
  preview: {
    allowedHosts: ['.trycloudflare.com', '.cfargotunnel.com', 'localhost', '127.0.0.1'],
  },
})
