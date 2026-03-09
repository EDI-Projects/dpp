"""
Digital Product Passport — FastAPI backend

Trust tiers:
  Tier 0  Root authority (multi-sig HSM in production — future work)
  Tier 1  Verified third parties: certifiers, recyclers, regulators
  Tier 2  Dataset-anchored actors: factories, suppliers, logistics

Future production architecture:
  - Shamir's Secret Sharing key recovery for Tier 0 root
  - HSM-backed key storage for all tiers
  - National accreditation body API integration (Tier 1 approval)
  - Full multi-sig threshold credentials
  - IoT-verified trust signals (automated sensor attestation)
  - On-chain audit log anchoring (Polygon CID registry)
  - IPFS payload storage via Pinata
  - PostgreSQL persistence + audit log table
"""

import json
import uuid
from datetime import datetime, timezone, date as date_type
from pydantic import BaseModel
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd

from models import (
    MaterialSourcingRecord, CertificationRecord, CustodyTransfer,
    OwnershipRecord, RepairRecord, EndOfLifeRecord,
)
import actors as actors_module
import status_list
from actors import (
    DEMO_CERTIFIER_DID, DEMO_RECYCLER_DID,
    DEMO_SUPPLIER_DID, DEMO_LOGISTICS_DID,
    DEMO_FACTORY_DID,
)

app = FastAPI(title="Digital Product Passport API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


CSV_PATH        = "../data/factory_data.csv"
MATERIALS_PATH  = "../data/MOCK_DATA (3).csv"
PRODUCTION_PATH = "../data/y1AQEIpMTR2j7xgr9MH0_Manufacturing Dataset.csv"


lifecycle_store: dict[str, list]   = {}   # product_id -> list of stage entries
credential_index: dict[str, dict]  = {}   # credential_id -> stage entry
factory_products: dict[str, list]  = {}   # os_id -> [product_ids]
audit_log: list[dict]              = []   # platform audit trail

def _log(event: str, actor_did: str = None, detail: str = None, product_id: str = None):
    audit_log.append({
        "ts":         datetime.now(timezone.utc).isoformat(),
        "event":      event,
        "actor_did":  actor_did,
        "product_id": product_id,
        "detail":     detail,
    })

# ── Auth ─────────────────────────────────────────────────────────────────────
_bearer = HTTPBearer(auto_error=False)

def require_auth(creds: HTTPAuthorizationCredentials = Security(_bearer)):
    """Dependency: validate Bearer token issued by POST /auth/verify (DIDAuth)."""
    if not creds or not creds.credentials:
        raise HTTPException(401, detail="Authentication required. "
            "Obtain a token via POST /auth/challenge → /auth/sign → /auth/verify.")
    actor = actors_module.resolve_token(creds.credentials)
    if not actor:
        raise HTTPException(403, detail="Invalid or expired token.")
    return actor

CATEGORY_MATERIAL_MAP: dict[str, list[str]] = {
    "Apparel":              ["fabric", "leather"],
    "Home Textiles":        ["fabric"],
    "Footwear":             ["leather", "rubber"],
    "Pharmaceuticals":      ["plastic", "glass", "paper"],
    "Food & Agriculture":   ["paper", "plastic"],
    "Industrial Materials": ["metal", "glass", "concrete", "ceramic"],
    "Automotive":           ["metal", "rubber", "plastic", "glass"],
    "General Goods":        ["plastic", "wood", "paper", "fabric"],
}

CATEGORY_TO_PROD_TYPE: dict[str, str] = {
    "Automotive":           "Automotive",
    "Apparel":              "Textiles",
    "Home Textiles":        "Textiles",
    "Footwear":             "Textiles",
    "General Goods":        "Appliances",
    "Industrial Materials": "Electronics",
    "Pharmaceuticals":      "Appliances",
    "Food & Agriculture":   "Appliances",
}

FACTORY_CSV_FIELDS  = {"name", "address", "country_code", "country_name", "sector",
                       "product_type", "facility_type", "lat", "lng"}
MATERIAL_CSV_FIELDS = {"raw_material_id", "supplier", "supplier_location",
                       "cost_per_unit", "description"}

# ── CSV loaders ───────────────────────────────────────────────────────────────

def load_factories() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)
    df.columns = df.columns.str.strip()
    return df

def load_materials() -> pd.DataFrame:
    df = pd.read_csv(MATERIALS_PATH)
    df.columns = df.columns.str.strip()
    df.rename(columns={"cost per unit": "cost_per_unit"}, inplace=True)
    return df

def load_production() -> pd.DataFrame:
    df = pd.read_csv(PRODUCTION_PATH)
    df.columns = df.columns.str.strip()
    df.rename(columns={
        "Production ID":             "production_id",
        "Date":                      "date",
        "Product Type":              "product_type",
        "Machine ID":                "machine_id",
        "Shift":                     "shift",
        "Units Produced":            "units_produced",
        "Defects":                   "defects",
        "Production Time Hours":     "production_time_hours",
        "Material Cost Per Unit":    "material_cost_per_unit",
        "Labour Cost Per Hour":      "labour_cost_per_hour",
        "Energy Consumption kWh":    "energy_consumption_kwh",
        "Operator Count":            "operator_count",
        "Maintenance Hours":         "maintenance_hours",
        "Down time Hours":           "downtime_hours",
        "Production Volume Cubic Meters": "production_volume_m3",
        "Scrap Rate":                "scrap_rate",
        "Rework Hours":              "rework_hours",
        "Quality Checks Failed":     "quality_checks_failed",
        "Average Temperature C":     "avg_temperature_c",
        "Average Humidity Percent":  "avg_humidity_percent",
    }, inplace=True)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    return df

