"""
Digital Product Passport — FastAPI backend

Trust tiers:
  Tier 0  Root authority
  Tier 1  Verified third parties: certifiers, recyclers, regulators
  Tier 2  Dataset-anchored actors: factories, suppliers, logistics

All state persisted in PostgreSQL. Credentials pinned to IPFS via Pinata
and anchored on Polygon Amoy testnet.
"""

from __future__ import annotations
import json
import os
import uuid
import secrets
from datetime import datetime, timezone, date as date_type, timedelta
from pydantic import BaseModel
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from eth_account import Account
from eth_account.messages import encode_defunct

from models import (
    MaterialSourcingRecord, CertificationRecord, CustodyTransfer,
    OwnershipRecord, RepairRecord, EndOfLifeRecord,
    MaterialMintRequest, ProductComposeRequest
)
import actors as actors_module
import status_list
import pinata
import polygon
from actors import (
    DEMO_CERTIFIER_DID, DEMO_RECYCLER_DID,
    DEMO_SUPPLIER_DID, DEMO_LOGISTICS_DID,
    DEMO_FACTORY_DID,
)

from sqlalchemy.orm import Session
from database.connection import get_db, init_db, SessionLocal
from database.models import (
    Product, LifecycleStage, FactoryProduct, AuditLogEntry,
    AuthChallenge,
    CredentialStatus, StatusListMeta, MaterialToken,
)

app = FastAPI(title="Digital Product Passport API", version="3.0.0")

CORS_ORIGIN = os.getenv("CORS_ORIGIN", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


CSV_PATH = os.getenv("CSV_PATH", "../data/factory_data.csv")
MATERIALS_PATH = os.getenv("MATERIALS_PATH", "../data/MOCK_DATA (3).csv")
PRODUCTION_PATH = os.getenv(
    "PRODUCTION_PATH", "../data/y1AQEIpMTR2j7xgr9MH0_Manufacturing Dataset.csv")
SIWE_DOMAIN = os.getenv("SIWE_DOMAIN", "localhost")
SIWE_URI = os.getenv("SIWE_URI", "http://localhost:3000")
SIWE_CHAIN_ID = int(os.getenv("SIWE_CHAIN_ID", "80002"))


@app.on_event("startup")
def startup_event():
    init_db()


# ── Auth ─────────────────────────────────────────────────────────────────────
_bearer = HTTPBearer(auto_error=False)


def require_auth(creds: HTTPAuthorizationCredentials = Security(_bearer)):
    if not creds or not creds.credentials:
        raise HTTPException(401, detail="Authentication required. "
                            "Obtain a token via POST /auth/siwe/challenge → /auth/siwe/verify.")
    actor = actors_module.resolve_token(creds.credentials)
    if not actor:
        raise HTTPException(403, detail="Invalid or expired token.")
    return actor


def optional_auth(creds: HTTPAuthorizationCredentials = Security(_bearer)):
    if not creds or not creds.credentials:
        return None
    return actors_module.resolve_token(creds.credentials)


def _log(event: str, actor_did: str = None, detail: str = None, product_id: str = None):
    db = SessionLocal()
    try:
        entry = AuditLogEntry(
            ts=datetime.now(timezone.utc),
            event=event,
            actor_did=actor_did,
            product_id=product_id,
            detail=detail,
        )
        db.add(entry)
        db.commit()
    finally:
        db.close()


# ── IPFS + Polygon helper ───────────────────────────────────────────────────

def _anchor_credential(credential_id: str, vc_payload: dict, vc_type: str) -> tuple[Optional[str], Optional[str]]:
    """Pin to IPFS and anchor on Polygon. Returns (ipfs_cid, tx_hash)."""
    ipfs_cid = pinata.pin_credential(credential_id, vc_payload)
    tx_hash = None
    if ipfs_cid:
        tx_hash = polygon.anchor_credential(credential_id, ipfs_cid, vc_type)
    return ipfs_cid, tx_hash


def _save_stage(db: Session, product_id: str, stage: str, stage_date,
                issuer_did: str, issuer_name: str, credential_id: str,
                vc_type: str, vc_payload: dict, current_stage: str = None,
                precomputed_ipfs_cid: Optional[str] = None,
                precomputed_tx_hash: Optional[str] = None):
    """Create LifecycleStage row, pin to IPFS, anchor on Polygon."""
    if precomputed_ipfs_cid:
        ipfs_cid = precomputed_ipfs_cid
        tx_hash = precomputed_tx_hash
    else:
        ipfs_cid, tx_hash = _anchor_credential(credential_id, vc_payload, vc_type)

    ls = LifecycleStage(
        product_id=product_id,
        stage=stage,
        stage_date=_parse_date(stage_date) if isinstance(
            stage_date, str) else stage_date,
        issuer_did=issuer_did,
        issuer_name=issuer_name,
        credential_id=credential_id,
        vc_type=vc_type,
        vc_payload=vc_payload,
        ipfs_cid=ipfs_cid,
        tx_hash=tx_hash,
    )
    db.add(ls)

    if current_stage:
        db.query(Product).filter(Product.product_id == product_id).update(
            {"current_stage": current_stage})

    # Update credential status with CID
    if ipfs_cid:
        db.query(CredentialStatus).filter(
            CredentialStatus.credential_id == credential_id
        ).update({"ipfs_cid": ipfs_cid})

    db.commit()
    return ipfs_cid, tx_hash


# ── Data helpers ─────────────────────────────────────────────────────────────

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

FACTORY_CSV_FIELDS = {"name", "address", "country_code", "country_name", "sector",
                      "product_type", "facility_type", "lat", "lng"}
MATERIAL_CSV_FIELDS = {"raw_material_id", "supplier", "supplier_location",
                       "cost_per_unit", "description"}


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
        try:
            return int(raw.split("-")[0])
        except:
            return 0
    try:
        return int(raw)
    except:
        return 0


def make_did(identifier: str) -> str:
    return f"did:dpp:{identifier.lower().replace(' ', '-')}"


def _get_lifecycle_stages(product_id: str, db: Session) -> list[dict]:
    stages = db.query(LifecycleStage).filter(
        LifecycleStage.product_id == product_id
    ).order_by(LifecycleStage.created_at).all()
    return [
        {
            "stage": s.stage,
            "date": s.stage_date.isoformat() if s.stage_date else None,
            "issuer": s.issuer_name,
            "issuer_did": s.issuer_did,
            "credential_id": s.credential_id,
            "credential": s.vc_payload,
            "ipfs_cid": s.ipfs_cid,
            "tx_hash": s.tx_hash,
        }
        for s in stages
    ]


def get_stage_names(product_id: str) -> list[str]:
    db = SessionLocal()
    try:
        stages = _get_lifecycle_stages(product_id, db)
        return [s["stage"] for s in stages]
    finally:
        db.close()


def _parse_date(d):
    try:
        return date_type.fromisoformat(str(d)[:10])
    except Exception:
        return None


def _redact_did(did: str) -> str:
    if not did:
        return "did:unknown:***"
    parts = did.split(":")
    if len(parts) >= 3:
        method = parts[1]
        ident = parts[-1]
        tail = ident[-4:] if len(ident) >= 4 else ident
        return f"did:{method}:***{tail}"
    tail = did[-4:] if len(did) >= 4 else did
    return f"***{tail}"


def _can_view_owner_did(viewer, owner_did: str) -> bool:
    if not viewer:
        return False
    if getattr(viewer, "tier", 99) <= 1:
        return True
    return getattr(viewer, "did", None) == owner_did


def _normalize_actor_did(value: Optional[str]) -> Optional[str]:
    text = (value or "").strip()
    if not text:
        return None
    if text.startswith("did:"):
        return text.lower() if text.startswith("did:ethr:") else text
    lowered = text.lower()
    if lowered.startswith("0x") and len(lowered) == 42:
        return f"did:ethr:{lowered}"
    return None


def _build_trust_signals(subject: dict, csv_fields: set, actor) -> dict:
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
        "issuer_role":     actor.role if actor else "unknown",
        "issuer_tier":     actor.tier if actor else 99,
        "issuer_verified": actor is not None and actor.approved_by is not None,
        "approved_by":     actor.approved_by if actor else None,
        "field_signals":   field_signals,
    }


