'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  function handleSearch(e) {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/explorer?id=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col pt-16">
      <div className="max-w-5xl mx-auto px-6 w-full flex-1">
        
        {/* Hero Section */}
        <div className="text-center mb-16 animate-fade-in stagger-1">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold mb-8 animate-pulse-glow">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            ERC-1155 COMPOSITION LIVE ON AMOY TESTNET
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 text-white leading-tight">
            Verifiable Supply Chain <br/>
            <span className="gradient-text">Composition Protocol</span>
          </h1>
          
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Move beyond flat timelines. We map complex supply chains into an on-chain Directed Acyclic Graph (DAG) using ERC-1155 tokens, proving material lineage from extraction to final product.
          </p>
          
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex items-center glass rounded-xl p-2 gap-2">
              <div className="pl-4 text-slate-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Enter Product URN (e.g. urn:product:1234...)"
                className="flex-1 bg-transparent border-none text-white focus:ring-0 text-lg placeholder-slate-500 outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="btn-primary py-3 px-6 text-lg">
                Trace Origin
              </button>
            </div>
          </form>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-20 animate-fade-in-up stagger-2">
          <div className="glass-card p-6 border-t-blue-500/30 rounded-2xl">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Token Composability</h3>
            <p className="text-sm text-slate-400">Products are minted by provably burning raw material tokens on Polygon via the ERC-1155 Assembly Manager.</p>
          </div>
          
          <div className="glass-card p-6 border-t-purple-500/30 rounded-2xl">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">VC Inheritance</h3>
            <p className="text-sm text-slate-400">Final products mathematically inherit the ESG credentials (W3C VCs) of their consumed raw materials.</p>
          </div>
          
          <div className="glass-card p-6 border-t-emerald-500/30 rounded-2xl">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Immutable DAG</h3>
            <p className="text-sm text-slate-400">Query the entire material lineage tree as a Directed Acyclic Graph, enforced by the blockchain consensus.</p>
          </div>
        </div>

        {/* Abstract Visualization */}
        <div className="relative h-64 w-full flex items-center justify-center animate-fade-in-up stagger-3">
          <svg className="w-full h-full max-w-3xl opacity-60" viewBox="0 0 600 200">
            {/* Define Gradients */}
            <defs>
              <linearGradient id="edge1" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="edge2" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Edges */}
            <path d="M 100 50 Q 250 50 300 100" fill="none" stroke="url(#edge1)" strokeWidth="3" className="dag-line" style={{animation: 'dash 3s linear infinite reverse'}} strokeDasharray="10 5" />
            <path d="M 100 150 Q 250 150 300 100" fill="none" stroke="url(#edge1)" strokeWidth="3" className="dag-line" style={{animation: 'dash 3s linear infinite reverse'}} strokeDasharray="10 5" />
            <path d="M 300 100 Q 450 100 500 100" fill="none" stroke="url(#edge2)" strokeWidth="4" className="dag-line" style={{animation: 'dash 2s linear infinite reverse'}} strokeDasharray="15 8" />

            {/* Nodes */}
            <circle cx="100" cy="50" r="15" fill="#1e293b" stroke="#3b82f6" strokeWidth="3" className="animate-pulse-glow" />
            <text x="100" y="85" fill="#94a3b8" fontSize="12" textAnchor="middle" fontFamily="monospace">Cotton</text>
            
            <circle cx="100" cy="150" r="15" fill="#1e293b" stroke="#3b82f6" strokeWidth="3" className="animate-pulse-glow" />
            <text x="100" y="185" fill="#94a3b8" fontSize="12" textAnchor="middle" fontFamily="monospace">Dye</text>

            <circle cx="300" cy="100" r="20" fill="#1e293b" stroke="#8b5cf6" strokeWidth="4" className="animate-float" />
            <text x="300" y="140" fill="#cbd5e1" fontSize="14" textAnchor="middle" fontWeight="bold">Fabric</text>
            
            <circle cx="500" cy="100" r="25" fill="#1e293b" stroke="#10b981" strokeWidth="4" className="animate-pulse-glow" />
            <text x="500" y="145" fill="#f8fafc" fontSize="16" textAnchor="middle" fontWeight="bold">T-Shirt</text>
            
            <text x="200" y="40" fill="#3b82f6" fontSize="10" fontWeight="bold" opacity="0.8">BURN</text>
            <text x="200" y="140" fill="#3b82f6" fontSize="10" fontWeight="bold" opacity="0.8">BURN</text>
            <text x="400" y="90" fill="#8b5cf6" fontSize="10" fontWeight="bold" opacity="0.8">MINT</text>
          </svg>
        </div>

      </div>
    </div>
  )
}
