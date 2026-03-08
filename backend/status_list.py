import base64
import gzip
import threading

_lock = threading.Lock()
_bits: bytearray = bytearray(1024)   
_next_index: int = 0

_credential_meta: dict[int, dict] = {}   

STATUS_LIST_ID   = "https://dpp.example.org/status/1"
STATUS_LIST_TYPE = "StatusList2021"


def allocate_index(credential_id: str, product_id: str, vc_type: str) -> int:
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
    with _lock:
        byte_pos = index // 8
        bit_pos  = index % 8
        if byte_pos >= len(_bits):
            return False
        _bits[byte_pos] |= (1 << bit_pos)
        return True


def is_revoked(index: int) -> bool:
    with _lock:
        byte_pos = index // 8
        bit_pos  = index % 8
        if byte_pos >= len(_bits):
            return False
        return bool(_bits[byte_pos] & (1 << bit_pos))


def encoded_list() -> str:
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
    from datetime import datetime, timezone
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


def lookup_by_credential_id(credential_id: str) -> tuple[int, bool] | tuple[None, None]:
    for idx, meta in _credential_meta.items():
        if meta["credential_id"] == credential_id:
            return idx, is_revoked(idx)
    return None, None


def list_all() -> list[dict]:
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
