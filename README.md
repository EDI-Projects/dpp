# Digital Product Passport — Verifiable Credentials

A full-stack Digital Product Passport (DPP) system built on the W3C Verifiable Credentials standard, targeting EU ESPR/2024 compliance for textiles and batteries. Each product accumulates cryptographically signed credentials at every lifecycle stage — issued by the actual supply-chain stakeholders, not a central authority.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                   │
│                                                          │
│  Factories ── Factory Detail ── Issue Cert               │
│       │              │                                   │
│  Product Timeline ── Add Stage ── Verify Chain           │
│       │                               │                  │
│  Actors Registry             Revoke Credential           │
│                                                          │
│  SessionBar: actor selector + Bearer token storage       │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP / JSON
┌────────────────────▼────────────────────────────────────┐
│                  FastAPI Backend                          │
│                                                          │
│  actors.py       — Tier 0/1/2 DID registry, Ed25519     │
│  status_list.py  — StatusList2021 bitstring revocation   │
│  models.py       — Pydantic lifecycle models             │
│  main.py         — All endpoints, VC issuance, 4-check   │
│                    chain validation                       │
└────────────────────┬────────────────────────────────────┘
                     │ Pandas
┌────────────────────▼────────────────────────────────────┐
│                  CSV Data Layer                           │
│                                                          │
│  factory_data.csv          — Open Supply Hub factories   │
│  MOCK_DATA (3).csv         — Raw material catalogue      │
│  Manufacturing Dataset.csv — Production context stats    │
└─────────────────────────────────────────────────────────┘
```

### Trust Tier Model

| Tier | Role | Who | Can Issue |
|---|---|---|---|
| 0 | Root Authority | `did:dpp:root-authority` | Anything |
| 1 | Verified Third Party | Certifiers, Recyclers, Regulators | Type-specific |
| 2 | Dataset-Anchored | Factories (os_id), Suppliers, Logistics | Type-specific |

All actors hold real **Ed25519** keypairs (generated at startup in demo; HSM-backed in production). Signatures are verified on every `/verify` call.

### Credential Flow

```
Factory → ProductBirthCertificate
  └── Supplier    → MaterialSourcingCredential
  └── Certifier   → CertificationCredential
  └── Logistics   → CustodyTransferCredential (×n)
  └── (consumer)  → OwnershipCredential
  └── (repairer)  → RepairCredential
  └── Recycler    → EndOfLifeCredential