# ── Helpers ───────────────────────────────────────────────────────────────────

def detect_product_category(sector: str, product_type: str) -> str:
    combined = f"{sector} {product_type}".lower()
    if any(k in combined for k in ["footwear", "shoe"]):          return "Footwear"
    if any(k in combined for k in ["pharma", "medicine", "drug"]): return "Pharmaceuticals"
    if any(k in combined for k in ["food", "agri", "farm", "beverage"]): return "Food & Agriculture"
    if any(k in combined for k in ["steel", "metal", "iron"]):    return "Industrial Materials"
    if any(k in combined for k in ["automotive", "vehicle", "motor"]): return "Automotive"
    if any(k in combined for k in ["home textile", "household", "furnish"]): return "Home Textiles"
    if any(k in combined for k in ["apparel", "garment", "clothing", "textile"]): return "Apparel"
    return "General Goods"

def parse_worker_count(raw) -> int:
    if pd.isna(raw):
        return 0
    raw = str(raw).split("|")[0].strip()
    if "-" in raw:
        try:    return int(raw.split("-")[0])
        except: return 0
    try:    return int(raw)
    except: return 0

def make_did(identifier: str) -> str:
    return f"did:dpp:{identifier.lower().replace(' ', '-')}"

def get_stage_names(product_id: str) -> list[str]:
    return [s["stage"] for s in lifecycle_store.get(product_id, [])]

def _parse_date(d: str):
    try:
        return date_type.fromisoformat(str(d)[:10])
    except Exception:
        return None

# ── Trust signals ─────────────────────────────────────────────────────────────

def _build_trust_signals(subject: dict, csv_fields: set, actor) -> dict:
    """
    Per-field provenance metadata.
      csv      — read from a verified open dataset (high confidence)
      derived  — computed by the system (high confidence)
      manual   — asserted by the requesting party (medium confidence)

    Future work: 'iot' source for hardware-attested sensor readings.
    """
    field_signals: dict = {}
    for key, val in subject.items():
        if isinstance(val, dict):
            continue
        if key in csv_fields:
            field_signals[key] = {"source": "csv",     "confidence": "high"}
        elif key in {"id", "product_id", "serial_number", "manufacture_date",
                     "eu_regulation_ref", "lifecycle_stage"}:
            field_signals[key] = {"source": "derived", "confidence": "high"}
        else:
            field_signals[key] = {"source": "manual",  "confidence": "medium"}
    return {
        "issuer_role":     actor.role        if actor else "unknown",
        "issuer_tier":     actor.tier        if actor else 99,
        "issuer_verified": actor is not None and actor.approved_by is not None,
        "approved_by":     actor.approved_by if actor else None,
        "field_signals":   field_signals,
    }

def make_vc(issuer_did: str, subject: dict, vc_type: str,
            csv_fields: set = None, product_id: str = "") -> dict:
    actor   = actors_module.get_actor(issuer_did)
    cred_id = f"urn:credential:{uuid.uuid4()}"
    now     = datetime.now(timezone.utc).isoformat()

    trust_signals = _build_trust_signals(subject, csv_fields or set(), actor)
    sl_index      = status_list.allocate_index(cred_id, product_id, vc_type)

    vc = {
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://dpp.example.org/contexts/v1",
            "https://w3id.org/vc/status-list/2021/v1",
        ],
        "type":             ["VerifiableCredential", vc_type],
        "id":               cred_id,
        "issuer":           issuer_did,
        "issuerMetadata":   actor.to_public_dict() if actor else {
                                "did": issuer_did, "name": issuer_did, "role": "unregistered"
                            },
        "issuanceDate":     now,
        "credentialSubject": subject,
        "credentialStatus":  status_list.credential_status_entry(sl_index),
        "trustSignals":      trust_signals,
    }

    signing_input = json.dumps({
        "id": cred_id, "type": vc_type, "issuer": issuer_did,
        "issuanceDate": now, "credentialSubject": subject,
    }, sort_keys=True).encode()

    if actor:
        vc["proof"] = {
            "type":               "Ed25519Signature2020",
            "created":            now,
            "proofPurpose":       "assertionMethod",
            "verificationMethod": f"{issuer_did}#key-1",
            "publicKey":          actor.public_key_b64,
            "jws":                actor.sign(signing_input),
        }
    else:
        vc["proof"] = {
            "type":               "Ed25519Signature2020",
            "created":            now,
            "proofPurpose":       "assertionMethod",
            "verificationMethod": f"{issuer_did}#key-1",
            "jws":                "UNREGISTERED_ISSUER",
            "warning":            "Issuer DID not in actor registry",
        }
    return vc