def make_vc(issuer_did: str, subject: dict, vc_type: str,
            csv_fields: set = None, product_id: str = "") -> dict:
    actor = actors_module.get_actor(issuer_did)
    cred_id = f"urn:credential:{uuid.uuid4()}"
    now = datetime.now(timezone.utc).isoformat()

    trust_signals = _build_trust_signals(subject, csv_fields or set(), actor)
    sl_index = status_list.allocate_index(cred_id, product_id, vc_type)

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
    db = SessionLocal()
    try:
        stages = get_stage_names(product_id)
        existing = _get_lifecycle_stages(product_id, db)

        if not stages:
            raise HTTPException(422,
                                detail=f"Product '{product_id}' has no Birth Certificate. "
                                f"Issue one first via POST /issue-birth-certificate/{{os_id}}.")

        for entry in existing:
            _, revoked = status_list.lookup_by_credential_id(
                entry.get("credential_id", ""))
            if revoked:
                raise HTTPException(422,
                                    detail=f"Chain compromised: credential '{entry['credential_id']}' "
                                    f"(stage '{entry['stage']}') has been revoked.")

        if new_date and existing:
            last_d = _parse_date(existing[-1].get("date", ""))
            new_d = _parse_date(new_date)
            if last_d and new_d and new_d < last_d:
                raise HTTPException(422,
                                    detail=f"Temporal violation: '{new_date}' is earlier than last stage '{existing[-1]['date']}'.")

        if issuer_did and vc_type:
            try:
                actors_module.require_actor(issuer_did, vc_type)
            except ValueError as exc:
                raise HTTPException(403, detail=str(exc))
    finally:
        db.close()


def bridge_product_context(os_id: str, product_category: str) -> dict:
    bridge: dict = {}
    material_types = CATEGORY_MATERIAL_MAP.get(product_category, [])
    try:
        df_mat = load_materials()
        mask = df_mat["description"].str.lower().isin([m.lower()
                                                       for m in material_types])
        bridge["suggested_materials"] = (
            df_mat[mask][["raw_material_id", "description", "supplier",
                          "supplier_location", "cost_per_unit"]]
            .head(3).fillna("").to_dict(orient="records")
        )
        bridge["avg_material_cost"] = round(float(
            df_mat[mask]["cost_per_unit"].mean()), 2) if not df_mat[mask].empty else None
    except Exception:
        bridge["suggested_materials"] = []

    prod_type_key = CATEGORY_TO_PROD_TYPE.get(product_category, "Appliances")
    try:
        df_prod = load_production()
        subset = df_prod[df_prod["product_type"] == prod_type_key]
        if not subset.empty:
            bridge["production_stats"] = {
                "total_runs":        int(len(subset)),
                "avg_scrap_rate":    round(float(subset["scrap_rate"].mean()), 4),
                "avg_cost_per_unit": round(float(subset["material_cost_per_unit"].mean()), 2),
            }
    except Exception:
        pass
    return bridge


# ── Factory endpoints ────────────────────────────────────────────────────────

@app.get("/factories")
def list_factories(limit: int = Query(20, ge=1, le=200)):
    df = load_factories()
    cols = ["os_id", "name", "address", "country_name", "sector", "product_type",
            "facility_type", "number_of_workers", "is_closed", "lat", "lng"]
    records = df[[c for c in cols if c in df.columns]].head(
        limit).fillna("").to_dict(orient="records")
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
    db = SessionLocal()
    try:
        fp_entries = db.query(FactoryProduct).filter(
            FactoryProduct.os_id == os_id).all()
        product_ids = [fp.product_id for fp in fp_entries]

        result = []
        for pid in product_ids:
            stages = _get_lifecycle_stages(pid, db)
            result.append({
                "product_id":    pid,
                "stage_count":   len(stages),
                "current_stage": stages[-1]["stage"] if stages else "Unknown",
                "issued_date":   stages[0]["date"] if stages else None,
            })
        return {"os_id": os_id, "total": len(result), "products": result}
    finally:
        db.close()


