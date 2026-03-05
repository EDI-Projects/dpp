# Digital Product Passport — Verifiable Credentials

A decentralized Digital Product Passport (DPP) system built with the W3C Verifiable Credentials standard. Designed to meet the EU's ESPR/2024 regulation for batteries and textiles.

Each product gets a cryptographically signed "Birth Certificate" at manufacturing and accumulates signed credentials at every lifecycle stage — sourcing, certification, logistics, ownership, repair, and recycling. These credentials are issued by the actual stakeholders at each step, not by a central authority.


## What This Solves

Most current DPP implementations are centralized databases. This project uses Decentralized Identifiers (DIDs) and W3C Verifiable Credentials so that:

- Each actor in the supply chain issues their own signed credential
- No single party controls the full passport
- Credentials can be verified independently without calling back to an issuer
- The full lifecycle is traceable from a single QR code scan


## Project Structure

```
dpp/
├── backend/
│   ├── main.py            # FastAPI application — all API endpoints
│   ├── models.py          # Pydantic models for each lifecycle stage
│   └── requirements.txt
├── data/
│   └── factory_data.csv   # Real factory data (Open Supply Hub)
├── frontend/              # Next.js application (in progress)
└── README.md
```


## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI + Uvicorn |
| Data Models | Pydantic v2 |
| Factory Data | Pandas (reads CSV) |
| Credential Standard | W3C Verifiable Credentials 1.1 |
| Identity | Decentralized Identifiers (DIDs) |
| Frontend | Next.js (planned) |
| Future Storage | IPFS (off-chain credential anchoring) |


## Getting Started

### Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher (for the frontend)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.
Interactive docs are at `http://localhost:8000/docs`.

### Data

The backend reads `data/factory_data.csv` which contains real factory records from the Open Supply Hub. Each factory row includes:

- `os_id` — unique factory identifier
- `name`, `address`, `lat`, `lng` — location data
- `sector`, `product_type` — used to auto-detect product category
- `facility_type`, `number_of_workers` — embedded in the Birth Certificate
- `contributor` — real brands sourcing from that factory (used for auditor view)


## API Reference

### Factories

| Method | Endpoint | Description |
|---|---|---|
| GET | `/factories` | List all factories (paginated, default 20) |
| GET | `/factories/{os_id}` | Get a single factory by ID |

### Credentials

| Method | Endpoint | Description |
|---|---|---|
| POST | `/issue-birth-certificate/{os_id}` | Issue a W3C VC Birth Certificate from factory data |
| POST | `/add-lifecycle-stage/material-sourcing` | Add a material sourcing credential |
| POST | `/add-lifecycle-stage/certification` | Add a certification credential |
| POST | `/add-lifecycle-stage/custody-transfer` | Add a custody transfer credential |
| POST | `/add-lifecycle-stage/ownership` | Add an ownership/usage record |
| POST | `/add-lifecycle-stage/repair` | Add a repair or alteration record |
| POST | `/add-lifecycle-stage/end-of-life` | Add an end-of-life / recycling record |

### Product Lifecycle

| Method | Endpoint | Description |
|---|---|---|
| GET | `/product/{product_id}/lifecycle` | Full lifecycle timeline for a product |
| GET | `/product/{product_id}/verify` | Verify all credentials in the lifecycle |


## Credential Structure

Every credential follows the W3C VC Data Model:

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://dpp.example.org/contexts/v1"
  ],
  "type": ["VerifiableCredential", "ProductBirthCertificate"],
  "id": "urn:credential:uuid",
  "issuer": "did:dpp:factory-os-id",
  "issuanceDate": "2026-03-05T00:00:00Z",
  "credentialSubject": {
    "id": "urn:product:apparel:SN-YTBAV-20260305",
    "product_category": "Apparel",
    "manufacturer": {
      "name": "Riviera Home Furnishing PVT Ltd.",
      "country": "IN"
    }
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "proofPurpose": "assertionMethod",
    "verificationMethod": "did:dpp:in20190830ytbav#key-1",
    "jws": "..."
  }
}
```


## Lifecycle Stages

The system supports seven lifecycle stages, each producing a distinct credential type:

1. **ProductBirthCertificate** — issued by the manufacturer at production
2. **MaterialSourcingCredential** — issued by the sourcing agent (e.g. cotton farm, BCI)
3. **CertificationCredential** — issued by a certifying body (e.g. Bureau Veritas, GOTS)
4. **CustodyTransferCredential** — issued at each handover point in the supply chain
5. **OwnershipCredential** — issued when a consumer takes ownership
6. **RepairCredential** — issued by a repair or alteration service
7. **EndOfLifeCredential** — issued by the recycler or collector

Each credential references the same `product_id`, forming a verifiable chain.


## Product Category Detection

The backend automatically detects the correct product category from the factory's `sector` and `product_type` fields:

| Detected Category | Mapped From |
|---|---|
| Apparel | apparel, garment, clothing, textile |
| Home Textiles | home textile, household, furnish |
| Footwear | footwear, shoe |
| Pharmaceuticals | pharma, medicine, drug |
| Food & Agriculture | food, agri, farm, beverage |
| Industrial Materials | steel, metal, iron |
| Automotive | automotive, vehicle, motor |
| General Goods | everything else |


## EU Regulation Alignment

This project is designed with the following EU frameworks in mind:

- **ESPR 2024** (Ecodesign for Sustainable Products Regulation) — referenced in all Birth Certificates
- **EU Battery Regulation 2023** — lifecycle traceability model
- **EU Right to Repair Directive** — `right_to_repair_compliant` field in repair credentials
- **W3C VC Data Model 1.1** — credential envelope structure


## Planned Features

- Real Ed25519 cryptographic signing using `didkit`
- IPFS storage for off-chain credential anchoring
- QR code generation per product linking to lifecycle page
- Next.js frontend with consumer timeline view and auditor verification dashboard
- PostgreSQL or MongoDB for persistent lifecycle storage
- Docker Compose setup for one-command deployment


## License

MIT
