'use client'

import { useState } from 'react'
import { ethers } from 'ethers'
import { loginWithWallet } from '../../lib/api'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleWalletConnect() {
    if (typeof window === 'undefined' || !window.ethereum) {
      setError('MetaMask is required. Install the extension and try again.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const network = await provider.getNetwork()
      await loginWithWallet(signer, Number(network.chainId || 80002))
      window.location.href = '/console'
    } catch (err) {
      if (err.code === 4001) {
        setError('Wallet signature was rejected.')
      } else {
        setError(err.response?.data?.detail || 'Wallet authentication failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-white shadow-xl shadow-indigo-500/10 mb-6">
            <svg className="w-10 h-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">
            Sign In With Wallet
          </h1>
          <p className="text-base text-gray-500">Authenticate with MetaMask. Your wallet address becomes your DID.</p>
        </div>

        <div className="glass-card rounded-3xl p-8 space-y-6">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm text-indigo-700">
            The platform now uses wallet signatures only. No password, no manually-managed private key fields.
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-sm text-red-700 items-start shadow-sm">
              <svg className="w-5 h-5 shrink-0 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleWalletConnect}
            disabled={loading}
            className="w-full primary-gradient-bg text-white rounded-xl py-3.5 font-bold tracking-wide shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden mt-2"
          >
            <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] skew-x-12"></div>
            {loading ? 'Awaiting Wallet Signature...' : 'Connect MetaMask'}
          </button>
        </div>

        <p className="text-center text-xs font-medium text-gray-400 mt-8 flex items-center justify-center gap-2">
          <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Authenticated via ECDSA wallet signatures (SIWE style)
        </p>
      </div>
    </div>
  )
}