@app.get("/suggest-materials/{os_id}")
def suggest_materials(os_id: str, limit: int = Query(5, ge=1, le=20)):
    df_factories = load_factories()
    row = df_factories[df_factories["os_id"] == os_id]
    if row.empty:
        raise HTTPException(404, detail="Factory not found")
    f = row.fillna("").iloc[0].to_dict()
    category = detect_product_category(
        str(f.get("sector", "")), str(f.get("product_type", "")))
    material_types = CATEGORY_MATERIAL_MAP.get(category, ["fabric", "plastic"])
    df_mat = load_materials()
    mask = df_mat["description"].str.lower().isin([m.lower()
                                                   for m in material_types])
    suggestions = (
        df_mat[mask][["raw_material_id", "description",
                      "supplier", "supplier_location", "cost_per_unit"]]
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
    f = row.fillna("").iloc[0].to_dict()
    category = detect_product_category(
        str(f.get("sector", "")), str(f.get("product_type", "")))
    prod_type = CATEGORY_TO_PROD_TYPE.get(category, "Appliances")
    df = load_production()
    subset = df[df["product_type"] == prod_type].copy(
    ).sort_values("date", ascending=False)
    recent = subset.head(limit).fillna(0).copy()
    recent["date"] = recent["date"].dt.strftime("%Y-%m-%d")
    agg = subset.agg({
        "units_produced": "mean", "defects": "mean", "scrap_rate": "mean",
        "production_time_hours": "mean", "energy_consumption_kwh": "mean",
        "quality_checks_failed": "mean", "material_cost_per_unit": "mean",
    }).round(2).to_dict()
    return {"os_id": os_id, "factory_name": f.get("name", ""), "product_category": category,
            "mapped_prod_type": prod_type, "total_runs": int(len(subset)),
            "averages": agg, "recent_runs": recent.to_dict(orient="records")}


# ── Credential issuance endpoints ────────────────────────────────────────────

@app.post("/mint-raw-material")
def api_mint_raw_material(record: MaterialMintRequest, _actor=Depends(require_auth)):
    if not _actor.can_issue("RawMaterialCredential"):
        raise HTTPException(403, detail="Role is not authorised to mint raw material credentials.")

    if record.quantity_kg <= 0:
        raise HTTPException(422, detail="quantity_kg must be greater than zero.")

    mint_quantity = int(record.quantity_kg)
    if float(record.quantity_kg) != float(mint_quantity):
        raise HTTPException(
            422,
            detail="quantity_kg must be a whole number for ERC-1155 minting in this prototype.",
        )

    if not pinata.is_available():
        raise HTTPException(
            503,
            detail="Pinata IPFS is not configured. Set PINATA_JWT to enable real metadata uploads.",
        )

    if not polygon.is_available():
        raise HTTPException(
            503,
            detail="Polygon relayer is not configured. Set POLYGON_PRIVATE_KEY and POLYGON_CONTRACT_ADDRESS.",
        )

    product_id = f"urn:material:{uuid.uuid4()}"
    mint_date = datetime.now(timezone.utc).isoformat()

    # 1. Build VC payload.
    subject = {
        "id": product_id,
        "material_type": record.material_type,
        "quantity_kg": record.quantity_kg,
        "mint_date": mint_date,
        "extractor_did": _actor.did,
    }
    vc = make_vc(_actor.did, subject, "RawMaterialCredential", product_id=product_id)

    # 2. Upload VC JSON to IPFS and derive metadata URI.
    ipfs_cid = pinata.pin_credential(vc["id"], vc)
    if not ipfs_cid:
        raise HTTPException(502, detail="Failed to upload VC metadata to Pinata IPFS.")
    metadata_uri = f"ipfs://{ipfs_cid}"

    # 3. Mint on-chain token with real IPFS metadata URI.
    token_id, tx_hash = polygon.mint_material(mint_quantity, metadata_uri)
    if not tx_hash:
        raise HTTPException(
            502,
            detail="Polygon mint failed (contract reverted or tx failed). Verify POLYGON_CONTRACT_ADDRESS points to MaterialComposition and relayer has MATIC.",
        )

    db = SessionLocal()
    try:
        product = Product(
            product_id=product_id, os_id="RAW_MATERIAL_ORIGIN",
            category="RawMaterial", current_stage="Minted",
        )
        db.add(product)
        db.flush()

        # Write DAG node (leaf — no parents)
        dag_node = MaterialToken(
            token_id=token_id,
            product_id=product_id,
            material_type=record.material_type,
            quantity=mint_quantity,
            owner_did=_actor.did,
            tx_hash=tx_hash,
            parent_token_ids=[],
            metadata_uri=metadata_uri,
            is_burned=False,
        )
        db.add(dag_node)

        _save_stage(
            db, product_id, "Raw Material Minted", mint_date,
            _actor.did, _actor.name, vc["id"],
            "RawMaterialCredential", vc, "Minted",
            precomputed_ipfs_cid=ipfs_cid,
            precomputed_tx_hash=tx_hash,
        )
    finally:
        db.close()

    _log("MATERIAL_MINTED", _actor.did, f"Token {token_id}", product_id)
    return {
        "product_id": product_id,
        "token_id": token_id,
        "credential": vc,
        "ipfs_cid": ipfs_cid,
        "metadata_uri": metadata_uri,
        "tx_hash": tx_hash,
    }


@app.post("/compose-product")
def api_compose_product(record: ProductComposeRequest, _actor=Depends(require_auth)):
    if not _actor.can_issue("ProductCompositionCredential"):
        raise HTTPException(403, detail="Role is not authorised to compose product credentials.")

    if not record.consumed_token_ids:
        raise HTTPException(422, detail="At least one consumed token is required.")

    if len(record.consumed_token_ids) != len(record.consumed_amounts):
        raise HTTPException(422, detail="consumed_token_ids and consumed_amounts length mismatch.")

    if record.new_quantity <= 0:
        raise HTTPException(422, detail="new_quantity must be greater than zero.")

    if any(a <= 0 for a in record.consumed_amounts):
        raise HTTPException(422, detail="All consumed amounts must be greater than zero.")

    if len(set(record.consumed_token_ids)) != len(record.consumed_token_ids):
        raise HTTPException(422, detail="Duplicate token ids are not allowed in one compose operation.")

    if not pinata.is_available():
        raise HTTPException(
            503,
            detail="Pinata IPFS is not configured. Set PINATA_JWT to enable real metadata uploads.",
        )

    if not polygon.is_available():
        raise HTTPException(
            503,
            detail="Polygon relayer is not configured. Set POLYGON_PRIVATE_KEY and POLYGON_CONTRACT_ADDRESS.",
        )

    # Validate that all consumed tokens exist and are not already burned
    parent_by_id = {}
    is_elevated = _actor.tier <= 1
    db = SessionLocal()
    try:
        parents = db.query(MaterialToken).filter(
            MaterialToken.token_id.in_(record.consumed_token_ids)
        ).all()
        parent_by_id = {p.token_id: p for p in parents}

        for tid, burn_amount in zip(record.consumed_token_ids, record.consumed_amounts):
            parent = parent_by_id.get(tid)
            if not parent:
                raise HTTPException(
                    404, detail=f"Token {tid} not found in the DAG.")
            if parent.is_burned:
                raise HTTPException(
                    400, detail=f"Token {tid} has already been consumed.")
            if not is_elevated and parent.owner_did != _actor.did:
                raise HTTPException(
                    403,
                    detail=f"Token {tid} is not owned by the current actor.",
                )
            if burn_amount > parent.quantity:
                raise HTTPException(
                    422,
                    detail=f"Token {tid} burn amount exceeds available quantity ({parent.quantity}).",
                )
    finally:
        db.close()

    product_id = f"urn:product:{uuid.uuid4()}"
    compose_date = datetime.now(timezone.utc).isoformat()
    subject = {
        "id": product_id,
        "product_type": record.new_product_type,
        "quantity": record.new_quantity,
        "consumed_tokens": record.consumed_token_ids,
        "compose_date": compose_date,
        "manufacturer_did": _actor.did,
    }
    vc = make_vc(
        _actor.did,
        subject,
        "ProductCompositionCredential",
        product_id=product_id,
    )

    ipfs_cid = pinata.pin_credential(vc["id"], vc)
    if not ipfs_cid:
        raise HTTPException(502, detail="Failed to upload VC metadata to Pinata IPFS.")
    metadata_uri = f"ipfs://{ipfs_cid}"

    token_id, tx_hash = polygon.compose_material(
        record.consumed_token_ids,
        record.consumed_amounts,
        record.new_quantity,
        metadata_uri,
    )
    if not tx_hash:
        raise HTTPException(
            502,
            detail="Polygon compose failed (contract reverted or tx failed). Verify POLYGON_CONTRACT_ADDRESS, token inputs, and relayer balance.",
        )

    db = SessionLocal()
    try:
        product = Product(
            product_id=product_id, os_id="COMPOSED_PRODUCT",
            category=record.new_product_type, current_stage="Composed",
        )
        db.add(product)
        db.flush()

        # Write DAG node (internal — has parents)
        dag_node = MaterialToken(
            token_id=token_id,
            product_id=product_id,
            material_type=record.new_product_type,
            quantity=record.new_quantity,
            owner_did=_actor.did,
            tx_hash=tx_hash,
            parent_token_ids=record.consumed_token_ids,
            metadata_uri=metadata_uri,
            is_burned=False,
        )
        db.add(dag_node)

        # Mark consumed tokens as burned; this guard avoids stale double-consume updates.
        for tid in record.consumed_token_ids:
            q = db.query(MaterialToken).filter(
                MaterialToken.token_id == tid,
                MaterialToken.is_burned == False,
            )
            if not is_elevated:
                q = q.filter(MaterialToken.owner_did == _actor.did)
            updated = q.update({"is_burned": True})
            if updated != 1:
                raise HTTPException(
                    409,
                    detail=f"Token {tid} state changed during compose; retry the operation.",
                )

        _save_stage(
            db, product_id, "Product Composed", compose_date,
            _actor.did, _actor.name, vc["id"],
            "ProductCompositionCredential", vc, "Composed",
            precomputed_ipfs_cid=ipfs_cid,
            precomputed_tx_hash=tx_hash,
        )
    finally:
        db.close()

    _log("PRODUCT_COMPOSED", _actor.did, f"Token {token_id}", product_id)
    return {
        "product_id": product_id,
        "token_id": token_id,
        "credential": vc,
        "ipfs_cid": ipfs_cid,
        "metadata_uri": metadata_uri,
        "tx_hash": tx_hash,
    }


@app.get("/product/{product_id:path}/provenance-tree")
def get_provenance_tree(product_id: str, _viewer=Depends(optional_auth)):
    """Recursively trace backward through the composition DAG from a product to all its raw material origins."""
    db = SessionLocal()
    try:
        token = db.query(MaterialToken).filter(
            MaterialToken.product_id == product_id).first()
        if not token:
            raise HTTPException(
                404, detail="No material token found for this product.")

        def _build_tree(tok: MaterialToken, depth: int = 0) -> dict:
            latest_stage = db.query(LifecycleStage).filter(
                LifecycleStage.product_id == tok.product_id
            ).order_by(LifecycleStage.created_at.desc()).first()

            owner_visible = _can_view_owner_did(_viewer, tok.owner_did)

            node = {
                "token_id": tok.token_id,
                "product_id": tok.product_id,
                "material_type": tok.material_type,
                "quantity": tok.quantity,
                "owner_did": tok.owner_did if owner_visible else _redact_did(tok.owner_did),
                "owner_redacted": not owner_visible,
                "tx_hash": tok.tx_hash,
                "metadata_uri": tok.metadata_uri,
                "credential_id": latest_stage.credential_id if latest_stage else None,
                "ipfs_cid": latest_stage.ipfs_cid if latest_stage else None,
                "is_burned": tok.is_burned,
                "is_raw_material": not tok.parent_token_ids,
                "created_at": tok.created_at.isoformat() if tok.created_at else None,
                "children": [],
            }
            if tok.parent_token_ids and depth < 10:
                for parent_id in tok.parent_token_ids:
                    parent = db.query(MaterialToken).filter(
                        MaterialToken.token_id == parent_id).first()
                    if parent:
                        node["children"].append(_build_tree(parent, depth + 1))
            return node

        tree = _build_tree(token)

        # Collect all raw materials (leaf nodes)
        raw_materials = []

        def _collect_leaves(n):
            if n["is_raw_material"]:
                raw_materials.append({
                    "token_id": n["token_id"],
                    "material_type": n["material_type"],
                    "quantity": n["quantity"],
                    "owner_did": n["owner_did"],
                    "owner_redacted": n.get("owner_redacted", True),
                })
            for child in n.get("children", []):
                _collect_leaves(child)
        _collect_leaves(tree)

        return {
            "product_id": product_id,
            "tree": tree,
            "raw_materials": raw_materials,
            "total_depth": _max_depth(tree),
        }
    finally:
        db.close()


def _max_depth(node: dict) -> int:
    if not node.get("children"):
        return 0
    return 1 + max(_max_depth(c) for c in node["children"])


@app.get("/product/{product_id:path}/lineage-aggregation")
def get_lineage_aggregation(product_id: str, _viewer=Depends(optional_auth)):
    """Paper-facing lineage summary: material inheritance, credential coverage, and trust signals."""
    db = SessionLocal()
    try:
        token = db.query(MaterialToken).filter(
            MaterialToken.product_id == product_id
        ).first()
        if not token:
            raise HTTPException(404, detail="No material token found for this product.")

        def _build_tree(tok: MaterialToken, depth: int = 0) -> dict:
            latest_stage = db.query(LifecycleStage).filter(
                LifecycleStage.product_id == tok.product_id
            ).order_by(LifecycleStage.created_at.desc()).first()

            owner_visible = _can_view_owner_did(_viewer, tok.owner_did)

            node = {
                "token_id": tok.token_id,
                "product_id": tok.product_id,
                "material_type": tok.material_type,
                "quantity": tok.quantity,
                "owner_did": tok.owner_did if owner_visible else _redact_did(tok.owner_did),
                "owner_redacted": not owner_visible,
                "tx_hash": tok.tx_hash,
                "metadata_uri": tok.metadata_uri,
                "credential_id": latest_stage.credential_id if latest_stage else None,
                "ipfs_cid": latest_stage.ipfs_cid if latest_stage else None,
                "is_burned": tok.is_burned,
                "is_raw_material": not tok.parent_token_ids,
                "created_at": tok.created_at.isoformat() if tok.created_at else None,
                "children": [],
            }
            if tok.parent_token_ids and depth < 10:
                for parent_id in tok.parent_token_ids:
                    parent = db.query(MaterialToken).filter(
                        MaterialToken.token_id == parent_id
                    ).first()
                    if parent:
                        node["children"].append(_build_tree(parent, depth + 1))
            return node

        tree = _build_tree(token)

        nodes_with_depth: list[tuple[dict, int]] = []
        material_breakdown: dict[str, dict] = {}
        owner_refs: set[str] = set()
        raw_material_nodes = 0
        total_material_quantity = 0.0
        max_depth = 0
        credential_ids: set[str] = set()

        stack = [(tree, 0)]
        while stack:
            node, depth = stack.pop()
            nodes_with_depth.append((node, depth))
            max_depth = max(max_depth, depth)

            if node.get("is_raw_material"):
                raw_material_nodes += 1

            material_type = node.get("material_type") or "Unknown"
            quantity = float(node.get("quantity") or 0)
            total_material_quantity += quantity

            bucket = material_breakdown.setdefault(
                material_type,
                {"material_type": material_type, "token_count": 0, "quantity_total": 0.0},
            )
            bucket["token_count"] += 1
            bucket["quantity_total"] += quantity

            owner_ref = node.get("owner_did")
            if owner_ref:
                owner_refs.add(owner_ref)

            cred_id = node.get("credential_id")
            if cred_id:
                credential_ids.add(cred_id)

            for child in node.get("children", []):
                stack.append((child, depth + 1))

        stage_map: dict[str, LifecycleStage] = {}
        credential_id_list = list(credential_ids)
        if credential_id_list:
            stages = db.query(LifecycleStage).filter(
                LifecycleStage.credential_id.in_(credential_id_list)
            ).all()
            stage_map = {s.credential_id: s for s in stages}

        vc_type_counts: dict[str, int] = {}
        revoked_count = 0
        ipfs_anchored = 0
        tx_anchored = 0
        trust_source_counts = {"csv": 0, "derived": 0, "manual": 0}
        certification_standards: set[str] = set()
        regulation_refs: set[str] = set()
        carbon_emissions_total = 0.0
        carbon_emissions_samples = 0

        for cred_id in credential_id_list:
            _, revoked = status_list.lookup_by_credential_id(cred_id)
            if revoked:
                revoked_count += 1

            stage = stage_map.get(cred_id)
            if not stage:
                continue

            vc_type_counts[stage.vc_type] = vc_type_counts.get(stage.vc_type, 0) + 1

            if stage.ipfs_cid:
                ipfs_anchored += 1
            if stage.tx_hash:
                tx_anchored += 1

            payload = stage.vc_payload or {}
            subject = payload.get("credentialSubject", {}) if isinstance(payload, dict) else {}
            trust = payload.get("trustSignals", {}) if isinstance(payload, dict) else {}

            standard = subject.get("certification_standard")
            if standard:
                certification_standards.add(str(standard))

            regulation = subject.get("eu_regulation_ref")
            if regulation:
                regulation_refs.add(str(regulation))

            carbon = subject.get("carbon_emissions_kg")
            if isinstance(carbon, (int, float)):
                carbon_emissions_total += float(carbon)
                carbon_emissions_samples += 1

            field_signals = trust.get("field_signals", {}) if isinstance(trust, dict) else {}
            if isinstance(field_signals, dict):
                for meta in field_signals.values():
                    if isinstance(meta, dict):
                        source = meta.get("source")
                        if source in trust_source_counts:
                            trust_source_counts[source] += 1

        material_rows = sorted(
            material_breakdown.values(),
            key=lambda x: x["quantity_total"],
            reverse=True,
        )

        type_rows = [
            {"vc_type": vc_type, "count": count}
            for vc_type, count in sorted(vc_type_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        return {
            "product_id": product_id,
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "nodes_total": len(nodes_with_depth),
                "raw_material_nodes": raw_material_nodes,
                "max_depth": max_depth,
                "total_material_quantity": round(total_material_quantity, 4),
                "material_breakdown": material_rows,
            },
            "credential_inheritance": {
                "credentials_total": len(credential_id_list),
                "revoked_credentials": revoked_count,
                "ipfs_anchored_credentials": ipfs_anchored,
                "tx_anchored_credentials": tx_anchored,
                "vc_type_breakdown": type_rows,
                "certification_standards": sorted(certification_standards),
                "regulation_refs": sorted(regulation_refs),
            },
            "esg_rollup": {
                "carbon_emissions_kg_total": round(carbon_emissions_total, 4),
                "carbon_emissions_sample_count": carbon_emissions_samples,
                "trust_signal_sources": trust_source_counts,
            },
            "ownership_view": {
                "owners_total": len(owner_refs),
                "owner_refs": sorted(owner_refs),
                "is_redacted": _viewer is None or (_viewer and _viewer.tier > 1),
            },
        }
    finally:
        db.close()


@app.get("/material-tokens")
def list_material_tokens(_actor=Depends(require_auth)):
    """List material tokens available to the current actor for composition."""
    db = SessionLocal()
    try:
        token_query = db.query(MaterialToken).filter(MaterialToken.is_burned == False)
        if _actor.tier > 1:
            token_query = token_query.filter(MaterialToken.owner_did == _actor.did)
        tokens = token_query.all()
        return [{
            "token_id": t.token_id,
            "product_id": t.product_id,
            "material_type": t.material_type,
            "quantity": t.quantity,
            "owner_did": t.owner_did,
            "is_raw_material": not t.parent_token_ids,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        } for t in tokens]
    finally:
        db.close()


@app.get("/public/ledger/tokens")
def public_ledger_tokens(limit: int = Query(100, ge=1, le=500)):
    """Public ledger view with redacted ownership and no privileged actor details."""
    db = SessionLocal()
    try:
        tokens = db.query(MaterialToken).order_by(
            MaterialToken.created_at.desc()
        ).limit(limit).all()
        return {
            "total": len(tokens),
            "tokens": [{
                "token_id": t.token_id,
                "product_id": t.product_id,
                "material_type": t.material_type,
                "quantity": t.quantity,
                "owner_ref": _redact_did(t.owner_did),
                "is_raw_material": not t.parent_token_ids,
                "is_burned": t.is_burned,
                "tx_hash": t.tx_hash,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            } for t in tokens],
        }
    finally:
        db.close()


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

    f = row.fillna("").iloc[0].to_dict()
    sector = str(f.get("sector", ""))
    prod_type = str(f.get("product_type", ""))
    category = detect_product_category(sector, prod_type)
    serial_no = f"SN-{os_id[-6:]}-{datetime.now().strftime('%Y%m%d')}"
    product_id = f"urn:product:{category.lower().replace(' ', '-')}:{serial_no}"

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

    db = SessionLocal()
    try:
        product = Product(
            product_id=product_id, os_id=os_id,
            category=category, current_stage="Manufactured",
        )
        db.add(product)
        db.flush()  # FK: FactoryProduct references products.product_id
        fp = FactoryProduct(os_id=os_id, product_id=product_id)
        db.add(fp)
        db.flush()

        ipfs_cid, tx_hash = _save_stage(
            db, product_id, "Manufactured", subject["manufacture_date"],
            issuer_did, f.get("name", ""), vc["id"],
            "ProductBirthCertificate", vc, "Manufactured")
    finally:
        db.close()

    _log("CREDENTIAL_ISSUED", issuer_did, "ProductBirthCertificate", product_id)
    return {"product_id": product_id, "credential": vc,
            "ipfs_cid": ipfs_cid, "tx_hash": tx_hash}


@app.post("/add-lifecycle-stage/material-sourcing")
def add_material_sourcing(record: MaterialSourcingRecord, _actor=Depends(require_auth)):
    if not _actor.can_issue("MaterialSourcingCredential"):
        raise HTTPException(
            403, detail=f"Role '{_actor.role}' cannot issue MaterialSourcingCredential.")
    product_id = record.product_id
    issuer_did = _actor.did
    validate_chain(product_id, "", new_date=record.sourcing_date,
                   issuer_did=issuer_did, vc_type="MaterialSourcingCredential")
    vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                 "MaterialSourcingCredential",
                 csv_fields=MATERIAL_CSV_FIELDS, product_id=product_id)

    db = SessionLocal()
    try:
        ipfs_cid, tx_hash = _save_stage(
            db, product_id, "Material Sourcing", record.sourcing_date,
            issuer_did, record.certifying_body, vc["id"],
            "MaterialSourcingCredential", vc, "Material Sourcing")
    finally:
        db.close()

    _log("CREDENTIAL_ISSUED", issuer_did,
         "MaterialSourcingCredential", product_id)
    return {"product_id": product_id, "credential": vc,
            "ipfs_cid": ipfs_cid, "tx_hash": tx_hash}


@app.post("/add-lifecycle-stage/certification")
def add_certification(record: CertificationRecord, _actor=Depends(require_auth)):
    if not _actor.can_issue("CertificationCredential"):
        raise HTTPException(
            403, detail=f"Role '{_actor.role}' cannot issue CertificationCredential.")
    product_id = record.product_id
    issuer_did = _actor.did

    # Auto-derive sourcing_id from chain if not provided
    if not record.sourcing_id:
        db = SessionLocal()
        try:
            for e in reversed(_get_lifecycle_stages(product_id, db)):
                if "Material Sourcing" in e.get("stage", ""):
                    record.sourcing_id = e.get("credential_id", "auto")
                    break
            else:
                record.sourcing_id = "auto"
        finally:
            db.close()

    validate_chain(product_id, "", new_date=record.audit_date,
                   issuer_did=issuer_did, vc_type="CertificationCredential")
    vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                 "CertificationCredential", product_id=product_id)

    db = SessionLocal()
    try:
        ipfs_cid, tx_hash = _save_stage(
            db, product_id, "Certification", record.audit_date,
            issuer_did, record.certifying_body, vc["id"],
            "CertificationCredential", vc, "Certification")
    finally:
        db.close()

    _log("CREDENTIAL_ISSUED", issuer_did, "CertificationCredential", product_id)
    return {"product_id": product_id, "credential": vc,
            "ipfs_cid": ipfs_cid, "tx_hash": tx_hash}


