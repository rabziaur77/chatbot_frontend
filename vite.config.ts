import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'url';
import {defineConfig, loadEnv, type ProxyOptions} from 'vite';

export default defineConfig(({command, mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy: Record<string, ProxyOptions> = {};

  if (command === 'serve') {
    const configuredTarget = env.QA_API_PROXY_BASE_URL;
    if (!configuredTarget) {
      throw new Error(
        'QA_API_PROXY_BASE_URL must point to the explicitly configured QA backend.',
      );
    }

    let backendTarget: URL;
    try {
      backendTarget = new URL(configuredTarget);
    } catch {
      throw new Error('QA_API_PROXY_BASE_URL must be a valid HTTP(S) URL.');
    }
    if (
      !['http:', 'https:'].includes(backendTarget.protocol) ||
      !backendTarget.hostname ||
      backendTarget.username ||
      backendTarget.password ||
      backendTarget.search ||
      backendTarget.hash
    ) {
      throw new Error(
        'QA_API_PROXY_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.',
      );
    }

    const backendPath = backendTarget.pathname.replace(/\/+$/, '');
    const target = backendTarget.origin;
    proxy['/api'] = {
      target,
      changeOrigin: true,
      rewrite: (path) => `${backendPath}${path}`,
    };
    proxy['/ws'] = {
      target: target.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:'),
      ws: true,
      changeOrigin: true,
      rewrite: (path) => `${backendPath}${path}`,
    };
  }

  return {
    base: '/chatbot_frontend/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