def validate_chain(product_id: str, required_prefix: str,
                   new_date: str = None,
                   issuer_did: str = None,
                   vc_type: str = None) -> None:
    """
    1. Chain continuity  — Birth Certificate must exist (stage ordering not enforced in demo)
    2. Revocation check  — no existing credential in chain is revoked
    3. Temporal ordering — new_date >= last stage date
    4. Issuer role check — issuer DID authorised for vc_type
    """
    stages   = get_stage_names(product_id)
    existing = lifecycle_store.get(product_id, [])

    # 1. Chain continuity — only require a Birth Certificate to exist
    if not stages:
        raise HTTPException(422,
            detail=f"Product '{product_id}' has no Birth Certificate. "
                   f"Issue one first via POST /issue-birth-certificate/{{os_id}}.")
    # (stage ordering is advisory in demo mode — not enforced)

    # 2. Revocation check
    for entry in existing:
        _, revoked = status_list.lookup_by_credential_id(entry.get("credential_id", ""))
        if revoked:
            raise HTTPException(422,
                detail=f"Chain compromised: credential '{entry['credential_id']}' "
                       f"(stage '{entry['stage']}') has been revoked.")

    # 3. Temporal ordering
    if new_date and existing:
        last_d = _parse_date(existing[-1].get("date", ""))
        new_d  = _parse_date(new_date)
        if last_d and new_d and new_d < last_d:
            raise HTTPException(422,
                detail=f"Temporal violation: '{new_date}' is earlier than last stage '{existing[-1]['date']}'.")

    # 4. Issuer role check
    if issuer_did and vc_type:
        try:
            actors_module.require_actor(issuer_did, vc_type)
        except ValueError as exc:
            raise HTTPException(403, detail=str(exc))

# ── Dataset bridge ────────────────────────────────────────────────────────────

def bridge_product_context(os_id: str, product_category: str) -> dict:
    """Join all three datasets for enriched birth certificate context."""
    bridge: dict = {}
    material_types = CATEGORY_MATERIAL_MAP.get(product_category, [])
    try:
        df_mat = load_materials()
        mask = df_mat["description"].str.lower().isin([m.lower() for m in material_types])
        bridge["suggested_materials"] = (
            df_mat[mask][["raw_material_id", "description", "supplier",
                          "supplier_location", "cost_per_unit"]]
            .head(3).fillna("").to_dict(orient="records")
        )
        bridge["avg_material_cost"] = round(float(df_mat[mask]["cost_per_unit"].mean()), 2) if not df_mat[mask].empty else None
    except Exception:
        bridge["suggested_materials"] = []

    prod_type_key = CATEGORY_TO_PROD_TYPE.get(product_category, "Appliances")
    try:
        df_prod = load_production()
        subset  = df_prod[df_prod["product_type"] == prod_type_key]
        if not subset.empty:
            bridge["production_stats"] = {
                "total_runs":        int(len(subset)),
                "avg_scrap_rate":    round(float(subset["scrap_rate"].mean()), 4),
                "avg_cost_per_unit": round(float(subset["material_cost_per_unit"].mean()), 2),
            }
    except Exception:
        pass
    return bridge

# ── Factory endpoints ─────────────────────────────────────────────────────────

@app.get("/factories")
def list_factories(limit: int = Query(20, ge=1, le=200)):
    df = load_factories()
    cols = ["os_id", "name", "address", "country_name", "sector", "product_type",
            "facility_type", "number_of_workers", "is_closed", "lat", "lng"]
    records = df[[c for c in cols if c in df.columns]].head(limit).fillna("").to_dict(orient="records")
    for r in records:
        r["product_category"] = detect_product_category(
            str(r.get("sector", "")), str(r.get("product_type", "")))
    return records

@app.get("/factories/{os_id}")
def get_factory(os_id: str):
    df = load_factories()
    row = df[df["os_id"] == os_id]
    if row.empty:
        raise HTTPException(404, detail="Factory not found")
    r = row.fillna("").iloc[0].to_dict()
    r["product_category"] = detect_product_category(
        str(r.get("sector", "")), str(r.get("product_type", "")))
    return r

@app.get("/factories/{os_id}/products")
def get_factory_products(os_id: str):
    """Return all product IDs issued by this factory, with current stage count."""
    product_ids = factory_products.get(os_id, [])
    result = []
    for pid in product_ids:
        stages = lifecycle_store.get(pid, [])
        result.append({
            "product_id":    pid,
            "stage_count":   len(stages),
            "current_stage": stages[-1]["stage"] if stages else "Unknown",
            "issued_date":   stages[0]["date"] if stages else None,
        })
    return {"os_id": os_id, "total": len(result), "products": result}

@app.get("/suggest-materials/{os_id}")
def suggest_materials(os_id: str, limit: int = Query(5, ge=1, le=20)):
    df_factories = load_factories()
    row = df_factories[df_factories["os_id"] == os_id]
    if row.empty:
        raise HTTPException(404, detail="Factory not found")
    f = row.fillna("").iloc[0].to_dict()
    category       = detect_product_category(str(f.get("sector", "")), str(f.get("product_type", "")))
    material_types = CATEGORY_MATERIAL_MAP.get(category, ["fabric", "plastic"])
    df_mat = load_materials()
    mask   = df_mat["description"].str.lower().isin([m.lower() for m in material_types])
    suggestions = (
        df_mat[mask][["raw_material_id", "description", "supplier", "supplier_location", "cost_per_unit"]]
        .head(limit).fillna("").to_dict(orient="records")
    )
    return {"os_id": os_id, "factory_name": f.get("name", ""), "product_category": category,
            "material_types": material_types, "suggestions": suggestions}

