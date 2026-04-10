"""
IPFS pinning via Pinata.

Pins signed VC JSON payloads to IPFS. If PINATA_JWT is not set,
all operations gracefully return None (local-only mode).
"""

from __future__ import annotations
import json
import os
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

PINATA_JWT = os.getenv("PINATA_JWT", "")
PINATA_GATEWAY = os.getenv("PINATA_GATEWAY", "https://gateway.pinata.cloud")
PINATA_API = "https://api.pinata.cloud"

ENABLED = bool(PINATA_JWT)

if not ENABLED:
    logger.warning("PINATA_JWT not set — IPFS pinning disabled. Credentials stored locally only.")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {PINATA_JWT}",
        "Content-Type": "application/json",
    }


def pin_json(credential_id: str, vc_payload: dict) -> Optional[str]:
    """
    Pin a VC JSON payload to IPFS via Pinata.
    Returns the IPFS CID (content hash) or None if pinning is disabled/failed.
    """
    if not ENABLED:
        return None

    try:
        body = {
            "pinataContent": vc_payload,
            "pinataMetadata": {
                "name": credential_id,
                "keyvalues": {
                    "credential_id": credential_id,
                    "vc_type": vc_payload.get("type", ["Unknown"])[-1],
                    "issuer": vc_payload.get("issuer", ""),
                },
            },
            "pinataOptions": {
                "cidVersion": 1,
            },
        }

        resp = httpx.post(
            f"{PINATA_API}/pinning/pinJSONToIPFS",
            headers=_headers(),
            json=body,
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
        cid = data.get("IpfsHash")
        logger.info(f"Pinned {credential_id} → CID {cid}")
        return cid

    except Exception as e:
        logger.error(f"Pinata pin failed for {credential_id}: {e}")
        return None


def get_json(cid: str) -> Optional[dict]:
    """Retrieve pinned JSON from IPFS via Pinata gateway."""
    if not cid:
        return None

    try:
        resp = httpx.get(
            f"{PINATA_GATEWAY}/ipfs/{cid}",
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"IPFS retrieval failed for CID {cid}: {e}")
        return None


def unpin(cid: str) -> bool:
    """Unpin content from Pinata (e.g. after credential revocation)."""
    if not ENABLED or not cid:
        return False

    try:
        resp = httpx.delete(
            f"{PINATA_API}/pinning/unpin/{cid}",
            headers=_headers(),
            timeout=15.0,
        )
        resp.raise_for_status()
        logger.info(f"Unpinned CID {cid}")
        return True
    except Exception as e:
        logger.error(f"Pinata unpin failed for CID {cid}: {e}")
        return False


def is_available() -> bool:
    """Check if Pinata integration is configured and reachable."""
    return ENABLED
