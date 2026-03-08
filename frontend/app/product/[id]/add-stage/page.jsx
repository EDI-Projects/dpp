'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api, { getStoredActor } from '../../../../lib/api'

const STAGE_TYPES = [
  'Material Sourcing',
  'Certification',
  'Custody Transfer',
  'Ownership',
  'Repair',
  'End of Life',
]

const DEFAULT_ISSUERS = {
  'Material Sourcing':  'did:dpp:supplier-rawmat',
  'Certification':      'did:dpp:certifier-intertek',
  'Custody Transfer':   'did:dpp:logistics-dhl',
  'Ownership':          null,
  'Repair':             null,
  'End of Life':        'did:dpp:recycler-veolia',
}

const ENDPOINT_MAP = {
  'Material Sourcing':  'material-sourcing',
  'Certification':      'certification',
  'Custody Transfer':   'custody-transfer',
  'Ownership':          'ownership',
  'Repair':             'repair',
  'End of Life':        'end-of-life',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Input({ name, value, onChange, type = 'text', disabled }) {
  return (
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
    />
  )
}

function Select({ name, value, onChange, options }) {
  return (
    <select
      name={name}
      value={value}
      onChange={onChange}
      className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function MaterialSourcingForm({ productId, form, setForm, suggestions }) {
  return (
    <div className="space-y-3">
      <Field label="Raw Material ID">
        <Select
          name="raw_material_id"
          value={form.raw_material_id || ''}
          onChange={e => {
            const sel = suggestions.find(s => s.raw_material_id === e.target.value)
            if (sel) {
              setForm(f => ({
                ...f,
                raw_material_id:       sel.raw_material_id,
                raw_material:          sel.description,
                supplier:              sel.supplier,
                supplier_location:     sel.supplier_location,
                cost_per_unit:         sel.cost_per_unit,
                certification_standard: sel.certification || '',
              }))
            } else {
              setForm(f => ({ ...f, raw_material_id: e.target.value }))
            }
          }}
          options={[
            { value: '', label: '— select or type below —' },
            ...suggestions.map(s => ({ value: s.raw_material_id, label: `${s.raw_material_id} · ${s.description}` }))
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Raw Material">
          <Input name="raw_material" value={form.raw_material || ''} onChange={e => setForm(f => ({ ...f, raw_material: e.target.value }))} />
        </Field>
        <Field label="Material Grade">
          <Input name="material_grade" value={form.material_grade || ''} onChange={e => setForm(f => ({ ...f, material_grade: e.target.value }))} />
        </Field>
        <Field label="Supplier">
          <Input name="supplier" value={form.supplier || ''} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
        </Field>
        <Field label="Supplier Location">
          <Input name="supplier_location" value={form.supplier_location || ''} onChange={e => setForm(f => ({ ...f, supplier_location: e.target.value }))} />
        </Field>
        <Field label="Cost per Unit">
          <Input name="cost_per_unit" value={form.cost_per_unit || ''} onChange={e => setForm(f => ({ ...f, cost_per_unit: e.target.value }))} />
        </Field>
        <Field label="Quantity (kg)">
          <Input name="quantity_kg" type="number" value={form.quantity_kg || ''} onChange={e => setForm(f => ({ ...f, quantity_kg: e.target.value }))} />
        </Field>
        <Field label="Origin Country">
          <Input name="origin_country" value={form.origin_country || ''} onChange={e => setForm(f => ({ ...f, origin_country: e.target.value }))} />
        </Field>
        <Field label="Origin Region">
          <Input name="origin_region" value={form.origin_region || ''} onChange={e => setForm(f => ({ ...f, origin_region: e.target.value }))} />
        </Field>
        <Field label="Harvest Date">
          <Input name="harvest_date" type="date" value={form.harvest_date || today()} onChange={e => setForm(f => ({ ...f, harvest_date: e.target.value }))} />
        </Field>
        <Field label="Sourcing Date">
          <Input name="sourcing_date" type="date" value={form.sourcing_date || today()} onChange={e => setForm(f => ({ ...f, sourcing_date: e.target.value }))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Certification Standard">
          <Input name="certification_standard" value={form.certification_standard || ''} onChange={e => setForm(f => ({ ...f, certification_standard: e.target.value }))} />
        </Field>
        <Field label="Certified">
          <Select
            name="certified"
            value={form.certified ?? 'true'}
            onChange={e => setForm(f => ({ ...f, certified: e.target.value }))}
            options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
          />
        </Field>
        <Field label="Certifying Body">
          <Input name="certifying_body" value={form.certifying_body || ''} onChange={e => setForm(f => ({ ...f, certifying_body: e.target.value }))} />
        </Field>
        <Field label="Farm Name">
          <Input name="farm_name" value={form.farm_name || ''} onChange={e => setForm(f => ({ ...f, farm_name: e.target.value }))} />
        </Field>
      </div>
      <Field label="Issuer DID">
        <Input name="issuer_did" value={form.issuer_did || DEFAULT_ISSUERS['Material Sourcing']} onChange={e => setForm(f => ({ ...f, issuer_did: e.target.value }))} />
      </Field>
    </div>
  )
}

function CertificationForm({ form, setForm }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Certifying Body">
          <Input name="certifying_body" value={form.certifying_body || ''} onChange={e => setForm(f => ({ ...f, certifying_body: e.target.value }))} />
        </Field>
        <Field label="Certification Standard">
          <Input name="certification_standard" value={form.certification_standard || ''} onChange={e => setForm(f => ({ ...f, certification_standard: e.target.value }))} />
        </Field>
        <Field label="Audit Date">
          <Input name="audit_date" type="date" value={form.audit_date || today()} onChange={e => setForm(f => ({ ...f, audit_date: e.target.value }))} />
        </Field>
        <Field label="Expiry Date">
          <Input name="expiry_date" type="date" value={form.expiry_date || ''} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
        </Field>
        <Field label="Audit Result">
          <Select
            name="audit_result"
            value={form.audit_result || 'pass'}
            onChange={e => setForm(f => ({ ...f, audit_result: e.target.value }))}
            options={[{ value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }, { value: 'conditional', label: 'Conditional' }]}
          />
        </Field>
        <Field label="Scope">
          <Input name="scope" value={form.scope || ''} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} />
        </Field>
      </div>
      <Field label="Issuer DID">
        <Input name="issuer_did" value={form.issuer_did || DEFAULT_ISSUERS['Certification']} onChange={e => setForm(f => ({ ...f, issuer_did: e.target.value }))} />
      </Field>
    </div>
  )
}

function CustodyTransferForm({ form, setForm }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Transfer Type">
          <Select
            name="transfer_type"
            value={form.transfer_type || 'logistics'}
            onChange={e => setForm(f => ({ ...f, transfer_type: e.target.value }))}
            options={[
              { value: 'logistics', label: 'Logistics' },
              { value: 'sale', label: 'Sale' },
              { value: 'return', label: 'Return' },
              { value: 'export', label: 'Export' },
            ]}
          />
        </Field>
        <Field label="Handover Date">
          <Input name="handover_date" type="date" value={form.handover_date || today()} onChange={e => setForm(f => ({ ...f, handover_date: e.target.value }))} />
        </Field>
        <Field label="From Actor">
          <Input name="from_actor_name" value={form.from_actor_name || ''} onChange={e => setForm(f => ({ ...f, from_actor_name: e.target.value }))} />
        </Field>
        <Field label="From City">
          <Input name="from_city" value={form.from_city || ''} onChange={e => setForm(f => ({ ...f, from_city: e.target.value }))} />
        </Field>
        <Field label="To Actor">
          <Input name="to_actor_name" value={form.to_actor_name || ''} onChange={e => setForm(f => ({ ...f, to_actor_name: e.target.value }))} />
        </Field>
        <Field label="To City">
          <Input name="to_city" value={form.to_city || ''} onChange={e => setForm(f => ({ ...f, to_city: e.target.value }))} />
        </Field>
        <Field label="Transport Mode">
          <Select
            name="transport_mode"
            value={form.transport_mode || 'road'}
            onChange={e => setForm(f => ({ ...f, transport_mode: e.target.value }))}
            options={[
              { value: 'road', label: 'Road' },
              { value: 'sea', label: 'Sea' },
              { value: 'air', label: 'Air' },
              { value: 'rail', label: 'Rail' },
            ]}
          />
        </Field>
        <Field label="Carrier Name">
          <Input name="carrier_name" value={form.carrier_name || ''} onChange={e => setForm(f => ({ ...f, carrier_name: e.target.value }))} />
        </Field>
        <Field label="Distance (km)">
          <Input name="distance_km" type="number" value={form.distance_km || ''} onChange={e => setForm(f => ({ ...f, distance_km: e.target.value }))} />
        </Field>
        <Field label="Carbon Emissions (kg)">
          <Input name="carbon_emissions_kg" type="number" value={form.carbon_emissions_kg || ''} onChange={e => setForm(f => ({ ...f, carbon_emissions_kg: e.target.value }))} />
        </Field>
        <Field label="Condition on Arrival">
          <Select
            name="condition_on_arrival"
            value={form.condition_on_arrival || 'good'}
            onChange={e => setForm(f => ({ ...f, condition_on_arrival: e.target.value }))}
            options={[
              { value: 'good', label: 'Good' },
              { value: 'damaged', label: 'Damaged' },
              { value: 'partial', label: 'Partial' },
            ]}
          />
        </Field>
      </div>
      <Field label="Issuer DID">
        <Input name="issuer_did" value={form.issuer_did || DEFAULT_ISSUERS['Custody Transfer']} onChange={e => setForm(f => ({ ...f, issuer_did: e.target.value }))} />
      </Field>
    </div>
  )
}

function OwnershipForm({ form, setForm }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Owner Type">
          <Select
            name="owner_type"
            value={form.owner_type || 'individual'}
            onChange={e => setForm(f => ({ ...f, owner_type: e.target.value }))}
            options={[
              { value: 'individual', label: 'Individual' },
              { value: 'business', label: 'Business' },
              { value: 'government', label: 'Government' },
            ]}
          />
        </Field>
        <Field label="Ownership Start">
          <Input name="ownership_start" type="date" value={form.ownership_start || today()} onChange={e => setForm(f => ({ ...f, ownership_start: e.target.value }))} />
        </Field>
        <Field label="Country of Use">
          <Input name="country_of_use" value={form.country_of_use || ''} onChange={e => setForm(f => ({ ...f, country_of_use: e.target.value }))} />
        </Field>
        <Field label="Still In Use">
          <Select
            name="product_still_in_use"
            value={form.product_still_in_use ?? 'true'}
            onChange={e => setForm(f => ({ ...f, product_still_in_use: e.target.value }))}
            options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
          />
        </Field>
      </div>
      <Field label="Issuer DID (optional)">
        <Input name="issuer_did" value={form.issuer_did || ''} onChange={e => setForm(f => ({ ...f, issuer_did: e.target.value }))} />
      </Field>
    </div>
  )
}

function RepairForm({ form, setForm }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Service Type">
          <Select
            name="service_type"
            value={form.service_type || 'repair'}
            onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))}
            options={[
              { value: 'repair', label: 'Repair' },
              { value: 'maintenance', label: 'Maintenance' },
              { value: 'upgrade', label: 'Upgrade' },
              { value: 'inspection', label: 'Inspection' },
            ]}
          />
        </Field>
        <Field label="Service Date">
          <Input name="service_date" type="date" value={form.service_date || today()} onChange={e => setForm(f => ({ ...f, service_date: e.target.value }))} />
        </Field>
        <Field label="Service Provider">
          <Input name="service_provider" value={form.service_provider || ''} onChange={e => setForm(f => ({ ...f, service_provider: e.target.value }))} />
        </Field>
        <Field label="Condition Before">
          <Select
            name="item_condition_before"
            value={form.item_condition_before || 'fair'}
            onChange={e => setForm(f => ({ ...f, item_condition_before: e.target.value }))}
            options={[
              { value: 'good', label: 'Good' },
              { value: 'fair', label: 'Fair' },
              { value: 'poor', label: 'Poor' },
            ]}
          />
        </Field>
        <Field label="Condition After">
          <Select
            name="item_condition_after"
            value={form.item_condition_after || 'good'}
            onChange={e => setForm(f => ({ ...f, item_condition_after: e.target.value }))}
            options={[
              { value: 'good', label: 'Good' },
              { value: 'fair', label: 'Fair' },
              { value: 'poor', label: 'Poor' },
            ]}
          />
        </Field>
        <Field label="Right to Repair Compliant">
          <Select
            name="right_to_repair_compliant"
            value={form.right_to_repair_compliant ?? 'true'}
            onChange={e => setForm(f => ({ ...f, right_to_repair_compliant: e.target.value }))}
            options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
          />
        </Field>
      </div>
      <Field label="Repair Description">
        <textarea
          name="repair_description"
          value={form.repair_description || ''}
          onChange={e => setForm(f => ({ ...f, repair_description: e.target.value }))}
          rows={2}
          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </Field>
      <Field label="Issuer DID (optional)">
        <Input name="issuer_did" value={form.issuer_did || ''} onChange={e => setForm(f => ({ ...f, issuer_did: e.target.value }))} />
      </Field>
    </div>
  )
}