@app.get("/production-stats/{os_id}")
def get_production_stats(os_id: str, limit: int = Query(10, ge=1, le=50)):
    df_factories = load_factories()
    row = df_factories[df_factories["os_id"] == os_id]
    if row.empty:
        raise HTTPException(404, detail="Factory not found")
    f         = row.fillna("").iloc[0].to_dict()
    category  = detect_product_category(str(f.get("sector", "")), str(f.get("product_type", "")))
    prod_type = CATEGORY_TO_PROD_TYPE.get(category, "Appliances")
    df        = load_production()
    subset    = df[df["product_type"] == prod_type].copy().sort_values("date", ascending=False)
    recent    = subset.head(limit).fillna(0).copy()
    recent["date"] = recent["date"].dt.strftime("%Y-%m-%d")
    agg = subset.agg({
        "units_produced": "mean", "defects": "mean", "scrap_rate": "mean",
        "production_time_hours": "mean", "energy_consumption_kwh": "mean",
        "quality_checks_failed": "mean", "material_cost_per_unit": "mean",
    }).round(2).to_dict()
    return {"os_id": os_id, "factory_name": f.get("name", ""), "product_category": category,
            "mapped_prod_type": prod_type, "total_runs": int(len(subset)),
            "averages": agg, "recent_runs": recent.to_dict(orient="records")}

# ── Birth certificate ─────────────────────────────────────────────────────────

@app.post("/issue-birth-certificate/{os_id}")
def issue_birth_certificate(os_id: str, _actor=Depends(require_auth)):
    if not _actor.can_issue("ProductBirthCertificate"):
        raise HTTPException(403, detail=(
            f"Role '{_actor.role}' is not authorised to issue ProductBirthCertificate. "
            f"Sign in as a factory actor (Tier 2 factory) or a Tier 0/1 regulator."
        ))
    df = load_factories()
    row = df[df["os_id"] == os_id]
    if row.empty:
        raise HTTPException(404, detail="Factory not found")

    f          = row.fillna("").iloc[0].to_dict()
    sector     = str(f.get("sector", ""))
    prod_type  = str(f.get("product_type", ""))
    category   = detect_product_category(sector, prod_type)
    serial_no  = f"SN-{os_id[-6:]}-{datetime.now().strftime('%Y%m%d')}"
    product_id = f"urn:product:{category.lower().replace(' ', '-')}:{serial_no}"

    # Register factory actor for traceability but sign with the authenticated actor
    actors_module.get_or_create_factory_actor(os_id, f.get("name", ""))
    issuer_did = _actor.did

    subject = {
        "id":               product_id,
        "serial_number":    serial_no,
        "product_category": category,
        "product_type":     prod_type or category,
        "sector":           sector,
        "eu_regulation_ref": "ESPR/2024",
        "manufacturer": {
            "id":            issuer_did,
            "os_id":         os_id,
            "name":          f.get("name", ""),
            "address":       f.get("address", ""),
            "country":       f.get("country_code", ""),
            "city":          f.get("address", "").split(",")[-1].strip(),
            "lat":           f.get("lat", ""),
            "lng":           f.get("lng", ""),
            "facility_type": f.get("facility_type", ""),
            "num_workers":   parse_worker_count(f.get("number_of_workers", 0)),
        },
        "manufacture_date":   datetime.now(timezone.utc).date().isoformat(),
        "lifecycle_stage":    "Manufactured",
        "production_context": bridge_product_context(os_id, category),
    }

    vc = make_vc(issuer_did, subject, "ProductBirthCertificate",
                 csv_fields=FACTORY_CSV_FIELDS, product_id=product_id)
    entry = {
        "stage":         "Manufactured",
        "date":          subject["manufacture_date"],
        "issuer":        f.get("name", ""),
        "issuer_did":    issuer_did,
        "credential_id": vc["id"],
        "credential":    vc,
    }
    lifecycle_store[product_id]  = [entry]
    credential_index[vc["id"]]   = entry
    factory_products.setdefault(os_id, []).append(product_id)
    _log("CREDENTIAL_ISSUED", issuer_did, f"ProductBirthCertificate", product_id)
    return {"product_id": product_id, "credential": vc}

@app.post("/add-lifecycle-stage/material-sourcing")
def add_material_sourcing(record: MaterialSourcingRecord, _actor=Depends(require_auth)):
    if not _actor.can_issue("MaterialSourcingCredential"):
        raise HTTPException(403, detail=(
            f"Role '{_actor.role}' cannot issue MaterialSourcingCredential. "
            f"Sign in as a supplier actor."
        ))
    product_id = record.product_id
    issuer_did = _actor.did  # always use authenticated actor; ignore client-supplied issuer_did
    validate_chain(product_id, "", new_date=record.sourcing_date,
                   issuer_did=issuer_did, vc_type="MaterialSourcingCredential")
    vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                 "MaterialSourcingCredential",
                 csv_fields=MATERIAL_CSV_FIELDS, product_id=product_id)
    entry = {"stage": "Material Sourcing", "date": record.sourcing_date,
             "issuer": record.certifying_body, "issuer_did": issuer_did,
             "credential_id": vc["id"], "credential": vc}
    lifecycle_store.setdefault(product_id, []).append(entry)
    credential_index[vc["id"]] = entry
    _log("CREDENTIAL_ISSUED", issuer_did, "MaterialSourcingCredential", product_id)
    return {"product_id": product_id, "credential": vc}

