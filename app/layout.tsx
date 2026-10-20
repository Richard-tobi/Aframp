import type React from 'react'
import type { Metadata, Viewport } from 'next'
import { Manrope, Outfit, Space_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
  preload: false,
})

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-cal-sans',
  display: 'swap',
  preload: false,
})

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: 'Aframp - Buy Crypto, Pay Bills & Send Money in Africa',
  description:
    "Africa's premier cNGN stablecoin payment platform. Buy crypto from ₦2,000, pay bills instantly, and send money across 12 African countries.",
  keywords: [
    'cNGN',
    'stablecoin',
    'crypto',
    'Nigeria',
    'Africa',
    'payments',
    'bills',
    'fintech',
    'Aframp',
  ],
  generator: 'v0.app',
}

export const viewport: Viewport = {
  themeColor: '#10b981',
}

// This is a server component by default
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${outfit.variable} ${spaceMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Skip to content
          </a>
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