@app.post("/add-lifecycle-stage/custody-transfer")
def add_custody_transfer(record: CustodyTransfer, _actor=Depends(require_auth)):
    if not _actor.can_issue("CustodyTransferCredential"):
        raise HTTPException(
            403, detail=f"Role '{_actor.role}' cannot issue CustodyTransferCredential.")
    product_id = record.product_id
    issuer_did = _actor.did

    requested_from_owner = _normalize_actor_did(record.from_owner_did)
    requested_to_owner = _normalize_actor_did(record.to_owner_did)

    if record.from_owner_did and not requested_from_owner:
        raise HTTPException(422, detail="from_owner_did must be a valid DID or EVM address.")
    if record.to_owner_did and not requested_to_owner:
        raise HTTPException(422, detail="to_owner_did must be a valid DID or EVM address.")

    record.from_owner_did = requested_from_owner
    record.to_owner_did = requested_to_owner

    if record.transfer_sequence is None:
        db = SessionLocal()
        try:
            existing_transfers = sum(
                1 for e in _get_lifecycle_stages(product_id, db)
                if e.get("stage", "").startswith("Transfer")
            )
            record.transfer_sequence = existing_transfers + 1
        finally:
            db.close()

    validate_chain(product_id, "", new_date=record.handover_date,
                   issuer_did=issuer_did, vc_type="CustodyTransferCredential")

    db = SessionLocal()
    try:
        active_token = db.query(MaterialToken).filter(
            MaterialToken.product_id == product_id,
            MaterialToken.is_burned == False,
        ).order_by(MaterialToken.created_at.desc()).first()

        owner_updated = False
        if requested_to_owner:
            if not active_token:
                raise HTTPException(
                    404,
                    detail="No active token found for this product. Cannot apply ownership transfer.",
                )

            effective_from_owner = requested_from_owner or active_token.owner_did
            if active_token.owner_did != effective_from_owner:
                raise HTTPException(
                    409,
                    detail=f"Active owner mismatch. Current owner is {active_token.owner_did}.",
                )

            if _actor.tier > 1 and active_token.owner_did != _actor.did:
                raise HTTPException(
                    403,
                    detail="Only current token owner or elevated authority can transfer ownership.",
                )

            record.from_owner_did = effective_from_owner
            active_token.owner_did = requested_to_owner
            owner_updated = True
        elif requested_from_owner and active_token and active_token.owner_did != requested_from_owner:
            raise HTTPException(
                409,
                detail=f"from_owner_did does not match active owner ({active_token.owner_did}).",
            )

        vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                     "CustodyTransferCredential", product_id=product_id)
        stage_label = f"Transfer {record.transfer_sequence}: {record.transfer_type}"

        ipfs_cid, tx_hash = _save_stage(
            db, product_id, stage_label, record.handover_date,
            issuer_did, record.from_actor_name, vc["id"],
            "CustodyTransferCredential", vc, stage_label)

        active_owner_did = active_token.owner_did if active_token else None
    finally:
        db.close()

    _log("CREDENTIAL_ISSUED", issuer_did,
         "CustodyTransferCredential", product_id)
    return {"product_id": product_id, "credential": vc,
            "ipfs_cid": ipfs_cid, "tx_hash": tx_hash,
            "owner_updated": owner_updated,
            "active_owner_did": active_owner_did}