@app.post("/add-lifecycle-stage/certification")
def add_certification(record: CertificationRecord, _actor=Depends(require_auth)):
    if not _actor.can_issue("CertificationCredential"):
        raise HTTPException(403, detail=(
            f"Role '{_actor.role}' cannot issue CertificationCredential. "
            f"Sign in as a certifier actor."
        ))
    product_id = record.product_id
    issuer_did = _actor.did  # always use authenticated actor
    # auto-derive sourcing_id from latest material-sourcing credential in chain
    if not record.sourcing_id:
        for e in reversed(lifecycle_store.get(product_id, [])):
            if "Material Sourcing" in e.get("stage", ""):
                record.sourcing_id = e.get("credential_id", "auto")
                break
        else:
            record.sourcing_id = "auto"
    validate_chain(product_id, "", new_date=record.audit_date,
                   issuer_did=issuer_did, vc_type="CertificationCredential")
    vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                 "CertificationCredential", product_id=product_id)
    entry = {"stage": "Certification", "date": record.audit_date,
             "issuer": record.certifying_body, "issuer_did": issuer_did,
             "credential_id": vc["id"], "credential": vc}
    lifecycle_store.setdefault(product_id, []).append(entry)
    credential_index[vc["id"]] = entry
    _log("CREDENTIAL_ISSUED", issuer_did, "CertificationCredential", product_id)
    return {"product_id": product_id, "credential": vc}

@app.post("/add-lifecycle-stage/custody-transfer")
def add_custody_transfer(record: CustodyTransfer, _actor=Depends(require_auth)):
    if not _actor.can_issue("CustodyTransferCredential"):
        raise HTTPException(403, detail=(
            f"Role '{_actor.role}' cannot issue CustodyTransferCredential. "
            f"Sign in as a logistics or factory actor."
        ))
    product_id = record.product_id
    issuer_did = _actor.did  # always use authenticated actor
    # auto-assign transfer_sequence
    if record.transfer_sequence is None:
        existing_transfers = sum(
            1 for e in lifecycle_store.get(product_id, [])
            if e.get("stage", "").startswith("Transfer")
        )
        record.transfer_sequence = existing_transfers + 1
    validate_chain(product_id, "", new_date=record.handover_date,
                   issuer_did=issuer_did, vc_type="CustodyTransferCredential")
    vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                 "CustodyTransferCredential", product_id=product_id)
    stage_label = f"Transfer {record.transfer_sequence}: {record.transfer_type}"
    entry = {"stage": stage_label, "date": record.handover_date,
             "issuer": record.from_actor_name, "issuer_did": issuer_did,
             "credential_id": vc["id"], "credential": vc}
    lifecycle_store.setdefault(product_id, []).append(entry)
    credential_index[vc["id"]] = entry
    _log("CREDENTIAL_ISSUED", issuer_did, "CustodyTransferCredential", product_id)
    return {"product_id": product_id, "credential": vc}

@app.post("/add-lifecycle-stage/ownership")
def add_ownership(record: OwnershipRecord, _actor=Depends(require_auth)):
    if not _actor.can_issue("OwnershipCredential"):
        raise HTTPException(403, detail=(
            f"Role '{_actor.role}' cannot issue OwnershipCredential. "
            f"Sign in as a factory actor."
        ))
    product_id = record.product_id
    issuer_did = _actor.did  # always use authenticated actor
    validate_chain(product_id, "", new_date=record.ownership_start,
                   issuer_did=issuer_did, vc_type="OwnershipCredential")
    vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                 "OwnershipCredential", product_id=product_id)
    entry = {"stage": "Ownership / Usage", "date": record.ownership_start,
             "issuer": "Ownership Registry", "issuer_did": issuer_did,
             "credential_id": vc["id"], "credential": vc}
    lifecycle_store.setdefault(product_id, []).append(entry)
    credential_index[vc["id"]] = entry
    _log("CREDENTIAL_ISSUED", issuer_did, "OwnershipCredential", product_id)
    return {"product_id": product_id, "credential": vc}

@app.post("/add-lifecycle-stage/repair")
def add_repair(record: RepairRecord, _actor=Depends(require_auth)):
    if not _actor.can_issue("RepairCredential"):
        raise HTTPException(403, detail=(
            f"Role '{_actor.role}' cannot issue RepairCredential. "
            f"Sign in as a factory actor."
        ))
    product_id = record.product_id
    issuer_did = _actor.did  # always use authenticated actor
    validate_chain(product_id, "", new_date=record.service_date,
                   issuer_did=issuer_did, vc_type="RepairCredential")
    vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                 "RepairCredential", product_id=product_id)
    entry = {"stage": f"Repair: {record.service_type}", "date": record.service_date,
             "issuer": record.service_provider, "issuer_did": issuer_did,
             "credential_id": vc["id"], "credential": vc}
    lifecycle_store.setdefault(product_id, []).append(entry)
    credential_index[vc["id"]] = entry
    _log("CREDENTIAL_ISSUED", issuer_did, "RepairCredential", product_id)
    return {"product_id": product_id, "credential": vc}

@app.post("/add-lifecycle-stage/end-of-life")
def add_end_of_life(record: EndOfLifeRecord, _actor=Depends(require_auth)):
    if not _actor.can_issue("EndOfLifeCredential"):
        raise HTTPException(403, detail=(
            f"Role '{_actor.role}' cannot issue EndOfLifeCredential. "
            f"Sign in as a recycler actor."
        ))
    product_id = record.product_id
    issuer_did = _actor.did  # always use authenticated actor
    validate_chain(product_id, "", new_date=record.collection_date,
                   issuer_did=issuer_did, vc_type="EndOfLifeCredential")
    vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                 "EndOfLifeCredential", product_id=product_id)
    entry = {"stage": "End of Life", "date": record.collection_date,
             "issuer": record.recycler_name, "issuer_did": issuer_did,
             "credential_id": vc["id"], "credential": vc}
    lifecycle_store.setdefault(product_id, []).append(entry)
    credential_index[vc["id"]] = entry
    _log("CREDENTIAL_ISSUED", issuer_did, "EndOfLifeCredential", product_id)
    return {"product_id": product_id, "credential": vc}


