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

import base64
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from cryptography.exceptions import InvalidSignature


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



ACTOR_REGISTRY: dict[str, Actor] = {}

_ROOT_DID = "did:dpp:root-authority"

DEMO_CERTIFIER_DID  = "did:dpp:certifier-intertek"
DEMO_CERTIFIER2_DID = "did:dpp:certifier-tuv"
DEMO_RECYCLER_DID   = "did:dpp:recycler-veolia"
DEMO_REGULATOR_DID  = "did:dpp:regulator-eu-espr"
DEMO_SUPPLIER_DID   = "did:dpp:supplier-rawmat"
DEMO_LOGISTICS_DID  = "did:dpp:logistics-dhl"


def _bootstrap() -> None:
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
    ]
    for a in tier1 + tier2:
        ACTOR_REGISTRY[a.did] = a


_bootstrap()


def get_or_create_factory_actor(os_id: str, name: str = "") -> Actor:
    did = f"did:dpp:{os_id.lower()}"
    if did not in ACTOR_REGISTRY:
        ACTOR_REGISTRY[did] = _new_actor(did, name or os_id, TIER2_FACTORY, _ROOT_DID)
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


_challenges: dict[str, dict] = {}   
_tokens: dict[str, str] = {}


def create_challenge(did: str) -> str:
    if did not in ACTOR_REGISTRY:
        raise ValueError(f"Unknown DID: {did}")
    nonce = secrets.token_hex(32)
    _challenges[nonce] = {"did": did, "expires": time.time() + 300}
    return nonce


def verify_challenge(did: str, nonce: str, signature_b64: str) -> Optional[str]:
    entry = _challenges.get(nonce)
    if not entry:
        return None
    if entry["did"] != did or time.time() > entry["expires"]:
        _challenges.pop(nonce, None)
        return None
    actor = get_actor(did)
    if not actor or not actor.verify(nonce.encode(), signature_b64):
        return None
    _challenges.pop(nonce, None)
    token = secrets.token_hex(32)
    _tokens[token] = did
    return token


def resolve_token(token: str) -> Optional[Actor]:
    did = _tokens.get(token)
    return get_actor(did) if did else None
