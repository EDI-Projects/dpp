"""
Actor registry — Tier 0 / 1 / 2 model

Tier 0  — Root Authority (single, multi-sig in production)
Tier 1  — Verified third parties: certifiers, recyclers, regulators
Tier 2  — Dataset-anchored actors: factories (os_id), suppliers (mat_id), logistics

Keys are generated fresh at startup (demo).
In production these would be HSM-backed or wallet-held.

Future work:
  - Shamir's Secret Sharing key recovery for Tier 0
  - National accreditation body API integration (Tier 1 approval)
  - Hardware Security Module (HSM) key storage
  - Multi-sig threshold credentials
"""

from __future__ import annotations
import base64
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional
from contextlib import contextmanager

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding, PublicFormat, PrivateFormat, NoEncryption
)
from cryptography.exceptions import InvalidSignature

# Database imports - optional, falls back to in-memory if not available
try:
    from sqlalchemy.orm import Session
    from database.models import Actor as ActorModel, PendingRegistration, AuthChallenge, AuthToken
    from database.connection import SessionLocal, engine
    DB_AVAILABLE = engine is not None
except ImportError:
    DB_AVAILABLE = False
    Session = None
    SessionLocal = None


TIER0_ROOT       = "tier0_root"
TIER1_CERTIFIER  = "tier1_certifier"
TIER1_RECYCLER   = "tier1_recycler"
TIER1_REGULATOR  = "tier1_regulator"
TIER2_FACTORY    = "tier2_factory"
TIER2_SUPPLIER   = "tier2_supplier"
TIER2_LOGISTICS  = "tier2_logistics"

ALL_ROLES = [
    TIER0_ROOT, TIER1_CERTIFIER, TIER1_RECYCLER, TIER1_REGULATOR,
    TIER2_FACTORY, TIER2_SUPPLIER, TIER2_LOGISTICS,
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
    ],
    TIER2_SUPPLIER:  ["MaterialSourcingCredential"],
    TIER2_LOGISTICS: ["CustodyTransferCredential"],
}

TIER_LEVEL: dict[str, int] = {
    TIER0_ROOT: 0,
    TIER1_CERTIFIER: 1, TIER1_RECYCLER: 1, TIER1_REGULATOR: 1,
    TIER2_FACTORY: 2, TIER2_SUPPLIER: 2, TIER2_LOGISTICS: 2,
}

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
        """Return raw Ed25519 private key as base64. Only call once during registration/rotation."""
        raw = self._private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
        return base64.b64encode(raw).decode()

    def rotate_key(self) -> str:
        """Generate a new keypair in-place. Returns new private key as base64 (one-time)."""
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
    return Actor(
        did=did,
        name=name,
        role=role,
        approved_by=approved_by,
        _private_key=Ed25519PrivateKey.generate(),
    )


# In-memory cache for actors (populated from DB on startup if available)
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


def _create_actor_in_db(actor: Actor, private_key_b64: str) -> None:
    """Helper to create an actor in the database."""
    if not DB_AVAILABLE or not SessionLocal:
        return
    db = SessionLocal()
    try:
        db_actor = ActorModel(
            did=actor.did,
            name=actor.name,
            role=actor.role,
            approved_by=actor.approved_by,
            public_key_b64=actor.public_key_b64,
        )
        db.add(db_actor)
        db.commit()
    finally:
        db.close()


def _load_actors_from_db() -> None:
    """Load all actors from database into in-memory cache."""
    if not DB_AVAILABLE or not SessionLocal:
        return
    db = SessionLocal()
    try:
        db_actors = db.query(ActorModel).filter(ActorModel.is_active == True).all()
        # Note: We can only load public info from DB. Private keys are NOT stored.
        # For demo purposes, we generate new keys on startup (same as before).
        # In production, keys would be HSM-backed or held by client wallets.
        for db_actor in db_actors:
            # Generate a new keypair (in production, this would come from HSM/wallet)
            new_actor = _new_actor(db_actor.did, db_actor.name, db_actor.role, db_actor.approved_by)
            ACTOR_REGISTRY[db_actor.did] = new_actor
    finally:
        db.close()


