"""
Actor registry — Tier 0 / 1 / 2 model  (PostgreSQL-backed)

Tier 0  — Root Authority
Tier 1  — Verified third parties: certifiers, recyclers, regulators
Tier 2  — Dataset-anchored actors: factories (os_id), suppliers (mat_id), logistics

All state lives in PostgreSQL. In-memory ACTOR_REGISTRY is a hot cache
refreshed on startup and mutated on register/revoke.
"""

from __future__ import annotations
import base64
import os
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime, timezone, timedelta

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding, PublicFormat, PrivateFormat, NoEncryption
)
from cryptography.exceptions import InvalidSignature

from database.models import (
    Actor as ActorModel, PendingRegistration, AuthChallenge, AuthToken,
)
from database.connection import SessionLocal


# ── Role constants ───────────────────────────────────────────────────────────

TIER0_ROOT       = "tier0_root"
TIER1_CERTIFIER  = "tier1_certifier"
TIER1_RECYCLER   = "tier1_recycler"
TIER1_REGULATOR  = "tier1_regulator"
TIER2_FACTORY    = "tier2_factory"
TIER2_SUPPLIER   = "tier2_supplier"
TIER2_LOGISTICS  = "tier2_logistics"
TIER2_OBSERVER   = "tier2_observer"

ALL_ROLES = [
    TIER0_ROOT, TIER1_CERTIFIER, TIER1_RECYCLER, TIER1_REGULATOR,
    TIER2_FACTORY, TIER2_SUPPLIER, TIER2_LOGISTICS, TIER2_OBSERVER,
]

ROLE_PERMISSIONS: dict[str, list[str]] = {
    TIER0_ROOT:      ["*"],
    TIER1_REGULATOR: ["*"],
    TIER1_CERTIFIER: ["CertificationCredential"],
    TIER1_RECYCLER:  ["EndOfLifeCredential"],
    TIER2_FACTORY:   [
        "ProductBirthCertificate",
        "CustodyTransferCredential",
        "OwnershipCredential",
        "RepairCredential",
        "RawMaterialCredential",
        "ProductCompositionCredential",
    ],
    TIER2_SUPPLIER:  ["MaterialSourcingCredential", "RawMaterialCredential"],
    TIER2_LOGISTICS: ["CustodyTransferCredential"],
    TIER2_OBSERVER:  [],
}

TIER_LEVEL: dict[str, int] = {
    TIER0_ROOT: 0,
    TIER1_CERTIFIER: 1, TIER1_RECYCLER: 1, TIER1_REGULATOR: 1,
    TIER2_FACTORY: 2, TIER2_SUPPLIER: 2, TIER2_LOGISTICS: 2, TIER2_OBSERVER: 2,
}


def _normalize_evm_address(address: str) -> str:
    normalized = (address or "").strip().lower()
    if normalized.startswith("0x") and len(normalized) == 42:
        return normalized
    return ""


def _allowlist_from_env(env_var: str) -> set[str]:
    raw = os.getenv(env_var, "")
    out: set[str] = set()
    for item in raw.split(","):
        normalized = _normalize_evm_address(item)
        if normalized:
            out.add(normalized)
    return out


WEB3_FACTORY_ALLOWLIST = _allowlist_from_env("WEB3_FACTORY_ALLOWLIST")
WEB3_SUPPLIER_ALLOWLIST = _allowlist_from_env("WEB3_SUPPLIER_ALLOWLIST")
WEB3_LOGISTICS_ALLOWLIST = _allowlist_from_env("WEB3_LOGISTICS_ALLOWLIST")

_WEB3_DEFAULT_ROLE_RAW = os.getenv("WEB3_DEFAULT_ROLE", TIER2_OBSERVER).strip()
WEB3_DEFAULT_ROLE = _WEB3_DEFAULT_ROLE_RAW if _WEB3_DEFAULT_ROLE_RAW in ROLE_PERMISSIONS else TIER2_OBSERVER


def _resolve_web3_role(address: str) -> str:
    normalized = _normalize_evm_address(address)
    if normalized in WEB3_FACTORY_ALLOWLIST:
        return TIER2_FACTORY
    if normalized in WEB3_SUPPLIER_ALLOWLIST:
        return TIER2_SUPPLIER
    if normalized in WEB3_LOGISTICS_ALLOWLIST:
        return TIER2_LOGISTICS
    return WEB3_DEFAULT_ROLE


# ── Actor dataclass (in-process representation) ─────────────────────────────