@app.get("/product/{product_id}/lifecycle")
def get_product_lifecycle(product_id: str):
    lifecycle = lifecycle_store.get(product_id)
    if lifecycle is None:
        raise HTTPException(404, detail="Product not found")
    return {"product_id": product_id, "total_stages": len(lifecycle), "lifecycle": lifecycle}

@app.get("/product/{product_id}/verify")
def verify_product(product_id: str):
    lifecycle = lifecycle_store.get(product_id)
    if lifecycle is None:
        raise HTTPException(404, detail="Product not found")

    credentials_report = []
    overall_valid = True

    for i, entry in enumerate(lifecycle):
        vc         = entry.get("credential", {})
        cid        = entry.get("credential_id", "")
        issuer_did = entry.get("issuer_did", vc.get("issuer", ""))
        proof      = vc.get("proof", {})
        actor      = actors_module.get_actor(issuer_did)
        vc_types   = vc.get("type", [])
        vc_type    = vc_types[-1] if vc_types else entry["stage"]

        # Check 1: signature
        sig_ok = False
        jws = proof.get("jws", "")
        if actor and jws and jws not in ("MOCK_SIGNATURE_PLACEHOLDER", "UNREGISTERED_ISSUER", ""):
            signing_input = json.dumps({
                "id": cid, "type": vc_type, "issuer": issuer_did,
                "issuanceDate": vc.get("issuanceDate", ""),
                "credentialSubject": vc.get("credentialSubject", {}),
            }, sort_keys=True).encode()
            sig_ok = actor.verify(signing_input, jws)

        # Check 2: revocation
        _, revoked = status_list.lookup_by_credential_id(cid)

        # Check 3: issuer role
        issuer_registered = actor is not None
        issuer_role_ok    = actor.can_issue(vc_type) if actor else False

        # Check 4: temporal ordering vs previous stage
        temporal_ok = True
        if i > 0:
            prev_d = _parse_date(lifecycle[i - 1].get("date", ""))
            this_d = _parse_date(entry.get("date", ""))
            if prev_d and this_d and this_d < prev_d:
                temporal_ok = False

        checks = {
            "signature_valid":   sig_ok,
            "not_revoked":       not revoked,
            "issuer_registered": issuer_registered,
            "issuer_role_valid": issuer_role_ok,
            "temporal_order":    temporal_ok,
        }
        errors = []
        if not sig_ok:            errors.append("Signature could not be verified")
        if revoked:               errors.append("Credential has been revoked")
        if not issuer_registered: errors.append(f"Issuer '{issuer_did}' not in actor registry")
        if not issuer_role_ok:    errors.append("Issuer role not authorised for this credential type")
        if not temporal_ok:       errors.append("Stage date precedes previous stage date")

        cred_valid = not revoked and issuer_registered and temporal_ok
        if not cred_valid:
            overall_valid = False

        credentials_report.append({
            "credential_id": cid,
            "type":         vc_type,
            "stage":        entry["stage"],
            "issuer":       issuer_did,
            "issuer_name":  actor.name if actor else issuer_did,
            "issuer_role":  actor.role if actor else "unknown",
            "issuer_tier":  actor.tier if actor else 99,
            "valid":        cred_valid,
            "checks":       checks,
            "errors":       errors,
            "trust_signals": vc.get("trustSignals", {}),
        })

    return {
        "product_id":        product_id,
        "overall_valid":     overall_valid,
        "total_credentials": len(lifecycle),
        "credentials":       credentials_report,
    }


@app.get("/status-list")
def get_status_list():
    root = actors_module.get_actor("did:dpp:root-authority")
    return status_list.status_list_vc(root.did if root else "did:dpp:root-authority")

@app.get("/status-list/entries")
def list_status_entries():
    return status_list.list_all()

class RevokeRequest(BaseModel):
    reason: Optional[str] = "Revoked by issuer"

@app.post("/credentials/{credential_id}/revoke")
def revoke_credential(credential_id: str, body: RevokeRequest = RevokeRequest(), _actor=Depends(require_auth)):
    idx, _ = status_list.lookup_by_credential_id(credential_id)
    if idx is None:
        raise HTTPException(404, detail="Credential not found in status list")

    # Revocation is restricted to: Tier 0 root, Tier 1 regulator, or the original credential issuer
    is_elevated = _actor.can_issue("*")  # True for tier0 root and tier1 regulator
    entry = credential_index.get(credential_id)
    is_original_issuer = entry and entry.get("issuer_did") == _actor.did
    if not is_elevated and not is_original_issuer:
        raise HTTPException(403, detail=(
            f"Role '{_actor.role}' cannot revoke this credential. "
            f"Only the original issuer ({entry.get('issuer_did', 'unknown') if entry else 'unknown'}) "
            f"or a Tier 0/1 authority can revoke credentials."
        ))

    status_list.revoke(idx)
    _log("CREDENTIAL_REVOKED", _actor.did, f"Revoked: {credential_id}", entry.get("product_id") if entry else None)
    return {"credential_id": credential_id, "revoked": True,
            "reason": body.reason, "status_index": idx,
            "revoked_by": _actor.did}

