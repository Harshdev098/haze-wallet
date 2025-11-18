import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    base: '/haze-wallet',
    plugins: [
        react(),
        wasm(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name: 'Haze Wallet',
                short_name: 'Wallet',
                start_url: '/haze-wallet/',
                display: 'standalone',
                background_color: '#e5f1ffff',
                theme_color: '#111827',
                icons: [
                    {
                        src: '/haze-wallet/logo.png',
                        sizes: '192x192',
                        type: 'image/webp',
                    },
                ],
            },
            workbox: {
                maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
                runtimeCaching: [
                    {
                        urlPattern: ({ request }) => request.destination === 'document',
                        handler: 'NetworkFirst',
                    },
                    {
                        urlPattern: ({ request }) =>
                            request.destination === 'script' || request.destination === 'worker',
                        handler: 'CacheFirst',
                    },
                    {
                        urlPattern: /.*\.wasm$/,
                        handler: 'CacheFirst',
                    },
                ],
            },
        }),
    ],
    build: {
        target: 'esnext',
        rollupOptions: {
            output: {
                manualChunks: {
                    fedimint: ['@fedimint/core-web'],
                    ndk: [
                        '@nostr-dev-kit/ndk',
                        '@nostr-dev-kit/ndk-cache-dexie',
                        'nostr-tools',
                        '@noble/hashes',
                    ],
                    bitcoin: [
                        '@mempool/mempool.js',
                        '@scure/bip32',
                        '@scure/bip39',
                        'bitcoin-address-validation',
                    ],
                },
            },
        },
    },
    worker: {
        format: 'es',
        plugins: () => [wasm()],
    },
    optimizeDeps: {
        exclude: ['@fedimint/core-web'],
    },
});
