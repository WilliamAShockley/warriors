import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Allocator',
    short_name: 'Allocator',
    description: 'A private brief for the discerning manager.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F2EA',
    theme_color: '#F5F2EA',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