@app.post("/add-lifecycle-stage/ownership")
def add_ownership(record: OwnershipRecord, _actor=Depends(require_auth)):
    if not _actor.can_issue("OwnershipCredential"):
        raise HTTPException(
            403, detail=f"Role '{_actor.role}' cannot issue OwnershipCredential.")
    product_id = record.product_id
    issuer_did = _actor.did

    requested_previous_owner = _normalize_actor_did(record.previous_owner_did)
    requested_new_owner = _normalize_actor_did(record.new_owner_did)

    if record.previous_owner_did and not requested_previous_owner:
        raise HTTPException(422, detail="previous_owner_did must be a valid DID or EVM address.")
    if record.new_owner_did and not requested_new_owner:
        raise HTTPException(422, detail="new_owner_did must be a valid DID or EVM address.")

    record.previous_owner_did = requested_previous_owner
    record.new_owner_did = requested_new_owner

    validate_chain(product_id, "", new_date=record.ownership_start,
                   issuer_did=issuer_did, vc_type="OwnershipCredential")

    db = SessionLocal()
    try:
        active_token = db.query(MaterialToken).filter(
            MaterialToken.product_id == product_id,
            MaterialToken.is_burned == False,
        ).order_by(MaterialToken.created_at.desc()).first()

        owner_updated = False
        if requested_new_owner:
            if not active_token:
                raise HTTPException(
                    404,
                    detail="No active token found for this product. Cannot apply ownership update.",
                )

            effective_previous_owner = requested_previous_owner or active_token.owner_did
            if active_token.owner_did != effective_previous_owner:
                raise HTTPException(
                    409,
                    detail=f"Active owner mismatch. Current owner is {active_token.owner_did}.",
                )

            if _actor.tier > 1 and active_token.owner_did != _actor.did:
                raise HTTPException(
                    403,
                    detail="Only current token owner or elevated authority can issue ownership reassignment.",
                )

            record.previous_owner_did = effective_previous_owner
            active_token.owner_did = requested_new_owner
            owner_updated = True
        elif requested_previous_owner and active_token and active_token.owner_did != requested_previous_owner:
            raise HTTPException(
                409,
                detail=f"previous_owner_did does not match active owner ({active_token.owner_did}).",
            )

        vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                     "OwnershipCredential", product_id=product_id)

        ipfs_cid, tx_hash = _save_stage(
            db, product_id, "Ownership / Usage", record.ownership_start,
            issuer_did, "Ownership Registry", vc["id"],
            "OwnershipCredential", vc, "Ownership / Usage")

        active_owner_did = active_token.owner_did if active_token else None
    finally:
        db.close()

    _log("CREDENTIAL_ISSUED", issuer_did, "OwnershipCredential", product_id)
    return {"product_id": product_id, "credential": vc,
            "ipfs_cid": ipfs_cid, "tx_hash": tx_hash,
            "owner_updated": owner_updated,
            "active_owner_did": active_owner_did}


