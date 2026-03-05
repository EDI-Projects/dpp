from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import uuid
from datetime import datetime, timezone
from models import (
    MaterialSourcingRecord, CertificationRecord, CustodyTransfer,
    OwnershipRecord, RepairRecord, EndOfLifeRecord
)

app = FastAPI(title="Digital Product Passport API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CSV_PATH = "../data/factory_data.csv"

#later into db
lifecycle_store: dict[str, list] = {}

def load_factories() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)
    df.columns = df.columns.str.strip()
    return df

def detect_product_category(sector: str, product_type: str) -> str:
    combined = f"{sector} {product_type}".lower()
    if any(k in combined for k in ["footwear", "shoe"]):
        return "Footwear"
    if any(k in combined for k in ["pharma", "medicine", "drug"]):
        return "Pharmaceuticals"
    if any(k in combined for k in ["food", "agri", "farm", "beverage"]):
        return "Food & Agriculture"
    if any(k in combined for k in ["steel", "metal", "iron"]):
        return "Industrial Materials"
    if any(k in combined for k in ["automotive", "vehicle", "motor"]):
        return "Automotive"
    if any(k in combined for k in ["home textile", "household", "furnish"]):
        return "Home Textiles"
    if any(k in combined for k in ["apparel", "garment", "clothing", "textile"]):
        return "Apparel"
    return "General Goods"

def parse_worker_count(raw) -> int:
    if pd.isna(raw):
        return 0
    raw = str(raw).split("|")[0].strip()
    if "-" in raw:
        parts = raw.split("-")
        try:
            return int(parts[0])
        except ValueError:
            return 0
    try:
        return int(raw)
    except ValueError:
        return 0

def make_did(identifier: str) -> str:
    return f"did:dpp:{identifier.lower().replace(' ', '-')}"

def make_vc(issuer_id: str, subject: dict, vc_type: str) -> dict:
    return {
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://dpp.example.org/contexts/v1"
        ],
        "type": ["VerifiableCredential", vc_type],
        "id": f"urn:credential:{uuid.uuid4()}",
        "issuer": issuer_id,
        "issuanceDate": datetime.now(timezone.utc).isoformat(),
        "credentialSubject": subject,
        "proof": {
            "type": "Ed25519Signature2020",
            "created": datetime.now(timezone.utc).isoformat(),
            "proofPurpose": "assertionMethod",
            "verificationMethod": f"{issuer_id}#key-1",
            "jws": "MOCK_SIGNATURE_PLACEHOLDER"
        }
    }

"""endpoints"""

@app.get("/factories")
def list_factories(limit: int = Query(20, ge=1, le=200)):
    df = load_factories()
    cols = ["os_id", "name", "address", "country_name", "sector", "product_type",
            "facility_type", "number_of_workers", "is_closed", "lat", "lng"]
    available = [c for c in cols if c in df.columns]
    return df[available].head(limit).fillna("").to_dict(orient="records")

@app.get("/factories/{os_id}")
def get_factory(os_id: str):
    df = load_factories()
    row = df[df["os_id"] == os_id]
    if row.empty:
        raise HTTPException(status_code=404, detail="Factory not found")
    return row.fillna("").iloc[0].to_dict()

@app.post("/issue-birth-certificate/{os_id}")
def issue_birth_certificate(os_id: str):
    df = load_factories()
    row = df[df["os_id"] == os_id]
    if row.empty:
        raise HTTPException(status_code=404, detail="Factory not found")

    f = row.fillna("").iloc[0].to_dict()
    sector     = str(f.get("sector", ""))
    prod_type  = str(f.get("product_type", ""))
    category   = detect_product_category(sector, prod_type)
    serial_no  = f"SN-{os_id[-6:]}-{datetime.now().strftime('%Y%m%d')}"
    product_id = f"urn:product:{category.lower().replace(' ', '-')}:{serial_no}"
    issuer_did = make_did(os_id)

    subject = {
        "id": product_id,
        "serial_number": serial_no,
        "product_category": category,
        "product_type": prod_type or category,
        "sector": sector,
        "eu_regulation_ref": "ESPR/2024",
        "manufacturer": {
            "id": issuer_did,
            "os_id": os_id,
            "name": f.get("name", ""),
            "address": f.get("address", ""),
            "country": f.get("country_code", ""),
            "city": f.get("address", "").split(",")[-1].strip(),
            "lat": f.get("lat", ""),
            "lng": f.get("lng", ""),
            "facility_type": f.get("facility_type", ""),
            "num_workers": parse_worker_count(f.get("number_of_workers", 0)),
        },
        "manufacture_date": datetime.now(timezone.utc).date().isoformat(),
        "lifecycle_stage": "Manufactured",
    }
    vc = make_vc(issuer_did, subject, "ProductBirthCertificate")
    lifecycle_store[product_id] = [{
        "stage": "Manufactured",
        "date": subject["manufacture_date"],
        "issuer": f.get("name", ""),
        "credential_id": vc["id"],
        "details": {
            "factory": f.get("name"),
            "country": f.get("country_name"),
            "facility_type": f.get("facility_type"),
        }
    }]
    return {"product_id": product_id, "credential": vc}