```

Every credential carries:
- Real Ed25519 JWS signature
- `credentialStatus` (StatusList2021 revocation index)
- `trustSignals` — per-field provenance (csv-verified / inferred / manual)
- `issuerMetadata` — tier, role, approved_by

---

## What's Implemented

### Backend (`backend/`)

**Cryptographic signing**
- Real Ed25519 signing via the `cryptography` library (no mocks)
- JWS signature embedded in every VC proof block
- Signature verification on all `/verify` calls

**Actor registry** (`actors.py`)
- 7 bootstrapped actors across all 3 tiers
- Role-based permission system (`ROLE_PERMISSIONS` map)
- DIDAuth flow: `POST /auth/challenge` → `POST /auth/sign` (demo wallet) → `POST /auth/verify` → Bearer token

**StatusList2021 revocation** (`status_list.py`)
- GZIP-compressed bitstring, base64url encoded
- Per-credential status index allocated at issuance
- `POST /credentials/{id}/revoke` — sets bit, verified on every chain check

**4-check chain validation** (every write endpoint)
1. Birth Certificate existence
2. Revocation — any revoked credential in chain blocks new additions
3. Temporal ordering — new stage date ≥ last stage date
4. Issuer role — DID must be authorised for the VC type being issued

**Dataset bridge** — Birth Certificate enriched from all 3 CSV sources:
- Factory fields (sector, product_type, workers, address)
- Material suggestions (matched by product category)
- Production statistics (output/year, defect rate, lead time)

**API endpoints** (all with interactive docs at `/docs`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/factories` | — | List factories (paginated, search, filter) |
| GET | `/factories/{os_id}` | — | Factory detail |
| GET | `/factories/{os_id}/products` | — | All credentials issued by this factory |
| GET | `/suggest-materials/{os_id}` | — | Raw material suggestions for factory |
| GET | `/production-stats/{os_id}` | — | Production context from dataset |
| POST | `/issue-birth-certificate/{os_id}` | ✓ | Issue W3C VC Birth Certificate |
| POST | `/add-lifecycle-stage/material-sourcing` | ✓ | Material sourcing credential |
| POST | `/add-lifecycle-stage/certification` | ✓ | Certification credential |
| POST | `/add-lifecycle-stage/custody-transfer` | ✓ | Custody transfer credential |
| POST | `/add-lifecycle-stage/ownership` | ✓ | Ownership credential |
| POST | `/add-lifecycle-stage/repair` | ✓ | Repair / service credential |
| POST | `/add-lifecycle-stage/end-of-life` | ✓ | End-of-life credential |
| GET | `/product/{id}/lifecycle` | — | Full lifecycle timeline |
| GET | `/product/{id}/verify` | — | 5-check verification of all credentials |
| GET | `/status-list` | — | StatusList2021 encoded bitstring |
| GET | `/status-list/entries` | — | All allocated status entries |
| GET | `/credentials/{id}/status` | — | Single credential revocation status |
| POST | `/credentials/{id}/revoke` | ✓ | Revoke a credential |
| GET | `/actors` | — | Actor registry |
| GET | `/actors/{did}` | — | Single actor detail |
| POST | `/auth/challenge` | — | Request an Ed25519 challenge nonce |
| POST | `/auth/sign` | — | Sign challenge with actor key (demo wallet) |
| POST | `/auth/verify` | — | Verify signature and receive Bearer token |

### Frontend (`frontend/`)

Built with **Next.js App Router**, Tailwind CSS, Axios. All pages are server-rendered client components.

| Page | Route | Description |
|---|---|---|
| Factory browser | `/` | Search + filter all factories by name/country/sector |
| Factory detail | `/factory/[os_id]` | Facility info, material suggestions, issued products table |
| Issue certificate | `/issue/[os_id]` | One-click Birth Certificate issuance |
| Lifecycle timeline | `/product/[id]` | Chronological VC card list, raw JSON expand |
| Add stage | `/product/[id]/add-stage` | Form for all 6 stage types with smart defaults |
| Verify chain | `/verify/[id]` | 5-check result per credential, tier badges, trust signals, revoke button |
| Verify lookup | `/verify` | Product ID input |
| Actor registry | `/actors` | All registered actors with tier/role badges, public key |
| Session bar | (header) | Actor dropdown + sign in/out on every page |

---

## Credential Structure

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://dpp.example.org/contexts/v1"
  ],
  "type": ["VerifiableCredential", "ProductBirthCertificate"],
  "id": "urn:credential:uuid",
  "issuer": "did:dpp:in20190830ytbav",
  "issuanceDate": "2026-03-09T00:00:00Z",
  "credentialStatus": {
    "id": "https://dpp.example.org/status/1#42",
    "type": "StatusList2021Entry",
    "statusListIndex": "42",
    "statusListCredential": "https://dpp.example.org/status/1"
  },
  "credentialSubject": {
    "id": "urn:product:apparel:SN-YTBAV-20260309",
    "product_category": "Apparel",
    "os_id": "IN20190830YTBAV",
    "manufacturer": "Riviera Home Furnishing PVT Ltd."
  },
  "trustSignals": {
    "overall_confidence": "high",
    "field_signals": {
      "sector": { "source": "csv-verified", "confidence": "high" },
      "os_id":  { "source": "csv-verified", "confidence": "high" }
    }
  },
  "issuerMetadata": {
    "tier": 2,
    "role": "tier2_factory",
    "approved_by": "did:dpp:root-authority"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "proofPurpose": "assertionMethod",
    "verificationMethod": "did:dpp:in20190830ytbav#key-1",
    "jws": "<base64-encoded Ed25519 signature>"
  }
}
```

---

## Verification Checks

Every call to `GET /product/{id}/verify` runs 5 checks per credential:

| Check | What it does |
|---|---|
| `signature_valid` | Re-derives signing input, verifies Ed25519 JWS against actor's public key |
| `not_revoked` | Looks up StatusList2021 bitstring for this credential's index |
| `issuer_registered` | Confirms issuer DID exists in the actor registry |
| `issuer_role_valid` | Confirms issuer role is authorised for the credential type |
| `temporal_order` | Confirms this stage's date is not earlier than the previous stage |

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend
python -m venv ../venv
source ../venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API: `http://localhost:8000` — Interactive docs: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:3000`

