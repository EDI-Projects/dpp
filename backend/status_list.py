from __future__ import annotations
import base64
import gzip
import threading
from datetime import datetime, timezone
from typing import Optional

# Database imports - optional, falls back to in-memory if not available
try:
    from sqlalchemy.orm import Session
    from database.models import CredentialStatus, StatusListBit, StatusListMeta
    from database.connection import SessionLocal, engine
    DB_AVAILABLE = engine is not None
except ImportError:
    DB_AVAILABLE = False
    Session = None
    SessionLocal = None

_lock = threading.Lock()

# In-memory fallback
_bits: bytearray = bytearray(1024)
_next_index: int = 0
_credential_meta: dict[int, dict] = {}

STATUS_LIST_ID   = "https://dpp.example.org/status/1"
STATUS_LIST_TYPE = "StatusList2021"


def _get_db_session() -> Optional[Session]:
    if DB_AVAILABLE and SessionLocal:
        return SessionLocal()
    return None


def _get_next_index_db() -> int:
    """Get the next available status index from DB."""
    db = _get_db_session()
    if db:
        try:
            max_entry = db.query(StatusListMeta).order_by(StatusListMeta.status_index.desc()).first()
            if max_entry:
                return max_entry.status_index + 1
            return 0
        finally:
            db.close()
    return 0


def allocate_index(credential_id: str, product_id: str, vc_type: str) -> int:
    db = _get_db_session()
    if db:
        try:
            # Get next index
            max_entry = db.query(StatusListMeta).order_by(StatusListMeta.status_index.desc()).first()
            idx = (max_entry.status_index + 1) if max_entry else 0

            # Create status meta entry
            status_meta = StatusListMeta(
                status_index=idx,
                credential_id=credential_id,
                product_id=product_id,
                vc_type=vc_type,
            )
            db.add(status_meta)

            # Create credential status entry
            cred_status = CredentialStatus(
                credential_id=credential_id,
                product_id=product_id,
                vc_type=vc_type,
                status_index=idx,
                is_revoked=False,
            )
            db.add(cred_status)

            # Create status list bit entry if needed
            byte_pos = idx // 8
            existing_bit = db.query(StatusListBit).filter(StatusListBit.byte_position == byte_pos).first()
            if not existing_bit:
                db.add(StatusListBit(byte_position=byte_pos, bits=0))

            db.commit()
            return idx
        finally:
            db.close()
    else:
        # In-memory fallback
        global _next_index
        with _lock:
            idx = _next_index
            _next_index += 1
            byte_needed = idx // 8
            if byte_needed >= len(_bits):
                _bits.extend(bytearray(1024))
            _credential_meta[idx] = {
                "credential_id": credential_id,
                "product_id":    product_id,
                "vc_type":       vc_type,
            }
            return idx


def revoke(index: int) -> bool:
    db = _get_db_session()
    if db:
        try:
            # Update credential status
            db.query(CredentialStatus).filter(CredentialStatus.status_index == index).update({
                "is_revoked": True,
                "revoked_at": datetime.now(timezone.utc),
            })

            # Update bit in status_list_bits
            byte_pos = index // 8
            bit_pos = index % 8
            bit_entry = db.query(StatusListBit).filter(StatusListBit.byte_position == byte_pos).first()
            if bit_entry:
                bit_entry.bits |= (1 << bit_pos)
            else:
                db.add(StatusListBit(byte_position=byte_pos, bits=(1 << bit_pos)))

            db.commit()
            return True
        finally:
            db.close()
    else:
        # In-memory fallback
        with _lock:
            byte_pos = index // 8
            bit_pos = index % 8
            if byte_pos >= len(_bits):
                return False
            _bits[byte_pos] |= (1 << bit_pos)
            return True


def is_revoked(index: int) -> bool:
    db = _get_db_session()
    if db:
        try:
            cred_status = db.query(CredentialStatus).filter(CredentialStatus.status_index == index).first()
            if cred_status:
                return cred_status.is_revoked
            return False
        finally:
            db.close()
    else:
        # In-memory fallback
        with _lock:
            byte_pos = index // 8
            bit_pos = index % 8
            if byte_pos >= len(_bits):
                return False
            return bool(_bits[byte_pos] & (1 << bit_pos))


