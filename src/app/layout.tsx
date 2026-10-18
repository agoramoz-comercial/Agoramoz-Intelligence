import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/albert-sans'
import './globals.css'
import Script from 'next/script'
import { RevealObserver } from '@/components/reveal'

export const metadata: Metadata = {
  title: { default: 'AGORAMOZ HR', template: '%s · AGORAMOZ HR' },
  description: 'Gateway de recrutamento: candidaturas, comunicação, entrevistas, decisões e dados num único sistema.',
  applicationName: 'AGORAMOZ HR',
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#0a2540',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-MZ" suppressHydrationWarning>
      <body>
        <Script id="js-flag" strategy="beforeInteractive">{`document.documentElement.classList.add('js')`}</Script>
        {children}
        <RevealObserver />
      </body>
    </html>
  )
}