### Quickstart demo

1. Open `http://localhost:3000`
2. Pick any factory and click **Issue Birth Certificate**
   - You must sign in first — use the actor selector in the header (pick any actor, click **Sign in**)
3. After issue, click **View Lifecycle** to see the timeline
4. Click **+ Add Stage** to attach more credentials (Material Sourcing → Certification → etc.)
5. Click **Verify Chain** to see 5-check verification per credential
6. On the verify page, click **Revoke** on any credential — re-running verify will show the chain as compromised

---

## EU Regulation Alignment

| Regulation | Coverage |
|---|---|
| ESPR 2024 | Referenced in all Birth Certificates; product category → ecodesign scope |
| EU Battery Regulation 2023 | Lifecycle traceability model with custodian chain |
| EU Right to Repair Directive | `right_to_repair_compliant` field in RepairCredential |
| W3C VC Data Model 1.1 | Full conformance (context, type, proof block) |
| StatusList2021 | Credential revocation per W3C CCG draft |

---

## Planned / Future Work

- **Persistent storage** — PostgreSQL + audit log table (currently in-memory)
- **HSM-backed keys** — Replace startup-generated keys with hardware-secured keys for Tier 0/1
- **National accreditation API** — Tier 1 actor approval via real accreditation body APIs
- **Multi-sig threshold credentials** — Shamir's Secret Sharing for Tier 0 root
- **IPFS anchoring** — Off-chain payload storage with on-chain CID registry (Polygon)
- **IoT trust signals** — Automated sensor attestation for supply chain events
- **QR code generation** — Per-product QR linking to lifecycle page
- **Docker Compose** — One-command full-stack deployment

---

## Project Structure

```
dpp/
├── backend/
│   ├── main.py          # FastAPI app — all endpoints, VC issuance, chain validation
│   ├── actors.py        # Tier 0/1/2 actor registry, Ed25519 signing, DIDAuth
│   ├── status_list.py   # StatusList2021 bitstring revocation
│   ├── models.py        # Pydantic models for all lifecycle stages
│   └── requirements.txt
├── data/
│   ├── factory_data.csv                         # Open Supply Hub factories
│   ├── MOCK_DATA (3).csv                        # Raw material catalogue
│   └── y1AQEIpMTR2j7xgr9MH0_Manufacturing Dataset.csv
├── frontend/
│   ├── app/
│   │   ├── layout.jsx                # Root layout with nav + SessionBar
│   │   ├── page.jsx                  # Factory browser
│   │   ├── actors/page.jsx           # Actor registry
│   │   ├── factory/[os_id]/page.jsx  # Factory detail + issued products
│   │   ├── issue/[os_id]/page.jsx    # Birth certificate issuance
│   │   ├── product/[id]/page.jsx     # Lifecycle timeline
│   │   ├── product/[id]/add-stage/   # Stage form (all 6 types)
│   │   ├── verify/page.jsx           # Product ID lookup
│   │   └── verify/[id]/page.jsx      # Verification + revocation
│   └── lib/
│       └── api.js                    # Axios instance + auth token helpers
└── README.md
```

## License

MIT