def is_revoked_by_credential_id(credential_id: str) -> bool:
    """Check if a credential is revoked by credential_id directly."""
    db = _get_db_session()
    if db:
        try:
            cred_status = db.query(CredentialStatus).filter(CredentialStatus.credential_id == credential_id).first()
            if cred_status:
                return cred_status.is_revoked
            return False
        finally:
            db.close()
    else:
        # In-memory fallback
        idx, revoked = lookup_by_credential_id(credential_id)
        return revoked if idx is not None else False


def encoded_list() -> str:
    db = _get_db_session()
    if db:
        try:
            # Get all bit entries ordered by byte_position
            bit_entries = db.query(StatusListBit).order_by(StatusListBit.byte_position).all()

            if not bit_entries:
                # Empty list
                compressed = gzip.compress(bytearray(1024))
                return base64.urlsafe_b64encode(compressed).decode()

            # Find max byte position
            max_byte_pos = max(e.byte_position for e in bit_entries)

            # Reconstruct bytearray
            bits_array = bytearray(max_byte_pos + 1)
            for entry in bit_entries:
                bits_array[entry.byte_position] = entry.bits & 0xFF

            compressed = gzip.compress(bits_array)
            return base64.urlsafe_b64encode(compressed).decode()
        finally:
            db.close()
    else:
        # In-memory fallback
        compressed = gzip.compress(bytes(_bits))
        return base64.urlsafe_b64encode(compressed).decode()


def credential_status_entry(index: int) -> dict:
    return {
        "id":                    f"{STATUS_LIST_ID}#{index}",
        "type":                  "StatusList2021Entry",
        "statusPurpose":         "revocation",
        "statusListIndex":       str(index),
        "statusListCredential":  STATUS_LIST_ID,
    }


def status_list_vc(issuer_did: str) -> dict:
    return {
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://w3id.org/vc/status-list/2021/v1"
        ],
        "type": ["VerifiableCredential", "StatusList2021Credential"],
        "id": STATUS_LIST_ID,
        "issuer": issuer_did,
        "issuanceDate": datetime.now(timezone.utc).isoformat(),
        "credentialSubject": {
            "id": STATUS_LIST_ID,
            "type": STATUS_LIST_TYPE,
            "statusPurpose": "revocation",
            "encodedList": encoded_list(),
        }
    }


def lookup_by_credential_id(credential_id: str) -> tuple[Optional[int], bool]:
    db = _get_db_session()
    if db:
        try:
            cred_status = db.query(CredentialStatus).filter(CredentialStatus.credential_id == credential_id).first()
            if cred_status:
                return cred_status.status_index, cred_status.is_revoked
            return None, False
        finally:
            db.close()
    else:
        # In-memory fallback
        for idx, meta in _credential_meta.items():
            if meta["credential_id"] == credential_id:
                return idx, is_revoked(idx)
        return None, False


def list_all() -> list[dict]:
    db = _get_db_session()
    if db:
        try:
            entries = db.query(CredentialStatus).all()
            return [
                {
                    "index":         e.status_index,
                    "credential_id": e.credential_id,
                    "product_id":    e.product_id,
                    "vc_type":       e.vc_type,
                    "revoked":       e.is_revoked,
                }
                for e in entries
            ]
        finally:
            db.close()
    else:
        # In-memory fallback
        result = []
        for idx, meta in _credential_meta.items():
            result.append({
                "index":         idx,
                "credential_id": meta["credential_id"],
                "product_id":    meta["product_id"],
                "vc_type":       meta["vc_type"],
                "revoked":       is_revoked(idx),
            })
        return result


def get_status_index(credential_id: str) -> Optional[int]:
    """Get the status index for a credential."""
    db = _get_db_session()
    if db:
        try:
            cred_status = db.query(CredentialStatus).filter(CredentialStatus.credential_id == credential_id).first()
            if cred_status:
                return cred_status.status_index
            return None
        finally:
            db.close()
    else:
        idx, _ = lookup_by_credential_id(credential_id)
        return idx