@app.post("/add-lifecycle-stage/repair")
def add_repair(record: RepairRecord, _actor=Depends(require_auth)):
    if not _actor.can_issue("RepairCredential"):
        raise HTTPException(
            403, detail=f"Role '{_actor.role}' cannot issue RepairCredential.")
    product_id = record.product_id
    issuer_did = _actor.did
    validate_chain(product_id, "", new_date=record.service_date,
                   issuer_did=issuer_did, vc_type="RepairCredential")
    vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                 "RepairCredential", product_id=product_id)
    stage_label = f"Repair: {record.service_type}"

    db = SessionLocal()
    try:
        ipfs_cid, tx_hash = _save_stage(
            db, product_id, stage_label, record.service_date,
            issuer_did, record.service_provider, vc["id"],
            "RepairCredential", vc, stage_label)
    finally:
        db.close()

    _log("CREDENTIAL_ISSUED", issuer_did, "RepairCredential", product_id)
    return {"product_id": product_id, "credential": vc,
            "ipfs_cid": ipfs_cid, "tx_hash": tx_hash}


@app.post("/add-lifecycle-stage/end-of-life")
def add_end_of_life(record: EndOfLifeRecord, _actor=Depends(require_auth)):
    if not _actor.can_issue("EndOfLifeCredential"):
        raise HTTPException(
            403, detail=f"Role '{_actor.role}' cannot issue EndOfLifeCredential.")
    product_id = record.product_id
    issuer_did = _actor.did
    validate_chain(product_id, "", new_date=record.collection_date,
                   issuer_did=issuer_did, vc_type="EndOfLifeCredential")
    vc = make_vc(issuer_did, record.model_dump(exclude={"issuer_did"}),
                 "EndOfLifeCredential", product_id=product_id)

    db = SessionLocal()
    try:
        ipfs_cid, tx_hash = _save_stage(
            db, product_id, "End of Life", record.collection_date,
            issuer_did, record.recycler_name, vc["id"],
            "EndOfLifeCredential", vc, "End of Life")
    finally:
        db.close()

    _log("CREDENTIAL_ISSUED", issuer_did, "EndOfLifeCredential", product_id)
    return {"product_id": product_id, "credential": vc,
            "ipfs_cid": ipfs_cid, "tx_hash": tx_hash}


# ── Product lifecycle & verification ─────────────────────────────────────────

@app.get("/product/{product_id}/lifecycle")
def get_product_lifecycle(product_id: str):
    db = SessionLocal()
    try:
        lifecycle = _get_lifecycle_stages(product_id, db)
        if not lifecycle:
            raise HTTPException(404, detail="Product not found")
        return {"product_id": product_id, "total_stages": len(lifecycle), "lifecycle": lifecycle}
    finally:
        db.close()


@app.get("/product/{product_id}/verify")
def verify_product(product_id: str):
    db = SessionLocal()
    try:
        lifecycle = _get_lifecycle_stages(product_id, db)
        if not lifecycle:
            raise HTTPException(404, detail="Product not found")

        credentials_report = []
        overall_valid = True

        for i, entry in enumerate(lifecycle):
            vc = entry.get("credential", {})
            cid = entry.get("credential_id", "")
            issuer_did = entry.get("issuer_did", vc.get("issuer", ""))
            proof = vc.get("proof", {})
            actor = actors_module.get_actor(issuer_did)
            vc_types = vc.get("type", [])
            vc_type = vc_types[-1] if vc_types else entry["stage"]

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
            issuer_role_ok = actor.can_issue(vc_type) if actor else False

            # Check 4: temporal ordering
            temporal_ok = True
            if i > 0:
                prev_d = _parse_date(lifecycle[i - 1].get("date", ""))
                this_d = _parse_date(entry.get("date", ""))
                if prev_d and this_d and this_d < prev_d:
                    temporal_ok = False

            # Check 5: on-chain anchor verification
            polygon_verified = None
            anchor_data = polygon.verify_anchor(cid) if cid else None
            if anchor_data:
                ipfs_cid = entry.get("ipfs_cid", "")
                polygon_verified = (anchor_data.get("ipfs_cid") == ipfs_cid
                                    and not anchor_data.get("revoked", False))

            checks = {
                "signature_valid":   sig_ok,
                "not_revoked": not revoked,
                "issuer_registered": issuer_registered,
                "issuer_role_valid": issuer_role_ok,
                "temporal_order":    temporal_ok,
            }
            if polygon_verified is not None:
                checks["polygon_verified"] = polygon_verified

            errors = []
            if not sig_ok:
                errors.append("Signature could not be verified")
            if revoked:
                errors.append("Credential has been revoked")
            if not issuer_registered:
                errors.append(f"Issuer '{issuer_did}' not in actor registry")
            if not issuer_role_ok:
                errors.append(
                    "Issuer role not authorised for this credential type")
            if not temporal_ok:
                errors.append("Stage date precedes previous stage date")
            if polygon_verified is False:
                errors.append("On-chain anchor mismatch — possible tampering")

            cred_valid = (
                sig_ok
                and not revoked
                and issuer_registered
                and issuer_role_ok
                and temporal_ok
                and polygon_verified is not False
            )
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
                "ipfs_cid":     entry.get("ipfs_cid"),
                "tx_hash":      entry.get("tx_hash"),
                "polygon_anchor": anchor_data,
            })

        return {
            "product_id":        product_id,
            "overall_valid":     overall_valid,
            "total_credentials": len(lifecycle),
            "credentials":       credentials_report,
            "integrations": {
                "ipfs_enabled": pinata.is_available(),
                "polygon_enabled": polygon.is_available(),
            },
        }
    finally:
        db.close()


