import './globals.css'
import SessionBar from './components/SessionBar'

export const metadata = {
  title: 'Digital Product Passport',
  description: 'W3C Verifiable Credentials for supply chain transparency',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 selection:bg-indigo-500/30">
        <header className="sticky top-0 z-50 glass border-b border-white/20">
          <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg primary-gradient-bg flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-shadow">
                <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300">
                DPP
              </span>
            </a>
            
            <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-gray-500 dark:text-gray-400">
              <a href="/actors" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Network Registry</a>
              <a href="/issue" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg> Issue Passport</a>
              <a href="/dashboard" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Your Dashboard</a>
            </div>
            
            <div className="flex-1 flex justify-end">
              <SessionBar />
            </div>
          </nav>
        </header>
        
        <main className="max-w-7xl mx-auto px-6 py-12 relative z-10" style={{ animation: "fadeIn 0.5s ease-out forwards" }}>
          {children}
        </main>
        
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes shimmer { 100% { transform: translateX(100%); } }
        `}} />
      </body>
    </html>
  )
}