@dataclass
class Actor:
    did: str
    name: str
    role: str
    approved_by: Optional[str]
    _private_key: Ed25519PrivateKey = field(repr=False)

    @property
    def public_key_b64(self) -> str:
        raw = self._private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        return base64.b64encode(raw).decode()

    @property
    def tier(self) -> int:
        return TIER_LEVEL.get(self.role, 99)

    def sign(self, message: bytes) -> str:
        return base64.b64encode(self._private_key.sign(message)).decode()

    def verify(self, message: bytes, signature_b64: str) -> bool:
        try:
            sig = base64.b64decode(signature_b64)
            self._private_key.public_key().verify(sig, message)
            return True
        except (InvalidSignature, Exception):
            return False

    def export_private_key_b64(self) -> str:
        raw = self._private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
        return base64.b64encode(raw).decode()

    def rotate_key(self) -> str:
        self._private_key = Ed25519PrivateKey.generate()
        return self.export_private_key_b64()

    def can_issue(self, vc_type: str) -> bool:
        perms = ROLE_PERMISSIONS.get(self.role, [])
        return "*" in perms or vc_type in perms

    def to_public_dict(self) -> dict:
        return {
            "did": self.did,
            "name": self.name,
            "role": self.role,
            "tier": self.tier,
            "approved_by": self.approved_by,
            "public_key": self.public_key_b64,
        }


def _new_actor(did: str, name: str, role: str, approved_by: Optional[str] = None) -> Actor:
    return Actor(did=did, name=name, role=role, approved_by=approved_by,
                 _private_key=Ed25519PrivateKey.generate())


# ── In-memory hot cache (loaded from DB at startup) ─────────────────────────

ACTOR_REGISTRY: dict[str, Actor] = {}

_ROOT_DID = "did:dpp:root-authority"

DEMO_CERTIFIER_DID  = "did:dpp:certifier-intertek"
DEMO_CERTIFIER2_DID = "did:dpp:certifier-tuv"
DEMO_RECYCLER_DID   = "did:dpp:recycler-veolia"
DEMO_REGULATOR_DID  = "did:dpp:regulator-eu-espr"
DEMO_SUPPLIER_DID   = "did:dpp:supplier-rawmat"
DEMO_LOGISTICS_DID  = "did:dpp:logistics-dhl"
DEMO_FACTORY_DID    = "did:dpp:factory-alpha"
DEMO_FACTORY2_DID   = "did:dpp:factory-beta"


# ── Bootstrap ────────────────────────────────────────────────────────────────

def _seed_actors_to_db() -> None:
    """Seed initial demo actors if DB is empty."""
    db = SessionLocal()
    try:
        if db.query(ActorModel).count() > 0:
            return

        # Create root actor first (generates key)
        root = _new_actor(_ROOT_DID, "DPP Root Authority", TIER0_ROOT)
        ACTOR_REGISTRY[root.did] = root

        actors_to_seed = [
            ActorModel(did=_ROOT_DID, name="DPP Root Authority", role=TIER0_ROOT,
                       approved_by=None, public_key_b64=root.public_key_b64),
        ]

        tier1_defs = [
            (DEMO_CERTIFIER_DID,  "Intertek Certification",  TIER1_CERTIFIER),
            (DEMO_CERTIFIER2_DID, "TUV SUD",                 TIER1_CERTIFIER),
            (DEMO_RECYCLER_DID,   "Veolia Recycling",        TIER1_RECYCLER),
            (DEMO_REGULATOR_DID,  "EU ESPR Regulator",       TIER1_REGULATOR),
        ]
        tier2_defs = [
            (DEMO_SUPPLIER_DID,   "Raw Material Supplier",   TIER2_SUPPLIER),
            (DEMO_LOGISTICS_DID,  "DHL Supply Chain",        TIER2_LOGISTICS),
            (DEMO_FACTORY_DID,    "Alpha Manufacturing Co.",  TIER2_FACTORY),
            (DEMO_FACTORY2_DID,   "Beta Industries Ltd.",     TIER2_FACTORY),
        ]

        for did, name, role in tier1_defs + tier2_defs:
            actor = _new_actor(did, name, role, _ROOT_DID)
            ACTOR_REGISTRY[actor.did] = actor
            actors_to_seed.append(ActorModel(
                did=did, name=name, role=role,
                approved_by=_ROOT_DID, public_key_b64=actor.public_key_b64,
            ))

        for m in actors_to_seed:
            db.add(m)
        db.commit()
    finally:
        db.close()


