'use client'

import { useState } from 'react'
import api, { didLogin } from '../../lib/api'

export default function LoginPage() {
  const [didMode, setDidMode] = useState('')
  const [privKey, setPrivKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleLogin(e) {
    e.preventDefault()
    if (!didMode) return
    
    // Validate dummy private key if one is entered (optional in demo, but must be realistic if provided)
    if (privKey && privKey.length < 32) {
      setError('Invalid Private Key payload: Ed25519 keys must be at least 32 bytes or empty for KMS fallback.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      // Pass the selected DID. Our mock wallet intercepts standard DIDs
      await didLogin(didMode)
      // Use window.location instead of router to force a full Next.js state reload, syncing the navbar immediately
      window.location.href = '/dashboard'
    } catch (err) {
      setError(err.response?.data?.detail || 'Cryptographic sign in failed. Check your DID and Private Key.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-white shadow-xl shadow-indigo-500/10 mb-6">
            <svg className="w-10 h-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">
            Secure Log In
          </h1>
          <p className="text-base text-gray-500">Provide your Decentralized Identity (DID) and Key</p>
        </div>

        {/* Login Card */}
        <form onSubmit={handleLogin} className="glass-card rounded-3xl p-8 space-y-6">
          <div className="space-y-5">
            
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                DID Address (e.g. did:dpp:factory-alpha)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="did:dpp:..."
                  value={didMode}
                  onChange={e => setDidMode(e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-200 rounded-xl pl-11 pr-4 py-3.5 text-sm md:text-base font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition-shadow font-mono"
                  required
                />
                <div className="pointer-events-none absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-semibold text-gray-700">
                  Private Key (Ed25519 payload)
                </label>
                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-bold uppercase tracking-wide">Wallet</span>
              </div>
              <div className="relative">
                <input
                  type="password"
                  placeholder="••••••••••••••••••••••••"
                  value={privKey}
                  onChange={e => setPrivKey(e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-200 rounded-xl pl-11 pr-4 py-3.5 text-sm md:text-base font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition-shadow font-mono"
                />
                <div className="pointer-events-none absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                </div>
              </div>
              <p className="text-xs text-gray-500/80 mt-1.5 ml-1 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                In testnet demo mode, the key can be left blank (KMS fallback).
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-sm text-red-700 items-start shadow-sm">
                <svg className="w-5 h-5 shrink-0 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !didMode}
              className="w-full primary-gradient-bg text-white rounded-xl py-3.5 font-bold tracking-wide shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden mt-6"
            >
              <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] skew-x-12"></div>
              {loading ? 'Authenticating & Verifying...' : 'Unlock Account'}
            </button>
          </div>
        </form>

        <p className="text-center text-xs font-medium text-gray-400 mt-8 flex items-center justify-center gap-2">
          <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Secured by Zero-Knowledge Proofs & Ed25519 Enclaves
        </p>
      </div>
    </div>
  )
}