function EndOfLifeForm({ form, setForm }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="EOL Trigger">
          <Select
            name="eol_trigger"
            value={form.eol_trigger || 'end_of_use'}
            onChange={e => setForm(f => ({ ...f, eol_trigger: e.target.value }))}
            options={[
              { value: 'end_of_use', label: 'End of Use' },
              { value: 'damaged_beyond_repair', label: 'Damaged Beyond Repair' },
              { value: 'upgrade', label: 'Upgrade' },
              { value: 'regulatory', label: 'Regulatory' },
            ]}
          />
        </Field>
        <Field label="Collection Date">
          <Input name="collection_date" type="date" value={form.collection_date || today()} onChange={e => setForm(f => ({ ...f, collection_date: e.target.value }))} />
        </Field>
        <Field label="Processing Date">
          <Input name="processing_date" type="date" value={form.processing_date || today()} onChange={e => setForm(f => ({ ...f, processing_date: e.target.value }))} />
        </Field>
        <Field label="Collector Name">
          <Input name="collector_name" value={form.collector_name || ''} onChange={e => setForm(f => ({ ...f, collector_name: e.target.value }))} />
        </Field>
        <Field label="Recycler Name">
          <Input name="recycler_name" value={form.recycler_name || ''} onChange={e => setForm(f => ({ ...f, recycler_name: e.target.value }))} />
        </Field>
        <Field label="Recycler Country">
          <Input name="recycler_country" value={form.recycler_country || ''} onChange={e => setForm(f => ({ ...f, recycler_country: e.target.value }))} />
        </Field>
        <Field label="Recycling Method">
          <Select
            name="recycling_method"
            value={form.recycling_method || 'mechanical'}
            onChange={e => setForm(f => ({ ...f, recycling_method: e.target.value }))}
            options={[
              { value: 'mechanical', label: 'Mechanical' },
              { value: 'chemical', label: 'Chemical' },
              { value: 'thermal', label: 'Thermal' },
              { value: 'landfill', label: 'Landfill' },
            ]}
          />
        </Field>
        <Field label="Second Life Eligible">
          <Select
            name="second_life_eligible"
            value={form.second_life_eligible ?? 'false'}
            onChange={e => setForm(f => ({ ...f, second_life_eligible: e.target.value }))}
            options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
          />
        </Field>
        <Field label="EU ESPR Compliant">
          <Select
            name="eu_espr_compliant"
            value={form.eu_espr_compliant ?? 'true'}
            onChange={e => setForm(f => ({ ...f, eu_espr_compliant: e.target.value }))}
            options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
          />
        </Field>
      </div>
      <Field label="Issuer DID">
        <Input name="issuer_did" value={form.issuer_did || DEFAULT_ISSUERS['End of Life']} onChange={e => setForm(f => ({ ...f, issuer_did: e.target.value }))} />
      </Field>
    </div>
  )
}