@app.get("/credentials/{credential_id}/status")
def check_credential_status(credential_id: str):
    idx, revoked = status_list.lookup_by_credential_id(credential_id)
    if idx is None:
        raise HTTPException(404, detail="Credential not found in status list")
    return {"credential_id": credential_id, "status_index": idx, "revoked": revoked}

class SignRequest(BaseModel):
    did: str
    challenge: str

@app.post("/auth/sign")
def auth_sign(body: SignRequest):
    """
    Demo wallet endpoint: signs a challenge with the actor's server-held Ed25519 private key.
    In production this step is done client-side by a hardware wallet or browser extension.
    The challenge must have been issued by POST /auth/challenge for this DID.
    """
    import time
    actor = actors_module.get_actor(body.did)
    if not actor:
        raise HTTPException(404, detail=f"Unknown actor DID: {body.did}")
    entry = actors_module._challenges.get(body.challenge)
    if not entry or entry["did"] != body.did:
        raise HTTPException(400, detail="Unknown or expired challenge for this DID.")
    if time.time() > entry["expires"]:
        actors_module._challenges.pop(body.challenge, None)
        raise HTTPException(400, detail="Challenge expired. Request a new one.")
    signature = actor.sign(body.challenge.encode())
    return {"signature": signature, "did": body.did}

@app.get("/actors")
def list_actors():
    actor_list = [a.to_public_dict() for a in actors_module.ACTOR_REGISTRY.values()]
    return {"actors": actor_list, "total": len(actor_list)}

@app.get("/actors/{did:path}")
def get_actor_endpoint(did: str):
    actor = actors_module.get_actor(did)
    if not actor:
        raise HTTPException(404, detail="Actor not found")
    return actor.to_public_dict()

class ChallengeRequest(BaseModel):
    did: str

class AuthVerifyRequest(BaseModel):
    did: str
    challenge: str
    signature: str

@app.post("/auth/challenge")
def auth_challenge(body: ChallengeRequest):
    try:
        nonce = actors_module.create_challenge(body.did)
    except ValueError as e:
        raise HTTPException(404, detail=str(e))
    return {
        "challenge": nonce,
        "did": body.did,
        "expires_in_seconds": 300,
        "instructions": "Sign the challenge string with your Ed25519 private key "
                        "and POST base64-encoded signature to /auth/verify.",
    }

@app.post("/auth/verify")
def auth_verify(body: AuthVerifyRequest):
    token = actors_module.verify_challenge(body.did, body.challenge, body.signature)
    if not token:
        raise HTTPException(401, detail="Invalid or expired challenge signature")
    actor = actors_module.get_actor(body.did)
    return {
        "token": token,
        "did":   body.did,
        "actor": actor.to_public_dict() if actor else None,
        "message": "Pass token as 'Authorization: Bearer <token>' on subsequent requests.",
    }

# ── Actor registration ────────────────────────────────────────────────────────

ROLE_MAP = {
    "factory":   actors_module.TIER2_FACTORY,
    "supplier":  actors_module.TIER2_SUPPLIER,
    "logistics": actors_module.TIER2_LOGISTICS,
    "certifier": actors_module.TIER1_CERTIFIER,
    "recycler":  actors_module.TIER1_RECYCLER,
    "regulator": actors_module.TIER1_REGULATOR,
}
TIER1_ROLES = {actors_module.TIER1_CERTIFIER, actors_module.TIER1_RECYCLER, actors_module.TIER1_REGULATOR}

class RegisterRequest(BaseModel):
    role: str            # factory | supplier | logistics | certifier | recycler | regulator
    name: str
    os_id: Optional[str] = None
    email: Optional[str] = None

@app.post("/register")
def register_actor(body: RegisterRequest):
    """
    Self-service actor registration.
    Tier 2 roles are activated immediately.
    Tier 1 roles are placed in a pending queue for root approval.
    Returns the private key ONCE — it is never stored server-side after this call.
    """
    role = ROLE_MAP.get(body.role)
    if not role:
        raise HTTPException(400, detail=f"Unknown role '{body.role}'. Valid: {list(ROLE_MAP.keys())}")

    # Build DID
    if body.os_id:
        did = f"did:dpp:{body.os_id.lower()}"
    else:
        import secrets as _s
        did = f"did:dpp:{body.role}-{_s.token_hex(4)}"

    if did in actors_module.ACTOR_REGISTRY:
        raise HTTPException(409, detail=f"Actor '{did}' already registered.")

    root_did = "did:dpp:root-authority"
    new_actor = actors_module._new_actor(did, body.name, role, approved_by=None)
    private_key_b64 = new_actor.export_private_key_b64()

    if role in TIER1_ROLES:
        # Queue for approval — not added to registry yet
        actors_module._pending_registrations.append({
            "did":    did,
            "name":   body.name,
            "role":   role,
            "email":  body.email,
            "actor":  new_actor,
            "submitted": datetime.now(timezone.utc).isoformat(),
        })
        _log("ACTOR_PENDING_APPROVAL", did, f"Tier1 registration: {role}")
        return {
            "status":      "pending",
            "did":         did,
            "name":        body.name,
            "role":        role,
            "private_key": private_key_b64,
            "public_key":  new_actor.public_key_b64,
            "note":        "Your account requires approval by the root authority. "
                           "You will be notified when activated.",
        }
    else:
        # Tier 2 — activate immediately
        actors_module.ACTOR_REGISTRY[did] = new_actor
        _log("ACTOR_REGISTERED", did, f"Tier2 self-registration: {role}")
        # Issue a session token immediately
        import secrets as _s
        token = _s.token_hex(32)
        actors_module._tokens[token] = did
        return {
            "status":      "active",
            "did":         did,
            "name":        body.name,
            "role":        role,
            "private_key": private_key_b64,
            "public_key":  new_actor.public_key_b64,
            "token":       token,
            "actor":       new_actor.to_public_dict(),
            "note":        "Registration complete. Save your private key — it is shown only once.",
        }