# ── Status list & revocation ─────────────────────────────────────────────────

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

    db = SessionLocal()
    try:
        stage = db.query(LifecycleStage).filter(
            LifecycleStage.credential_id == credential_id).first()
        entry = {"issuer_did": stage.issuer_did,
                 "product_id": stage.product_id} if stage else {}

        is_elevated = _actor.can_issue("*")
        is_original_issuer = entry.get("issuer_did") == _actor.did
        if not is_elevated and not is_original_issuer:
            raise HTTPException(403, detail=(
                f"Role '{_actor.role}' cannot revoke this credential. "
                f"Only the original issuer ({entry.get('issuer_did', 'unknown')}) "
                f"or a Tier 0/1 authority can revoke credentials."
            ))

        status_list.revoke(idx)

        # Anchor revocation on-chain
        revoke_tx = polygon.anchor_revocation(
            credential_id, body.reason or "Revoked")

        db.query(CredentialStatus).filter(CredentialStatus.credential_id == credential_id).update({
            "is_revoked": True,
            "revoked_at": datetime.now(timezone.utc),
            "revoked_by": _actor.did,
            "revoked_tx_hash": revoke_tx,
        })
        db.commit()

        _log("CREDENTIAL_REVOKED", _actor.did,
             f"Revoked: {credential_id}", entry.get("product_id"))
        return {"credential_id": credential_id, "revoked": True,
                "reason": body.reason, "status_index": idx,
                "revoked_by": _actor.did, "revoke_tx_hash": revoke_tx}
    finally:
        db.close()


@app.get("/credentials/{credential_id}/status")
def check_credential_status(credential_id: str):
    idx, revoked = status_list.lookup_by_credential_id(credential_id)
    if idx is None:
        raise HTTPException(404, detail="Credential not found in status list")
    return {"credential_id": credential_id, "status_index": idx, "revoked": revoked}


# ── IPFS endpoint ────────────────────────────────────────────────────────────

@app.get("/ipfs/{cid}")
def get_ipfs_content(cid: str):
    """Retrieve pinned VC JSON from IPFS via Pinata gateway."""
    data = pinata.get_json(cid)
    if data is None:
        raise HTTPException(
            404, detail=f"IPFS content not found for CID: {cid}")
    return data


# ── Auth endpoints ───────────────────────────────────────────────────────────

def _validate_evm_address(address: str) -> str:
    normalized = (address or "").strip().lower()
    if not normalized.startswith("0x") or len(normalized) != 42:
        raise HTTPException(400, detail="Invalid wallet address.")
    return normalized


