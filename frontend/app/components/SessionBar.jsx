'use client'

import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { getStoredActor, loginWithWallet, clearStoredToken } from '../../lib/api'

export default function SessionBar() {
  const [address, setAddress] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Check if we already have a session
    const actor = getStoredActor()
    if (actor && actor.did.startsWith('did:ethr:')) {
      setAddress(actor.did.split(':').pop())
    }
    
    // Listen for account changes
    const onAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        handleLogout()
      } else if (address && accounts[0].toLowerCase() !== address.toLowerCase()) {
        handleLogout() // Force re-login on account switch
      }
    }

    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', onAccountsChanged)
    }

    return () => {
      if (typeof window !== 'undefined' && window.ethereum) {
        window.ethereum.removeListener('accountsChanged', onAccountsChanged)
      }
    }
  }, [address])

  async function handleLogin() {
    if (typeof window === 'undefined' || !window.ethereum) {
      setError('MetaMask not installed!')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      // 1. Connect to MetaMask
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const userAddress = await signer.getAddress()
      const network = await provider.getNetwork()

      // 2. Sign backend challenge and exchange for bearer token.
      await loginWithWallet(signer, Number(network.chainId || 80002))
      
      setAddress(userAddress)
      window.location.reload()
    } catch (err) {
      console.error(err)
      if (err.code === 4001) {
        setError('User rejected connection')
      } else {
        setError(err.response?.data?.detail || 'Web3 Auth failed')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    clearStoredToken()
    setAddress(null)
    window.location.reload()
  }

  if (address) {
    return (
      <div className="flex items-center gap-2 text-xs min-w-0">
        <div className="flex items-center gap-2 bg-slate-900/70 border border-slate-700/80 rounded-full pl-3 pr-1 py-1 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="font-mono text-emerald-300 font-medium truncate max-w-32 md:max-w-44">
            {address.substring(0, 6)}...{address.substring(38)}
          </span>
          <button
            onClick={handleLogout}
            className="ml-1 text-slate-300 hover:text-white bg-slate-800/90 rounded-full px-3 py-1 hover:bg-slate-700 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      {error && <span className="text-red-400 text-xs font-medium">{error}</span>}
      <button
        onClick={handleLogin}
        disabled={loading}
        className="flex items-center gap-2 text-sm primary-gradient-bg text-white rounded-full px-4 md:px-5 py-2 hover:shadow-lg transition-all font-semibold disabled:opacity-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none">
          <path d="M29.6 12L20.8 19.3L27.4 29.5L16.2 24L5 29.4L11.5 19.3L2.8 12.1L14 10.6L16.3 1L18.6 10.6L29.6 12Z" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {loading ? 'Connecting...' : 'Connect MetaMask'}
      </button>
    </div>
  )
}