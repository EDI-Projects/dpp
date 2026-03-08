'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import api, { getStoredActor } from '../../../lib/api'

export default function IssuePage() {
  const { os_id } = useParams()
  const [factory, setFactory] = useState(null)
  const [actor, setActor] = useState(null)
  const [credential, setCredential] = useState(null)
  const [loading, setLoading] = useState(true)
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { setActor(getStoredActor()) }, [])

  useEffect(() => {
    api.get(`/factories/${os_id}`)
      .then(r => setFactory(r.data))
      .catch(() => setError('Factory not found.'))
      .finally(() => setLoading(false))
  }, [os_id])

  async function issueCredential() {
    setIssuing(true)
    setError(null)
    try {
      const r = await api.post(`/issue-birth-certificate/${os_id}`)
      setCredential(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to issue credential.')
    } finally {
      setIssuing(false)
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>
  if (error && !factory) return <p className="text-red-600">{error}</p>

  return (
    <div className="max-w-2xl">
      <a href="/" className="text-sm text-blue-600 hover:underline mb-4 inline-block">&larr; Back to factories</a>

      <h1 className="text-2xl font-semibold mb-1">Issue Birth Certificate</h1>
      {factory && (
        <p className="text-gray-500 text-sm mb-6">{factory.name} &mdash; {factory.address}</p>
      )}

      {!actor && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-800">
          You must sign in before issuing credentials. Use the <strong>Sign in</strong> selector in the header.
        </div>
      )}

      {factory && !credential && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">ID</dt>
            <dd className="font-mono text-xs">{factory.os_id}</dd>
            <dt className="text-gray-500">Category</dt>
            <dd>{factory.product_category}</dd>
            <dt className="text-gray-500">Sector</dt>
            <dd>{factory.sector}</dd>
            <dt className="text-gray-500">Workers</dt>
            <dd>{factory.number_of_workers ?? 'N/A'}</dd>
            <dt className="text-gray-500">Status</dt>
            <dd>{factory.is_closed ? 'Closed' : 'Active'}</dd>
            <dt className="text-gray-500">Country</dt>
            <dd>{factory.country_name || factory.country_code}</dd>
          </dl>
          <button
            onClick={issueCredential}
            disabled={issuing || !actor}
            className="mt-5 w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {issuing ? 'Issuing...' : !actor ? 'Sign in to issue' : 'Issue W3C Verifiable Credential'}
          </button>
          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        </div>
      )}

      {credential && (
        <div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <p className="text-green-800 font-medium text-sm">Birth certificate issued successfully.</p>
            <p className="text-green-700 text-xs mt-1">
              Product ID: <span className="font-mono">{credential.product_id}</span>
            </p>
          </div>

          <div className="flex gap-3 mb-4">
            <a
              href={`/product/${credential.product_id}`}
              className="text-sm bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 transition-colors"
            >
              View Lifecycle
            </a>
            <a
              href={`/verify/${credential.product_id}`}
              className="text-sm bg-white border border-gray-300 text-gray-700 rounded px-4 py-2 hover:bg-gray-50 transition-colors"
            >
              Verify Credential
            </a>
            <button
              onClick={() => { setCredential(null); setError(null) }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Issue another
            </button>
          </div>

          <details className="bg-white border border-gray-200 rounded-lg">
            <summary className="px-4 py-3 text-sm font-medium cursor-pointer select-none">
              Raw Verifiable Credential (JSON-LD)
            </summary>
            <pre className="px-4 pb-4 text-xs overflow-auto text-gray-700 whitespace-pre-wrap">
              {JSON.stringify(credential.credential, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
