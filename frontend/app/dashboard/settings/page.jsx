'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api, { getStoredActor, clearStoredToken } from '../../../lib/api'

export default function SettingsPage() {
  const router = useRouter()
  const [actor, setActor]         = useState(null)
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied]       = useState(false)

  useEffect(() => {
    const stored = getStoredActor()
    if (!stored) { router.push('/login'); return }
    setActor(stored)
  }, [])

  async function handleRotate() {
    if (!confirmed) { setError('Please confirm by checking the box above.'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await api.post(`/actors/${encodeURIComponent(actor.did)}/rotate-key`)
      setResult(res.data)
      // All tokens invalidated — clear local storage
      clearStoredToken()
    } catch (err) {
      setError(err.response?.data?.detail || 'Key rotation failed.')
    } finally {
      setLoading(false)
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(result.new_private_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-lg">
      <a href="/dashboard" className="text-sm text-blue-600 hover:underline mb-4 inline-block">← Dashboard</a>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      {actor && <p className="text-sm text-gray-500 mb-8">{actor.name} · {actor.did}</p>}

      {/* Current key info */}
      {actor && !result && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Current Signing Key</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Public key (safe to share)</p>
              <p className="font-mono text-xs text-gray-700 bg-gray-50 rounded-lg p-3 break-all border border-gray-200">
                {actor.public_key}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">DID</p>
              <p className="font-mono text-xs text-gray-600 break-all">{actor.did}</p>
            </div>
          </div>
        </div>
      )}

      {/* Key rotation form */}
      {!result ? (
        <div className="bg-white border border-orange-200 rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 mb-2">Rotate Keypair</h2>
          <p className="text-sm text-gray-500 mb-4">
            Generates a new Ed25519 keypair. Your existing credentials remain valid — they were signed with your current key.
            All active sessions will be invalidated and you will need to sign in again.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">Before you rotate:</p>
            <ul className="space-y-1 text-xs">
              <li>• Save your new private key immediately — it is shown only once</li>
              <li>• You will be signed out of all devices</li>
              <li>• New credentials will use the rotated key</li>
              <li>• Old credentials (signed with the old key) remain valid</li>
            </ul>
          </div>

          <label className="flex items-start gap-3 mb-5 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 accent-orange-600"
            />
            <span className="text-sm text-gray-700">
              I understand that this will invalidate all active sessions and I will need to save the new private key.
            </span>
          </label>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>}

          <button
            onClick={handleRotate}
            disabled={loading || !confirmed}
            className="w-full bg-orange-600 text-white rounded-xl py-3 font-medium hover:bg-orange-700 disabled:opacity-40 transition-colors"
          >
            {loading ? 'Rotating…' : 'Rotate keypair'}
          </button>
        </div>
      ) : (
        /* Success */
        <div className="bg-white border border-green-200 rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <h2 className="font-bold text-lg text-gray-900">Key rotated successfully</h2>
            <p className="text-sm text-gray-500 mt-1">{result.note}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">New public key</p>
            <p className="font-mono text-xs bg-gray-50 rounded-lg p-3 break-all border border-gray-200 text-gray-700">
              {result.new_public_key}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-700 mb-1">New private key (save now — shown once)</p>
            <p className="font-mono text-xs bg-amber-50 rounded-lg p-3 break-all border border-amber-200 text-gray-700 mb-2">
              {result.new_private_key}
            </p>
            <button onClick={copyKey}
              className="w-full bg-amber-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-700 transition-colors">
              {copied ? '✓ Copied!' : 'Copy private key'}
            </button>
          </div>
          <a href="/login"
            className="block w-full bg-blue-600 text-white rounded-xl py-3 font-medium text-center hover:bg-blue-700 transition-colors">
            Sign in with new key →
          </a>
        </div>
      )}
    </div>
  )
}