def _load_actors_from_db() -> None:
    """Load all active actors from DB into in-memory cache."""
    db = SessionLocal()
    try:
        db_actors = db.query(ActorModel).filter(ActorModel.is_active == True).all()
        roles_changed = False
        for db_actor in db_actors:
            if db_actor.did.startswith("did:ethr:"):
                address = db_actor.did.split(":")[-1]
                desired_role = _resolve_web3_role(address)
                if db_actor.role != desired_role:
                    db_actor.role = desired_role
                    roles_changed = True

            if db_actor.did not in ACTOR_REGISTRY:
                # Generate new key (demo mode — in production keys come from HSM/wallet)
                actor = _new_actor(db_actor.did, db_actor.name, db_actor.role, db_actor.approved_by)
                ACTOR_REGISTRY[db_actor.did] = actor

        if roles_changed:
            db.commit()
    finally:
        db.close()


def _bootstrap() -> None:
    from database.connection import init_db
    init_db()
    _seed_actors_to_db()
    _load_actors_from_db()


_bootstrap()


# ── Actor lookup ─────────────────────────────────────────────────────────────

def get_or_create_web3_actor(address: str) -> Actor:
    normalized_address = _normalize_evm_address(address)
    if not normalized_address:
        raise ValueError("Invalid EVM address")

    did = f"did:ethr:{normalized_address}"
    desired_role = _resolve_web3_role(normalized_address)

    if did in ACTOR_REGISTRY:
        actor = ACTOR_REGISTRY[did]
        if actor.role != desired_role:
            actor.role = desired_role
            db = SessionLocal()
            try:
                db.query(ActorModel).filter(ActorModel.did == did).update({"role": desired_role})
                db.commit()
            finally:
                db.close()
        return actor

    # Create new actor in DB and registry
    name = f"Web3 Actor ({normalized_address[:6]}...)"
    db = SessionLocal()
    try:
        db_actor = db.query(ActorModel).filter(ActorModel.did == did).first()
        if db_actor:
            if db_actor.role != desired_role:
                db_actor.role = desired_role
                db.commit()

            actor = _new_actor(
                did,
                db_actor.name or name,
                db_actor.role,
                db_actor.approved_by,
            )
            ACTOR_REGISTRY[did] = actor
            return actor

        actor = _new_actor(did, name, desired_role)
        db_actor = ActorModel(
            did=did,
            name=name,
            role=desired_role,
            approved_by=_ROOT_DID,
            public_key_b64=actor.public_key_b64,
        )
        db.add(db_actor)
        db.commit()
        ACTOR_REGISTRY[did] = actor
        return actor
    finally:
        db.close()


def create_auth_token_for_actor(did: str) -> str:
    """Create a new session token for the actor."""
    db = SessionLocal()
    try:
        token = secrets.token_hex(32)
        now = datetime.now(timezone.utc)
        auth_token = AuthToken(
            token=token,
            did=did,
            # Keep sessions finite to reduce replay risk if a token leaks.
            expires_at=now + timedelta(hours=12),
        )
        db.add(auth_token)
        db.commit()
        return token
    finally:
        db.close()


def get_or_create_factory_actor(os_id: str, name: str = "") -> Actor:
    did = f"did:dpp:{os_id.lower()}"
    if did in ACTOR_REGISTRY:
        return ACTOR_REGISTRY[did]

    db = SessionLocal()
    try:
        db_actor = db.query(ActorModel).filter(ActorModel.did == did).first()
        if db_actor:
            actor = _new_actor(did, db_actor.name or name or os_id, TIER2_FACTORY, db_actor.approved_by)
            ACTOR_REGISTRY[did] = actor
            return actor

        # Create new
        actor = _new_actor(did, name or os_id, TIER2_FACTORY, _ROOT_DID)
        ACTOR_REGISTRY[did] = actor
        db.add(ActorModel(
            did=did, name=actor.name, role=TIER2_FACTORY,
            approved_by=_ROOT_DID, public_key_b64=actor.public_key_b64,
        ))
        db.commit()
    finally:
        db.close()

    return ACTOR_REGISTRY[did]


def get_actor(did: str) -> Optional[Actor]:
    return ACTOR_REGISTRY.get(did)


def require_actor(did: str, vc_type: str) -> Actor:
    actor = ACTOR_REGISTRY.get(did)
    if not actor:
        raise ValueError(f"Unknown issuer DID: {did}")
    if not actor.can_issue(vc_type):
        raise ValueError(
            f"Actor '{did}' (role: {actor.role}) is not authorised to issue '{vc_type}'. "
            f"Allowed types: {ROLE_PERMISSIONS.get(actor.role, [])}"
        )
    return actor


def get_all_actors() -> list[Actor]:
    return list(ACTOR_REGISTRY.values())


def get_actor_by_did(did: str) -> Optional[Actor]:
    return get_actor(did)


