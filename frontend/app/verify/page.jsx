'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function VerifyIndex() {
  const [productId, setProductId] = useState('')
  const router = useRouter()

  function handle(e) {
    e.preventDefault()
    const id = productId.trim()
    if (id) router.push(`/verify/${id}`)
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold mb-1">Verify a Passport</h1>
      <p className="text-gray-500 text-sm mb-6">
        Enter a product ID to audit its credential chain.
      </p>
      <form onSubmit={handle} className="flex gap-2">
        <input
          type="text"
          placeholder="Product ID..."
          value={productId}
          onChange={e => setProductId(e.target.value)}
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 transition-colors"
        >
          Verify
        </button>
      </form>
    </div>
  )
}