def _siwe_ts(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _build_siwe_message(address: str, nonce: str, chain_id: int, issued_at: str) -> str:
    return (
        f"{SIWE_DOMAIN} wants you to sign in with your Ethereum account:\n"
        f"{address}\n\n"
        "Sign in to the Digital Product Passport dApp.\n\n"
        f"URI: {SIWE_URI}\n"
        "Version: 1\n"
        f"Chain ID: {chain_id}\n"
        f"Nonce: {nonce}\n"
        f"Issued At: {issued_at}"
    )


class SIWEChallengeRequest(BaseModel):
    address: str
    chain_id: Optional[int] = None


class SIWEVerifyRequest(BaseModel):
    address: str
    nonce: str
    signature: str
    chain_id: Optional[int] = None


@app.post("/auth/siwe/challenge")
def auth_siwe_challenge(body: SIWEChallengeRequest):
    address = _validate_evm_address(body.address)
    chain_id = body.chain_id or SIWE_CHAIN_ID
    did = f"did:ethr:{address}"
    nonce = secrets.token_hex(16)
    issued_at = datetime.now(timezone.utc).replace(microsecond=0)

    db = SessionLocal()
    try:
        db.add(AuthChallenge(
            nonce=nonce,
            did=did,
            created_at=issued_at,
            expires_at=issued_at + timedelta(minutes=5),
        ))
        db.commit()
    finally:
        db.close()

    return {
        "did": did,
        "address": address,
        "nonce": nonce,
        "chain_id": chain_id,
        "expires_in_seconds": 300,
        "issued_at": _siwe_ts(issued_at),
        "message": _build_siwe_message(address, nonce, chain_id, _siwe_ts(issued_at)),
    }


@app.post("/auth/siwe/verify")
def auth_siwe_verify(body: SIWEVerifyRequest):
    address = _validate_evm_address(body.address)
    did = f"did:ethr:{address}"
    chain_id = body.chain_id or SIWE_CHAIN_ID

    db = SessionLocal()
    try:
        db_challenge = db.query(AuthChallenge).filter(
            AuthChallenge.nonce == body.nonce,
            AuthChallenge.did == did,
        ).first()
        if not db_challenge:
            raise HTTPException(400, detail="Unknown or expired challenge.")
        if db_challenge.expires_at.timestamp() < datetime.now(timezone.utc).timestamp():
            db.delete(db_challenge)
            db.commit()
            raise HTTPException(400, detail="Challenge expired. Request a new one.")

        challenge_issued_at = db_challenge.created_at or datetime.now(timezone.utc)
        expected_message = _build_siwe_message(
            address,
            body.nonce,
            chain_id,
            _siwe_ts(challenge_issued_at),
        )
        try:
            recovered = Account.recover_message(
                encode_defunct(text=expected_message),
                signature=body.signature,
            )
        except Exception:
            db.delete(db_challenge)
            db.commit()
            raise HTTPException(401, detail="Invalid wallet signature.")

        if recovered.lower() != address:
            db.delete(db_challenge)
            db.commit()
            raise HTTPException(401, detail="Signature does not match wallet address.")

        db.delete(db_challenge)
        db.commit()
    finally:
        db.close()

    actor = actors_module.get_or_create_web3_actor(address)
    token = actors_module.create_auth_token_for_actor(actor.did)
    return {
        "token": token,
        "did": actor.did,
        "address": address,
        "actor": actor.to_public_dict(),
        "message": "Wallet authenticated. Use bearer token for API calls.",
    }

class SignRequest(BaseModel):
    did: str
    challenge: str


@app.post("/auth/sign")
def auth_sign(body: SignRequest):
    raise HTTPException(
        410,
        detail="Legacy /auth/sign is disabled. Use wallet authentication via /auth/siwe/challenge and /auth/siwe/verify.",
    )


@app.get("/actors")
def list_actors():
    actor_list = [a.to_public_dict() for a in actors_module.get_all_actors()]
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
    raise HTTPException(
        410,
        detail="Legacy DID challenge auth is disabled. Use wallet auth via /auth/siwe/challenge and /auth/siwe/verify.",
    )


@app.post("/auth/verify")
def auth_verify(body: AuthVerifyRequest):
    raise HTTPException(
        410,
        detail="Legacy DID verify auth is disabled. Use wallet auth via /auth/siwe/challenge and /auth/siwe/verify.",
    )


# ── Actor registration ────────────────────────────────────────────────────────

ROLE_MAP = {
    "factory":   actors_module.TIER2_FACTORY,
    "supplier":  actors_module.TIER2_SUPPLIER,
    "logistics": actors_module.TIER2_LOGISTICS,
    "certifier": actors_module.TIER1_CERTIFIER,
    "recycler":  actors_module.TIER1_RECYCLER,
    "regulator": actors_module.TIER1_REGULATOR,
}
TIER1_ROLES = {actors_module.TIER1_CERTIFIER,
               actors_module.TIER1_RECYCLER, actors_module.TIER1_REGULATOR}


class RegisterRequest(BaseModel):
    role: str
    name: str
    os_id: Optional[str] = None
    email: Optional[str] = None


@app.post("/register")
def register_actor(body: RegisterRequest):
    raise HTTPException(
        410,
        detail="Manual registration is disabled. Connect a wallet and sign in via SIWE to auto-provision an actor.",
    )


# ── Dashboard & admin ────────────────────────────────────────────────────────

@app.get("/dashboard/my-products")
def my_products(_actor=Depends(require_auth)):
    db = SessionLocal()
    try:
        stages = db.query(LifecycleStage).filter(
            LifecycleStage.issuer_did == _actor.did).all()
        product_ids = set(s.product_id for s in stages)
        result = []
        for product_id in product_ids:
            product_stages = _get_lifecycle_stages(product_id, db)
            has_revoked = any(
                status_list.lookup_by_credential_id(
                    s.get("credential_id", ""))[1]
                for s in product_stages
            )
            result.append({
                "product_id":    product_id,
                "stage_count":   len(product_stages),
                "current_stage": product_stages[-1]["stage"] if product_stages else "Unknown",
                "issued_date":   product_stages[0]["date"] if product_stages else None,
                "has_warning":   has_revoked,
            })
        return {"actor": _actor.to_public_dict(), "products": result, "total": len(result)}
    finally:
        db.close()


@app.get("/dashboard/recent-activity")
def recent_activity(_actor=Depends(require_auth), limit: int = Query(20, ge=1, le=100)):
    db = SessionLocal()
    try:
        entries = db.query(AuditLogEntry).filter(
            AuditLogEntry.actor_did == _actor.did
        ).order_by(AuditLogEntry.ts.desc()).limit(limit).all()
        return {"entries": [
            {"ts": e.ts.isoformat() if e.ts else None, "event": e.event,
             "actor_did": e.actor_did, "product_id": e.product_id, "detail": e.detail}
            for e in entries
        ]}
    finally:
        db.close()


@app.post("/actors/{did:path}/rotate-key")
def rotate_key(did: str, _actor=Depends(require_auth)):
    if _actor.did != did:
        raise HTTPException(403, detail="You can only rotate your own keys.")
    actor = actors_module.get_actor(did)
    if not actor:
        raise HTTPException(404, detail="Actor not found.")
    new_private_key_b64 = actor.rotate_key()
    count = actors_module.invalidate_actor_tokens(did)
    _log("KEY_ROTATED", did, "Keypair rotated; all sessions invalidated")
    return {
        "did":         did,
        "new_public_key": actor.public_key_b64,
        "new_private_key": new_private_key_b64,
        "note":        "New private key shown once. All previous sessions have been invalidated.",
    }


def require_root(_actor=Depends(require_auth)):
    if _actor.role != actors_module.TIER0_ROOT:
        raise HTTPException(403, detail="Root authority access required.")
    return _actor


@app.get("/admin/pending-approvals")
def admin_pending(_actor=Depends(require_root)):
    return {"pending": actors_module.get_pending_registrations(),
            "total": len(actors_module.get_pending_registrations())}


@app.post("/admin/approve/{did:path}")
def admin_approve(did: str, _actor=Depends(require_root)):
    result = actors_module.approve_pending_registration(did, _actor.did)
    if not result:
        raise HTTPException(
            404, detail=f"No pending registration for DID: {did}")
    _log("ACTOR_APPROVED", _actor.did, f"Approved {did}")
    return {"approved": did, "actor": result}


@app.post("/admin/reject/{did:path}")
def admin_reject(did: str, _actor=Depends(require_root)):
    if actors_module.reject_pending_registration(did):
        _log("ACTOR_REJECTED", _actor.did, f"Rejected {did}")
        return {"rejected": did}
    raise HTTPException(404, detail=f"No pending registration for DID: {did}")


@app.get("/admin/audit-log")
def admin_audit_log(limit: int = Query(50, ge=1, le=500), _actor=Depends(require_root)):
    db = SessionLocal()
    try:
        entries = db.query(AuditLogEntry).order_by(
            AuditLogEntry.ts.desc()).limit(limit).all()
        return {"entries": [
            {"ts": e.ts.isoformat() if e.ts else None, "event": e.event,
             "actor_did": e.actor_did, "product_id": e.product_id, "detail": e.detail}
            for e in entries
        ], "total": db.query(AuditLogEntry).count()}
    finally:
        db.close()


@app.post("/admin/revoke-actor/{did:path}")
def admin_revoke_actor(did: str, _actor=Depends(require_root)):
    if not actors_module.get_actor(did):
        raise HTTPException(404, detail=f"Actor not found: {did}")
    actors_module.revoke_actor(did)
    _log("ACTOR_REVOKED", _actor.did, f"Actor removed from registry: {did}")
    return {"revoked_actor": did, "status": "revoked"}


# ── Integration status ───────────────────────────────────────────────────────

@app.get("/integrations/status")
def integration_status():
    """Report which external integrations are active."""
    polygon_rpc = os.getenv("POLYGON_RPC_URL", "https://rpc-amoy.polygon.technology")
    polygon_contract = os.getenv("POLYGON_CONTRACT_ADDRESS", "")
    pinata_gateway = os.getenv("PINATA_GATEWAY", "https://gateway.pinata.cloud")
    return {
        "postgresql": True,
        "ipfs_pinata": pinata.is_available(),
        "polygon_amoy": polygon.is_available(),
        "polygon_rpc_url": polygon_rpc,
        "polygon_contract_address": polygon_contract,
        "pinata_gateway": pinata_gateway,
        "auth_mode": "wallet-siwe",
        "siwe_domain": SIWE_DOMAIN,
        "siwe_uri": SIWE_URI,
        "siwe_chain_id": SIWE_CHAIN_ID,
    }


@app.get("/system/live-status")
def system_live_status():
    """Richer runtime status for frontend dashboards and demos."""
    db = SessionLocal()
    try:
        total_products = db.query(Product).count()
        total_tokens = db.query(MaterialToken).count()
        active_tokens = db.query(MaterialToken).filter(
            MaterialToken.is_burned == False
        ).count()
        latest_token = db.query(MaterialToken).order_by(
            MaterialToken.created_at.desc()
        ).first()
        latest_stage = db.query(LifecycleStage).order_by(
            LifecycleStage.created_at.desc()
        ).first()
    finally:
        db.close()

    return {
        "server_time_utc": datetime.now(timezone.utc).isoformat(),
        "auth": {
            "mode": "wallet-siwe",
            "domain": SIWE_DOMAIN,
            "uri": SIWE_URI,
            "chain_id": SIWE_CHAIN_ID,
        },
        "integrations": integration_status(),
        "ledger": {
            "total_products": total_products,
            "total_tokens": total_tokens,
            "active_tokens": active_tokens,
            "latest_tx_hash": latest_token.tx_hash if latest_token else None,
            "latest_metadata_uri": latest_token.metadata_uri if latest_token else None,
        },
        "latest_credential": {
            "credential_id": latest_stage.credential_id if latest_stage else None,
            "ipfs_cid": latest_stage.ipfs_cid if latest_stage else None,
            "tx_hash": latest_stage.tx_hash if latest_stage else None,
        },
    }