# ── Auth: challenges & tokens (DB-only) ─────────────────────────────────────

def create_challenge(did: str) -> str:
    actor = get_actor(did)
    if not actor:
        raise ValueError(f"Unknown DID: {did}")

    db = SessionLocal()
    try:
        nonce = secrets.token_hex(32)
        db_challenge = AuthChallenge(
            nonce=nonce,
            did=did,
            expires_at=datetime.fromtimestamp(time.time() + 300, tz=timezone.utc),
        )
        db.add(db_challenge)
        db.commit()
        return nonce
    finally:
        db.close()


def verify_challenge(did: str, nonce: str, signature_b64: str) -> Optional[str]:
    db = SessionLocal()
    try:
        db_challenge = db.query(AuthChallenge).filter(AuthChallenge.nonce == nonce).first()
        if not db_challenge:
            return None
        if db_challenge.did != did:
            db.delete(db_challenge)
            db.commit()
            return None
        if db_challenge.expires_at.timestamp() < time.time():
            db.delete(db_challenge)
            db.commit()
            return None

        actor = get_actor(did)
        if not actor or not actor.verify(nonce.encode(), signature_b64):
            db.delete(db_challenge)
            db.commit()
            return None

        db.delete(db_challenge)

        token = secrets.token_hex(32)
        db_token = AuthToken(token=token, did=did)
        db.add(db_token)
        db.commit()
        return token
    finally:
        db.close()


def resolve_token(token: str) -> Optional[Actor]:
    db = SessionLocal()
    try:
        db_token = db.query(AuthToken).filter(AuthToken.token == token).first()
        if db_token:
            if db_token.expires_at and db_token.expires_at < datetime.now(timezone.utc):
                db.delete(db_token)
                db.commit()
                return None
            return get_actor(db_token.did)
        return None
    finally:
        db.close()


# ── Pending registrations (DB-only) ─────────────────────────────────────────

def add_pending_registration(did: str, name: str, role: str, email: str, public_key_b64: str) -> None:
    db = SessionLocal()
    try:
        pending = PendingRegistration(
            did=did, name=name, role=role, email=email, public_key_b64=public_key_b64,
        )
        db.add(pending)
        db.commit()
    finally:
        db.close()


def get_pending_registrations() -> list[dict]:
    db = SessionLocal()
    try:
        pending = db.query(PendingRegistration).all()
        return [
            {"did": p.did, "name": p.name, "role": p.role,
             "email": p.email, "submitted": p.submitted_at.isoformat()}
            for p in pending
        ]
    finally:
        db.close()


def approve_pending_registration(did: str, approved_by: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        pending = db.query(PendingRegistration).filter(PendingRegistration.did == did).first()
        if not pending:
            return None

        db_actor = ActorModel(
            did=pending.did, name=pending.name, role=pending.role,
            approved_by=approved_by, public_key_b64=pending.public_key_b64,
        )
        db.add(db_actor)
        db.delete(pending)
        db.commit()

        actor = _new_actor(pending.did, pending.name, pending.role, approved_by)
        ACTOR_REGISTRY[actor.did] = actor
        return actor.to_public_dict()
    finally:
        db.close()


def reject_pending_registration(did: str) -> bool:
    db = SessionLocal()
    try:
        pending = db.query(PendingRegistration).filter(PendingRegistration.did == did).first()
        if pending:
            db.delete(pending)
            db.commit()
            return True
        return False
    finally:
        db.close()


def register_actor_direct(did: str, name: str, role: str, public_key_b64: str) -> Actor:
    """Register a Tier 2 actor directly (no approval needed)."""
    db = SessionLocal()
    try:
        db_actor = ActorModel(
            did=did, name=name, role=role,
            approved_by=_ROOT_DID, public_key_b64=public_key_b64,
        )
        db.add(db_actor)
        db.commit()
    finally:
        db.close()

    actor = _new_actor(did, name, role, _ROOT_DID)
    ACTOR_REGISTRY[did] = actor
    return actor


def revoke_actor(did: str) -> bool:
    if did not in ACTOR_REGISTRY:
        return False

    del ACTOR_REGISTRY[did]

    db = SessionLocal()
    try:
        db.query(AuthToken).filter(AuthToken.did == did).delete()
        db.query(ActorModel).filter(ActorModel.did == did).update({"is_active": False})
        db.commit()
    finally:
        db.close()

    return True


def invalidate_actor_tokens(did: str) -> int:
    db = SessionLocal()
    try:
        count = db.query(AuthToken).filter(AuthToken.did == did).delete()
        db.commit()
        return count
    finally:
        db.close()
