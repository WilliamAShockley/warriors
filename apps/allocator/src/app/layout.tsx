import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import './globals.css'
import Chrome from '@/components/Chrome'

const display = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-display',
})

const ui = Inter({
  subsets: ['latin'],
  variable: '--font-ui',
})

export const metadata: Metadata = {
  title: 'The Allocator',
  description: 'A private brief for the discerning manager.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'The Allocator',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#F5F2EA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`}>
      <body className="font-sans">
        <div className="mx-auto min-h-dvh w-full max-w-[430px] px-6 pb-32">
          {children}
        </div>
        <Chrome />
      </body>
    </html>
  )
}