@app.post("/add-lifecycle-stage/material-sourcing")
def add_material_sourcing(record: MaterialSourcingRecord):
    product_id = record.product_id
    issuer_did = make_did("material-sourcing-authority")
    vc = make_vc(issuer_did, record.model_dump(), "MaterialSourcingCredential")

    lifecycle_store.setdefault(product_id, []).append({
        "stage": "Material Sourcing",
        "date": record.sourcing_date,
        "issuer": record.certifying_body,
        "credential_id": vc["id"],
        "details": record.model_dump()
    })
    return {"product_id": product_id, "credential": vc}


@app.post("/add-lifecycle-stage/certification")
def add_certification(record: CertificationRecord):
    product_id = record.product_id
    issuer_did = make_did(record.certifying_body)
    vc = make_vc(issuer_did, record.model_dump(), "CertificationCredential")

    lifecycle_store.setdefault(product_id, []).append({
        "stage": "Certification",
        "date": record.audit_date,
        "issuer": record.certifying_body,
        "credential_id": vc["id"],
        "details": record.model_dump()
    })
    return {"product_id": product_id, "credential": vc}


@app.post("/add-lifecycle-stage/custody-transfer")
def add_custody_transfer(record: CustodyTransfer):
    product_id = record.product_id
    issuer_did = make_did(record.from_actor_name)
    vc = make_vc(issuer_did, record.model_dump(), "CustodyTransferCredential")

    lifecycle_store.setdefault(product_id, []).append({
        "stage": f"Transfer {record.transfer_sequence}: {record.transfer_type}",
        "date": record.handover_date,
        "issuer": record.from_actor_name,
        "credential_id": vc["id"],
        "details": record.model_dump()
    })
    return {"product_id": product_id, "credential": vc}


@app.post("/add-lifecycle-stage/ownership")
def add_ownership(record: OwnershipRecord):
    product_id = record.product_id
    issuer_did = make_did("ownership-registry")
    vc = make_vc(issuer_did, record.model_dump(), "OwnershipCredential")

    lifecycle_store.setdefault(product_id, []).append({
        "stage": "Ownership / Usage",
        "date": record.ownership_start,
        "issuer": "Ownership Registry",
        "credential_id": vc["id"],
        "details": record.model_dump()
    })
    return {"product_id": product_id, "credential": vc}


@app.post("/add-lifecycle-stage/repair")
def add_repair(record: RepairRecord):
    product_id = record.product_id
    issuer_did = make_did(record.service_provider)
    vc = make_vc(issuer_did, record.model_dump(), "RepairCredential")

    lifecycle_store.setdefault(product_id, []).append({
        "stage": f"Repair: {record.service_type}",
        "date": record.service_date,
        "issuer": record.service_provider,
        "credential_id": vc["id"],
        "details": record.model_dump()
    })
    return {"product_id": product_id, "credential": vc}


@app.post("/add-lifecycle-stage/end-of-life")
def add_end_of_life(record: EndOfLifeRecord):
    product_id = record.product_id
    issuer_did = make_did(record.recycler_name)
    vc = make_vc(issuer_did, record.model_dump(), "EndOfLifeCredential")

    lifecycle_store.setdefault(product_id, []).append({
        "stage": "End of Life",
        "date": record.collection_date,
        "issuer": record.recycler_name,
        "credential_id": vc["id"],
        "details": record.model_dump()
    })
    return {"product_id": product_id, "credential": vc}


@app.get("/product/{product_id}/lifecycle")
def get_product_lifecycle(product_id: str):
    lifecycle = lifecycle_store.get(product_id)
    if lifecycle is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return {
        "product_id": product_id,
        "total_stages": len(lifecycle),
        "lifecycle": lifecycle
    }


@app.get("/product/{product_id}/verify")
def verify_product(product_id: str):
    lifecycle = lifecycle_store.get(product_id)
    if lifecycle is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return {
        "product_id": product_id,
        "verified": True,
        "total_credentials": len(lifecycle),
        "verification_summary": [
            {
                "stage": stage["stage"],
                "issuer": stage["issuer"],
                "credential_id": stage["credential_id"],
                "signature_valid": True
            }
            for stage in lifecycle
        ]
    }