def _bootstrap() -> None:
    """Bootstrap actor registry - creates demo actors in memory and optionally in DB."""
    # Load from DB first if available
    if DB_AVAILABLE:
        _load_actors_from_db()
        # If DB was empty, seed it
        if len(ACTOR_REGISTRY) == 0:
            _seed_actors_to_db()
            _load_actors_from_db()
    else:
        # Fallback to pure in-memory mode
        root = _new_actor(_ROOT_DID, "DPP Root Authority", TIER0_ROOT)
        ACTOR_REGISTRY[root.did] = root

        tier1 = [
            _new_actor(DEMO_CERTIFIER_DID,  "Intertek Certification",  TIER1_CERTIFIER,  _ROOT_DID),
            _new_actor(DEMO_CERTIFIER2_DID, "TUV SUD",                 TIER1_CERTIFIER,  _ROOT_DID),
            _new_actor(DEMO_RECYCLER_DID,   "Veolia Recycling",        TIER1_RECYCLER,   _ROOT_DID),
            _new_actor(DEMO_REGULATOR_DID,  "EU ESPR Regulator",       TIER1_REGULATOR,  _ROOT_DID),
        ]
        tier2 = [
            _new_actor(DEMO_SUPPLIER_DID,   "Raw Material Supplier",   TIER2_SUPPLIER,   _ROOT_DID),
            _new_actor(DEMO_LOGISTICS_DID,  "DHL Supply Chain",        TIER2_LOGISTICS,  _ROOT_DID),
            _new_actor(DEMO_FACTORY_DID,    "Alpha Manufacturing Co.",  TIER2_FACTORY,    _ROOT_DID),
            _new_actor(DEMO_FACTORY2_DID,   "Beta Industries Ltd.",     TIER2_FACTORY,    _ROOT_DID),
        ]
        for a in tier1 + tier2:
            ACTOR_REGISTRY[a.did] = a


def _seed_actors_to_db() -> None:
    """Seed initial demo actors to database."""
    if not DB_AVAILABLE or not SessionLocal:
        return

    db = SessionLocal()
    try:
        # Check if already seeded
        if db.query(ActorModel).count() > 0:
            return

        actors_to_seed = [
            ActorModel(did=_ROOT_DID, name="DPP Root Authority", role=TIER0_ROOT, approved_by=None, public_key_b64=""),
            ActorModel(did=DEMO_CERTIFIER_DID, name="Intertek Certification", role=TIER1_CERTIFIER, approved_by=_ROOT_DID, public_key_b64=""),
            ActorModel(did=DEMO_CERTIFIER2_DID, name="TUV SUD", role=TIER1_CERTIFIER, approved_by=_ROOT_DID, public_key_b64=""),
            ActorModel(did=DEMO_RECYCLER_DID, name="Veolia Recycling", role=TIER1_RECYCLER, approved_by=_ROOT_DID, public_key_b64=""),
            ActorModel(did=DEMO_REGULATOR_DID, name="EU ESPR Regulator", role=TIER1_REGULATOR, approved_by=_ROOT_DID, public_key_b64=""),
            ActorModel(did=DEMO_SUPPLIER_DID, name="Raw Material Supplier", role=TIER2_SUPPLIER, approved_by=_ROOT_DID, public_key_b64=""),
            ActorModel(did=DEMO_LOGISTICS_DID, name="DHL Supply Chain", role=TIER2_LOGISTICS, approved_by=_ROOT_DID, public_key_b64=""),
            ActorModel(did=DEMO_FACTORY_DID, name="Alpha Manufacturing Co.", role=TIER2_FACTORY, approved_by=_ROOT_DID, public_key_b64=""),
            ActorModel(did=DEMO_FACTORY2_DID, name="Beta Industries Ltd.", role=TIER2_FACTORY, approved_by=_ROOT_DID, public_key_b64=""),
        ]

        for actor_model in actors_to_seed:
            db.add(actor_model)
        db.commit()
    finally:
        db.close()


_bootstrap()


def get_or_create_factory_actor(os_id: str, name: str = "") -> Actor:
    did = f"did:dpp:{os_id.lower()}"
    if did not in ACTOR_REGISTRY:
        # Try to load from DB first
        if DB_AVAILABLE and SessionLocal:
            db = SessionLocal()
            try:
                db_actor = db.query(ActorModel).filter(ActorModel.did == did).first()
                if db_actor:
                    # Create in-memory actor with new keypair (demo mode)
                    new_actor = _new_actor(did, db_actor.name or name or os_id, TIER2_FACTORY, db_actor.approved_by)
                    ACTOR_REGISTRY[did] = new_actor
                    return new_actor
            finally:
                db.close()

        # Create new actor
        new_actor = _new_actor(did, name or os_id, TIER2_FACTORY, _ROOT_DID)
        ACTOR_REGISTRY[did] = new_actor

        # Save to DB
        _create_actor_in_db(new_actor, new_actor.export_private_key_b64())

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


# Database-backed storage for challenges, tokens, and pending registrations
def _get_db_session() -> Optional[Session]:
    if DB_AVAILABLE and SessionLocal:
        return SessionLocal()
    return None


# In-memory fallback if DB not available
_challenges: dict[str, dict] = {}
_tokens: dict[str, str] = {}


def create_challenge(did: str) -> str:
    actor = get_actor(did)
    if not actor:
        raise ValueError(f"Unknown DID: {did}")

    db = _get_db_session()
    if db:
        try:
            nonce = secrets.token_hex(32)
            db_challenge = AuthChallenge(
                nonce=nonce,
                did=did,
                expires_at=time.time() + 300,
            )
            db.add(db_challenge)
            db.commit()
            return nonce
        finally:
            db.close()
    else:
        # In-memory fallback
        nonce = secrets.token_hex(32)
        _challenges[nonce] = {"did": did, "expires": time.time() + 300}
        return nonce


