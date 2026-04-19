'use client'

import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import api, { getStoredActor, setStoredToken, clearStoredToken } from '../../lib/api'

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
    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          handleLogout()
        } else if (address && accounts[0].toLowerCase() !== address.toLowerCase()) {
          handleLogout() // Force re-login on account switch
        }
      })
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
      
      const did = `did:ethr:${userAddress}`
      
      // 2. Request SIWE Challenge (or just auth implicitly for demo)
      // Since changing backend extensively for SIWE is Phase 1b, we'll hit an endpoint
      // that registers/authenticates the Web3 address directly for now.
      const res = await api.post('/auth/metamask', { address: userAddress })
      
      setStoredToken(res.data.access_token, {
        did: did,
        name: `${userAddress.substring(0, 6)}...${userAddress.substring(38)}`,
        role: 'tier2_factory', // Default
        tier: 2
      })
      
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
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-full pl-3 pr-1 py-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="font-mono text-emerald-400 font-medium">
            {address.substring(0, 6)}...{address.substring(38)}
          </span>
          <button
            onClick={handleLogout}
            className="ml-2 text-slate-400 hover:text-white bg-slate-900 rounded-full px-3 py-1 hover:bg-slate-700 transition-colors"
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
        className="flex items-center gap-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-full px-5 py-2 hover:shadow-lg transition-all font-semibold disabled:opacity-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none">
          <path d="M29.6 12L20.8 19.3L27.4 29.5L16.2 24L5 29.4L11.5 19.3L2.8 12.1L14 10.6L16.3 1L18.6 10.6L29.6 12Z" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {loading ? 'Connecting...' : 'Connect MetaMask'}
      </button>
    </div>
  )
}