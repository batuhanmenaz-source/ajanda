import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.png'],
      manifest: {
        name: 'Ajanda',
        short_name: 'Ajanda',
        description: 'Takvim, hatırlatma, pazaryeri notları, kampanyalar ve aramalar tek yerde.',
        // Android "Paylaş" menüsünde Ajanda görünsün (WhatsApp mesajı vb. → hızlı ekle)
        share_target: {
          action: '/share',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' }
        },
        // Simgeye uzun basınca çıkan kısayollar
        shortcuts: [
          { name: 'Gider ekle', short_name: 'Gider', url: '/?yeni=gider', icons: [{ src: '/icons/sc-gider.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Sesle ekle', short_name: 'Sesle', url: '/?yeni=ses', icons: [{ src: '/icons/sc-ses.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Hatırlatma ekle', short_name: 'Hatırlatma', url: '/?yeni=hatirlatma', icons: [{ src: '/icons/sc-hatirlatma.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Ciro gir', short_name: 'Ciro', url: '/?yeni=ciro', icons: [{ src: '/icons/sc-ciro.png', sizes: '96x96', type: 'image/png' }] }
        ],
        lang: 'tr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F6F5F2',
        theme_color: '#F6F5F2',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Fiş okuma dosyaları büyük; yalnız kullanılınca indirilir
        globIgnores: ['ocr/**'],
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/ocr\//],
        runtimeCaching: []
      }
    })
  ]
});
