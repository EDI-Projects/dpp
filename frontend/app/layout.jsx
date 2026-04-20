import './globals.css'
import SessionBar from './components/SessionBar'
import Link from 'next/link'

export const metadata = {
  title: 'Digital Product Passport - Composite Digital Twins',
  description: 'Verifiable ERC-1155 Material Composition on Polygon',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0e1a] text-slate-200 selection:bg-blue-500/30">
        <header className="sticky top-0 z-50 px-4 md:px-6 pt-4">
          <nav className="max-w-7xl mx-auto section-shell subtle-ring px-4 md:px-6 py-3 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 group min-w-0">
              <div className="w-9 h-9 rounded-xl primary-gradient-bg flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/25 group-hover:shadow-blue-500/45 transition-shadow shrink-0">
                <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <div className="min-w-0">
                <span className="block text-base md:text-lg font-bold tracking-tight text-white leading-tight truncate">
                  Composite Digital Twin
                </span>
                <span className="block text-[10px] uppercase tracking-[0.2em] text-blue-300/90 font-semibold">
                  DPP Research
                </span>
              </div>
            </Link>
            
            <div className="hidden lg:flex items-center gap-2 text-sm font-semibold text-slate-400">
              <Link href="/explorer" className="px-3 py-2 rounded-lg hover:text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                Provenance Explorer
              </Link>
              <Link href="/history" className="px-3 py-2 rounded-lg hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Product History
              </Link>
              <Link href="/console" className="px-3 py-2 rounded-lg hover:text-purple-300 hover:bg-purple-500/10 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
                Supply Chain Console
              </Link>
            </div>
            
            <div className="flex-1 flex justify-end min-w-0">
              <SessionBar />
            </div>
          </nav>
        </header>
        
        <main className="relative z-10 animate-fade-in px-4 md:px-6 pb-10 pt-4 md:pt-6">
          {children}
        </main>
      </body>
    </html>
  )
}
