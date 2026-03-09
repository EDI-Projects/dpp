import './globals.css'
import SessionBar from './components/SessionBar'

export const metadata = {
  title: 'Digital Product Passport',
  description: 'W3C Verifiable Credentials for supply chain transparency',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="bg-white border-b border-gray-200 px-6 py-3">
          <nav className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <a href="/" className="text-xl font-semibold tracking-tight shrink-0">
              Digital Product Passport
            </a>
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <a href="/" className="hover:text-gray-900">Factories</a>
              <a href="/actors" className="hover:text-gray-900">Actors</a>
              <a href="/dashboard" className="hover:text-gray-900">Dashboard</a>
              <a href="/register" className="hover:text-gray-900">Register</a>
            </div>
            <SessionBar />
          </nav>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  )
}
