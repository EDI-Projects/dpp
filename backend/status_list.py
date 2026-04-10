"""
StatusList2021 — W3C credential revocation (PostgreSQL-backed)

Every credential gets a status index. Revocation flips a bit in a compressed
bitset stored in the status_list_bits table.
"""

from __future__ import annotations
import base64
import gzip
from datetime import datetime, timezone
from typing import Optional

from database.models import CredentialStatus, StatusListBit, StatusListMeta
from database.connection import SessionLocal

STATUS_LIST_ID   = "https://dpp.example.org/status/1"
STATUS_LIST_TYPE = "StatusList2021"


def allocate_index(credential_id: str, product_id: str, vc_type: str) -> int:
    db = SessionLocal()
    try:
        max_entry = db.query(StatusListMeta).order_by(StatusListMeta.status_index.desc()).first()
        idx = (max_entry.status_index + 1) if max_entry else 0

        db.add(StatusListMeta(
            status_index=idx, credential_id=credential_id,
            product_id=product_id, vc_type=vc_type,
        ))
        db.add(CredentialStatus(
            credential_id=credential_id, product_id=product_id,
            vc_type=vc_type, status_index=idx, is_revoked=False,
        ))

        byte_pos = idx // 8
        existing = db.query(StatusListBit).filter(StatusListBit.byte_position == byte_pos).first()
        if not existing:
            db.add(StatusListBit(byte_position=byte_pos, bits=0))

        db.commit()
        return idx
    finally:
        db.close()


def revoke(index: int) -> bool:
    db = SessionLocal()
    try:
        db.query(CredentialStatus).filter(CredentialStatus.status_index == index).update({
            "is_revoked": True,
            "revoked_at": datetime.now(timezone.utc),
        })
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


def is_revoked(index: int) -> bool:
    db = SessionLocal()
    try:
        cs = db.query(CredentialStatus).filter(CredentialStatus.status_index == index).first()
        return cs.is_revoked if cs else False
    finally:
        db.close()


def is_revoked_by_credential_id(credential_id: str) -> bool:
    db = SessionLocal()
    try:
        cs = db.query(CredentialStatus).filter(CredentialStatus.credential_id == credential_id).first()
        return cs.is_revoked if cs else False
    finally:
        db.close()


def encoded_list() -> str:
    db = SessionLocal()
    try:
        entries = db.query(StatusListBit).order_by(StatusListBit.byte_position).all()
        if not entries:
            compressed = gzip.compress(bytearray(1024))
            return base64.urlsafe_b64encode(compressed).decode()

        max_pos = max(e.byte_position for e in entries)
        bits_array = bytearray(max_pos + 1)
        for e in entries:
            bits_array[e.byte_position] = e.bits & 0xFF
        compressed = gzip.compress(bits_array)
        return base64.urlsafe_b64encode(compressed).decode()
    finally:
        db.close()


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
    db = SessionLocal()
    try:
        cs = db.query(CredentialStatus).filter(CredentialStatus.credential_id == credential_id).first()
        if cs:
            return cs.status_index, cs.is_revoked
        return None, False
    finally:
        db.close()


def list_all() -> list[dict]:
    db = SessionLocal()
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


def get_status_index(credential_id: str) -> Optional[int]:
    db = SessionLocal()
    try:
        cs = db.query(CredentialStatus).filter(CredentialStatus.credential_id == credential_id).first()
        return cs.status_index if cs else None
    finally:
        db.close()