# ── Dashboard endpoints ───────────────────────────────────────────────────────

@app.get("/dashboard/my-products")
def my_products(_actor=Depends(require_auth)):
    """Return all products issued by the authenticated actor's DID."""
    result = []
    for product_id, stages in lifecycle_store.items():
        if any(s.get("issuer_did") == _actor.did for s in stages):
            result.append({
                "product_id":    product_id,
                "stage_count":   len(stages),
                "current_stage": stages[-1]["stage"] if stages else "Unknown",
                "issued_date":   stages[0]["date"] if stages else None,
                "has_warning":   not all(
                    not status_list.lookup_by_credential_id(s.get("credential_id", ""))[1]
                    for s in stages
                ),
            })
    return {"actor": _actor.to_public_dict(), "products": result, "total": len(result)}

@app.get("/dashboard/recent-activity")
def recent_activity(_actor=Depends(require_auth), limit: int = Query(20, ge=1, le=100)):
    """Return recent audit log entries for this actor."""
    entries = [e for e in reversed(audit_log) if e.get("actor_did") == _actor.did]
    return {"entries": entries[:limit]}

# ── Key rotation ──────────────────────────────────────────────────────────────

@app.post("/actors/{did:path}/rotate-key")
def rotate_key(did: str, _actor=Depends(require_auth)):
    """
    Rotate the keypair for the authenticated actor's own DID only.
    Returns the new private key once. Old credentials remain valid (signed with old key).
    """
    if _actor.did != did:
        raise HTTPException(403, detail="You can only rotate your own keys.")
    actor = actors_module.get_actor(did)
    if not actor:
        raise HTTPException(404, detail="Actor not found.")
    new_private_key_b64 = actor.rotate_key()
    # Invalidate all existing tokens for this actor (force re-login with new key)
    to_remove = [t for t, d in actors_module._tokens.items() if d == did]
    for t in to_remove:
        del actors_module._tokens[t]
    _log("KEY_ROTATED", did, "Keypair rotated; all sessions invalidated")
    return {
        "did":         did,
        "new_public_key": actor.public_key_b64,
        "new_private_key": new_private_key_b64,
        "note":        "New private key shown once. All previous sessions have been invalidated. "
                       "Old credentials remain valid — they were signed with the previous key.",
    }

# ── Admin endpoints (Tier 0 only) ────────────────────────────────────────────

def require_root(_actor=Depends(require_auth)):
    if _actor.role != actors_module.TIER0_ROOT:
        raise HTTPException(403, detail="Root authority access required.")
    return _actor

@app.get("/admin/pending-approvals")
def admin_pending(_actor=Depends(require_root)):
    return {
        "pending": [
            {k: v for k, v in p.items() if k != "actor"}
            for p in actors_module._pending_registrations
        ],
        "total": len(actors_module._pending_registrations),
    }

@app.post("/admin/approve/{did:path}")
def admin_approve(did: str, _actor=Depends(require_root)):
    for i, p in enumerate(actors_module._pending_registrations):
        if p["did"] == did:
            new_actor = p["actor"]
            new_actor.approved_by = _actor.did
            actors_module.ACTOR_REGISTRY[did] = new_actor
            actors_module._pending_registrations.pop(i)
            _log("ACTOR_APPROVED", _actor.did, f"Approved {did}")
            return {"approved": did, "actor": new_actor.to_public_dict()}
    raise HTTPException(404, detail=f"No pending registration for DID: {did}")

@app.post("/admin/reject/{did:path}")
def admin_reject(did: str, _actor=Depends(require_root)):
    for i, p in enumerate(actors_module._pending_registrations):
        if p["did"] == did:
            actors_module._pending_registrations.pop(i)
            _log("ACTOR_REJECTED", _actor.did, f"Rejected {did}")
            return {"rejected": did}
    raise HTTPException(404, detail=f"No pending registration for DID: {did}")

@app.get("/admin/audit-log")
def admin_audit_log(limit: int = Query(50, ge=1, le=500), _actor=Depends(require_root)):
    return {"entries": list(reversed(audit_log))[:limit], "total": len(audit_log)}

@app.post("/admin/revoke-actor/{did:path}")
def admin_revoke_actor(did: str, _actor=Depends(require_root)):
    """Remove an actor from the registry and invalidate all their tokens."""
    if did not in actors_module.ACTOR_REGISTRY:
        raise HTTPException(404, detail=f"Actor not found: {did}")
    del actors_module.ACTOR_REGISTRY[did]
    to_remove = [t for t, d in actors_module._tokens.items() if d == did]
    for t in to_remove:
        del actors_module._tokens[t]
    _log("ACTOR_REVOKED", _actor.did, f"Actor removed from registry: {did}")
    return {"revoked_actor": did, "sessions_cleared": len(to_remove)}
