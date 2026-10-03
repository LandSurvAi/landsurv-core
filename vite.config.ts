import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'fs';

export default defineConfig(({ mode }) => {
    // Try to get GEMINI_API_KEY from multiple sources:
    // 1. Environment variable (set during Docker build or manually)
    // 2. .env file in root (for local development)
    let geminiKey = process.env.GEMINI_API_KEY || '';
    
    if (!geminiKey) {
        try {
            const envContent = fs.readFileSync('.env', 'utf-8');
            const match = envContent.match(/GEMINI_API_KEY\s*=\s*(.+)/);
            if (match) {
                geminiKey = match[1].trim();
            }
        } catch (e) {
            console.warn('Could not read .env file');
        }
    }
    
    const env = loadEnv(mode, '.', '');
    
    // Generate version string from timestamp for cache busting
    const buildVersion = new Date().toISOString().replace(/[:.]/g, '-');
    const localMetadata = {
      title: 'LandSurv.ai - AI for Surveying and Civil Engineering',
      description: 'Modern AI tools for surveyors and civil engineers: analyze plans and geospatial data, automate calculations, and move field work forward.',
      url: 'http://localhost:5173',
    };
    
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        watch: {
          // civil3d-client build output (.NET obj/bin) gets locked by the
          // Visual Studio/MSBuild toolchain intermittently, which crashes
          // Vite's fs watcher with EBUSY. It's not app source, so exclude it.
          ignored: ['**/civil3d-client/obj/**', '**/civil3d-client/bin/**'],
        },
        proxy: {
          // Proxy API calls to local backend during development.
          // When the backend is offline (common during pure-frontend work),
          // Vite's default behavior is to return a noisy 500 for every /api
          // request. Instead, intercept proxy errors and return a structured
          // 503 with a safe stub body so callers can degrade silently.
          '/api': {
            target: env.VITE_BACKEND_URL || 'http://127.0.0.1:3001',
            changeOrigin: true,
            secure: false,
            configure: (proxy /* http-proxy server */) => {
              proxy.on('error', (err: NodeJS.ErrnoException, req, res) => {
                // Only handle real socket-level failures (backend offline).
                const isConnFail = err && (
                  err.code === 'ECONNREFUSED' ||
                  err.code === 'ECONNRESET' ||
                  err.code === 'ETIMEDOUT' ||
                  err.code === 'EHOSTUNREACH' ||
                  err.code === 'ENOTFOUND'
                );
                if (!isConnFail) return;
                // ServerResponse from Node http; may already be writable.
                const r = res as import('http').ServerResponse | undefined;
                if (!r || r.headersSent || r.writableEnded) return;
                const url = (req as import('http').IncomingMessage).url || '';
                // Endpoint-specific stub bodies so the client gets shape-valid
                // JSON and doesn't throw inside response parsers.
                let body: any = { error: 'backend offline', degraded: true };
                if (url.startsWith('/api/streets')) {
                  body = []; // fetchStreetLabels expects an array
                } else if (url.startsWith('/api/devops/public/global-settings')) {
                  body = { settings: {}, version: 0, updatedAt: new Date().toISOString(), degraded: true };
                } else if (url.startsWith('/api/debug/log')) {
                  body = { ok: true, degraded: true };
                }
                const shouldSoftSucceed =
                  url.startsWith('/api/streets') ||
                  url.startsWith('/api/devops/public/global-settings') ||
                  url.startsWith('/api/debug/log');
                r.statusCode = shouldSoftSucceed ? 200 : 503;
                r.setHeader('Content-Type', 'application/json');
                r.setHeader('X-Dev-Proxy-Degraded', '1');
                r.end(JSON.stringify(body));
              });
            },
          },
        },
      },
      plugins: [
        react(),
        {
          name: 'landsurv-local-metadata',
          apply: 'serve',
          transformIndexHtml(html) {
            return html
              .replaceAll('__LANDSURV_META_TITLE__', localMetadata.title)
              .replaceAll('__LANDSURV_META_DESCRIPTION__', localMetadata.description)
              .replaceAll('__LANDSURV_META_URL__', localMetadata.url);
          },
        },
      ],
      build: {
        sourcemap: true, // Generate source maps for production debugging
        modulePreload: {
          polyfill: false, // Disable preload polyfill to avoid crossorigin warnings
        },
        rollupOptions: {
          input: {
            main: './index.html',
            rinex: './rinex.html',
          },
          output: {
            manualChunks: {
              // Vendor chunks to reduce main bundle size
              'react': ['react', 'react-dom'],
              'google-genai': ['@google/genai'],
              'pdf': ['pdfjs-dist', 'jspdf', 'jspdf-autotable'],
              'geospatial': ['proj4', 'jszip'],
              'graphics': ['dxf-writer', 'qrcode', 'tesseract.js'],
              'docs': ['docx'],
            }
          }
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(geminiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildVersion)
      },
    };
});