export default function AddStagePage() {
  const { id } = useParams()
  const router = useRouter()
  const [actor, setActor] = useState(null)
  const [stageType, setStageType] = useState('Material Sourcing')
  const [form, setForm] = useState({})
  const [suggestions, setSuggestions] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Check auth on mount
  useEffect(() => { setActor(getStoredActor()) }, [])

  // Pre-populate issuer_did when stage type changes
  useEffect(() => {
    const defaultDid = DEFAULT_ISSUERS[stageType]
    setForm(f => ({ ...f, issuer_did: defaultDid || '' }))
  }, [stageType])

  // Fetch material suggestions from existing lifecycle data for the product
  useEffect(() => {
    if (stageType !== 'Material Sourcing') return
    // Try to get factory from lifecycle data, fall back to empty list
    api.get(`/product/${id}/lifecycle`)
      .then(r => {
        const lc = r.data?.lifecycle || []
        const birth = lc.find(e => e.stage === 'Birth Certificate')
        const osId = birth?.credential?.credentialSubject?.os_id
        if (osId) {
          return api.get(`/suggest-materials/${osId}`)
        }
        return null
      })
      .then(r => {
        if (r) setSuggestions(r.data.suggestions || [])
      })
      .catch(() => {})
  }, [id, stageType])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const endpoint = ENDPOINT_MAP[stageType]
    const payload = { product_id: id, ...form }

    // Coerce boolean strings
    for (const key of ['certified', 'product_still_in_use', 'right_to_repair_compliant', 'second_life_eligible', 'eu_espr_compliant']) {
      if (payload[key] === 'true') payload[key] = true
      if (payload[key] === 'false') payload[key] = false
    }
    // Coerce numbers
    for (const key of ['quantity_kg', 'distance_km', 'carbon_emissions_kg', 'transfer_sequence']) {
      if (payload[key] !== undefined && payload[key] !== '') payload[key] = Number(payload[key])
    }
    // Remove empty strings
    for (const key of Object.keys(payload)) {
      if (payload[key] === '') delete payload[key]
    }

    try {
      await api.post(`/add-lifecycle-stage/${endpoint}`, payload)
      router.push(`/product/${id}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add stage.')
      setSubmitting(false)
    }
  }

  const StageForm = {
    'Material Sourcing':  <MaterialSourcingForm productId={id} form={form} setForm={setForm} suggestions={suggestions} />,
    'Certification':      <CertificationForm form={form} setForm={setForm} />,
    'Custody Transfer':   <CustodyTransferForm form={form} setForm={setForm} />,
    'Ownership':          <OwnershipForm form={form} setForm={setForm} />,
    'Repair':             <RepairForm form={form} setForm={setForm} />,
    'End of Life':        <EndOfLifeForm form={form} setForm={setForm} />,
  }[stageType]

  return (
    <div className="max-w-2xl">
      <a href={`/product/${id}`} className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        &larr; Back to timeline
      </a>

      <h1 className="text-2xl font-semibold mb-1">Add Lifecycle Stage</h1>
      <p className="text-xs text-gray-400 font-mono mb-6">{id}</p>

      {!actor && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-800">
          You must sign in before issuing credentials. Use the <strong>Sign in</strong> selector in the header.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <Field label="Stage Type">
            <Select
              name="stage_type"
              value={stageType}
              onChange={e => { setStageType(e.target.value); setForm({}) }}
              options={STAGE_TYPES.map(s => ({ value: s, label: s }))}
            />
          </Field>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-medium text-sm mb-4">{stageType} Details</h2>
          {StageForm}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !actor}
            className="bg-blue-600 text-white text-sm rounded px-5 py-2 hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {submitting ? 'Issuing credential…' : !actor ? 'Sign in to issue' : 'Issue Credential'}
          </button>
          <a
            href={`/product/${id}`}
            className="text-sm text-gray-600 rounded px-5 py-2 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}
