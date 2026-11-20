import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function wasmCompressionPlugin(): Plugin {
  let cachedWasmBr: Buffer | null = null
  let cachedWasmGz: Buffer | null = null
  let cachedMtime = 0

  const getCompressedWasm = (wasmPath: string) => {
    const stat = fs.statSync(wasmPath)
    if (!cachedWasmBr || !cachedWasmGz || stat.mtimeMs !== cachedMtime) {
      const raw = fs.readFileSync(wasmPath)
      cachedWasmGz = zlib.gzipSync(raw, { level: 9 })
      cachedWasmBr = zlib.brotliCompressSync(raw, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
      })
      cachedMtime = stat.mtimeMs
    }
    return { br: cachedWasmBr, gz: cachedWasmGz }
  }

  const attachMiddleware = (
    middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void },
    wasmFilePath: string
  ) => {
    middlewares.use((req, res, next) => {
      const urlPath = (req.url || '').split('?')[0]
      if (!urlPath.endsWith('/studio.wasm') || !fs.existsSync(wasmFilePath)) {
        next()
        return
      }
      const enc = String(req.headers['accept-encoding'] || '')
      const { br, gz } = getCompressedWasm(wasmFilePath)
      res.setHeader('Content-Type', 'application/wasm')
      res.setHeader('Vary', 'Accept-Encoding')
      if (enc.includes('br')) {
        res.setHeader('Content-Encoding', 'br')
        res.setHeader('Content-Length', br.length)
        res.end(br)
        return
      }
      if (enc.includes('gzip')) {
        res.setHeader('Content-Encoding', 'gzip')
        res.setHeader('Content-Length', gz.length)
        res.end(gz)
        return
      }
      next()
    })
  }

  return {
    name: 'wasm-compression',
    configureServer(server) {
      attachMiddleware(server.middlewares, path.resolve(process.cwd(), 'public/studio.wasm'))
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares, path.resolve(process.cwd(), 'dist/studio.wasm'))
    },
    closeBundle() {
      const distDir = path.resolve(process.cwd(), 'dist')
      const wasmOut = path.join(distDir, 'studio.wasm')
      if (fs.existsSync(wasmOut)) {
        const raw = fs.readFileSync(wasmOut)
        fs.writeFileSync(`${wasmOut}.gz`, zlib.gzipSync(raw, { level: 9 }))
        fs.writeFileSync(
          `${wasmOut}.br`,
          zlib.brotliCompressSync(raw, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
          })
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/charm-studio/' : '/',
  plugins: [react(), wasmCompressionPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
})