def verify_challenge(did: str, nonce: str, signature_b64: str) -> Optional[str]:
    db = _get_db_session()
    if db:
        try:
            db_challenge = db.query(AuthChallenge).filter(AuthChallenge.nonce == nonce).first()
            if not db_challenge:
                return None
            if db_challenge.did != did or time.time() > db_challenge.expires_at.timestamp():
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
    else:
        # In-memory fallback
        entry = _challenges.get(nonce)
        if not entry:
            return None
        if entry["did"] != did or time.time() > entry["expires"]:
            _challenges.pop(nonce, None)
            return None
        actor = get_actor(did)
        if not actor or not actor.verify(nonce.encode(), signature_b64):
            _challenges.pop(nonce, None)
            return None
        _challenges.pop(nonce, None)
        token = secrets.token_hex(32)
        _tokens[token] = did
        return token


def resolve_token(token: str) -> Optional[Actor]:
    db = _get_db_session()
    if db:
        try:
            db_token = db.query(AuthToken).filter(AuthToken.token == token).first()
            if db_token:
                return get_actor(db_token.did)
            return None
        finally:
            db.close()
    else:
        # In-memory fallback
        did = _tokens.get(token)
        return get_actor(did) if did else None


# Pending registrations for Tier 1 actors
def add_pending_registration(did: str, name: str, role: str, email: str, public_key_b64: str) -> None:
    db = _get_db_session()
    if db:
        try:
            pending = PendingRegistration(
                did=did,
                name=name,
                role=role,
                email=email,
                public_key_b64=public_key_b64,
            )
            db.add(pending)
            db.commit()
        finally:
            db.close()


def get_pending_registrations() -> list[dict]:
    db = _get_db_session()
    if db:
        try:
            pending = db.query(PendingRegistration).all()
            return [
                {
                    "did": p.did,
                    "name": p.name,
                    "role": p.role,
                    "email": p.email,
                    "submitted": p.submitted_at.isoformat(),
                }
                for p in pending
            ]
        finally:
            db.close()
    return []


def approve_pending_registration(did: str, approved_by: str) -> Optional[dict]:
    db = _get_db_session()
    if db:
        try:
            pending = db.query(PendingRegistration).filter(PendingRegistration.did == did).first()
            if not pending:
                return None

            # Create the actor in DB
            db_actor = ActorModel(
                did=pending.did,
                name=pending.name,
                role=pending.role,
                approved_by=approved_by,
                public_key_b64=pending.public_key_b64,
            )
            db.add(db_actor)
            db.delete(pending)
            db.commit()

            # Also add to in-memory registry
            actor = _new_actor(pending.did, pending.name, pending.role, approved_by)
            ACTOR_REGISTRY[actor.did] = actor

            return actor.to_public_dict()
        finally:
            db.close()
    return None


def reject_pending_registration(did: str) -> bool:
    db = _get_db_session()
    if db:
        try:
            pending = db.query(PendingRegistration).filter(PendingRegistration.did == did).first()
            if pending:
                db.delete(pending)
                db.commit()
                return True
        finally:
            db.close()
    return False


def register_actor_direct(did: str, name: str, role: str, public_key_b64: str) -> Actor:
    """Register a Tier 2 actor directly (no approval needed)."""
    db = _get_db_session()
    if db:
        try:
            db_actor = ActorModel(
                did=did,
                name=name,
                role=role,
                approved_by=_ROOT_DID,  # Auto-approved for Tier 2
                public_key_b64=public_key_b64,
            )
            db.add(db_actor)
            db.commit()
        finally:
            db.close()

    # Create in-memory actor (key already generated by caller)
    # Note: We can't reconstruct the private key from public_key_b64
    # The caller should have already received the private key at generation time
    actor = _new_actor(did, name, role, _ROOT_DID)
    ACTOR_REGISTRY[did] = actor
    return actor


def revoke_actor(did: str) -> bool:
    """Remove an actor from the registry and invalidate all their tokens."""
    if did not in ACTOR_REGISTRY:
        return False

    # Remove from in-memory
    del ACTOR_REGISTRY[did]

    db = _get_db_session()
    if db:
        try:
            # Invalidate all tokens for this actor
            db.query(AuthToken).filter(AuthToken.did == did).delete()
            # Mark actor as inactive (don't delete for audit trail)
            db.query(ActorModel).filter(ActorModel.did == did).update({"is_active": False})
            db.commit()
        finally:
            db.close()

    return True


def invalidate_actor_tokens(did: str) -> int:
    """Invalidate all tokens for an actor (e.g., on key rotation)."""
    count = 0
    db = _get_db_session()
    if db:
        try:
            count = db.query(AuthToken).filter(AuthToken.did == did).delete()
            db.commit()
            return count
        finally:
            db.close()

    # In-memory fallback
    to_remove = [t for t, d in _tokens.items() if d == did]
    for t in to_remove:
        del _tokens[t]
    return len(to_remove)


def get_all_actors() -> list[Actor]:
    """Get all registered actors."""
    return list(ACTOR_REGISTRY.values())


def get_actor_by_did(did: str) -> Optional[Actor]:
    """Get actor by DID."""
    return get_actor(did)
