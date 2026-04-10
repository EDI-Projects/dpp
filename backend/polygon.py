"""
Polygon on-chain anchoring for Digital Product Passport credentials.

Writes IPFS CIDs and revocation events to a simple smart contract on
Polygon Amoy testnet. If POLYGON_PRIVATE_KEY is not set, all operations
gracefully return None (off-chain-only mode).
"""

from __future__ import annotations
import os
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

POLYGON_RPC_URL = os.getenv("POLYGON_RPC_URL", "https://rpc-amoy.polygon.technology")
POLYGON_PRIVATE_KEY = os.getenv("POLYGON_PRIVATE_KEY", "")
POLYGON_CONTRACT_ADDRESS = os.getenv("POLYGON_CONTRACT_ADDRESS", "")

ENABLED = bool(POLYGON_PRIVATE_KEY and POLYGON_CONTRACT_ADDRESS)

# Lazy-loaded web3 instance
_w3 = None
_contract = None
_account = None

# ABI for DPPAnchor contract (matches contracts/DPPAnchor.sol)
CONTRACT_ABI = json.loads("""[
    {
        "inputs": [{"internalType": "bytes32", "name": "credentialHash", "type": "bytes32"},
                   {"internalType": "string", "name": "ipfsCid", "type": "string"},
                   {"internalType": "string", "name": "vcType", "type": "string"}],
        "name": "anchorCredential",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "credentialHash", "type": "bytes32"},
                   {"internalType": "string", "name": "reason", "type": "string"}],
        "name": "revokeCredential",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "credentialHash", "type": "bytes32"}],
        "name": "getAnchor",
        "outputs": [{"internalType": "string", "name": "ipfsCid", "type": "string"},
                    {"internalType": "string", "name": "vcType", "type": "string"},
                    {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
                    {"internalType": "bool", "name": "revoked", "type": "bool"},
                    {"internalType": "string", "name": "revokeReason", "type": "string"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "anonymous": false,
        "inputs": [{"indexed": true, "internalType": "bytes32", "name": "credentialHash", "type": "bytes32"},
                   {"indexed": false, "internalType": "string", "name": "ipfsCid", "type": "string"},
                   {"indexed": false, "internalType": "string", "name": "vcType", "type": "string"},
                   {"indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256"}],
        "name": "CredentialAnchored",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [{"indexed": true, "internalType": "bytes32", "name": "credentialHash", "type": "bytes32"},
                   {"indexed": false, "internalType": "string", "name": "reason", "type": "string"},
                   {"indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256"}],
        "name": "CredentialRevoked",
        "type": "event"
    }
]""")


def _init():
    """Lazy-init web3 connection, contract, and account."""
    global _w3, _contract, _account

    if _w3 is not None:
        return

    if not ENABLED:
        logger.warning("POLYGON_PRIVATE_KEY or POLYGON_CONTRACT_ADDRESS not set — on-chain anchoring disabled.")
        return

    try:
        from web3 import Web3
        _w3 = Web3(Web3.HTTPProvider(POLYGON_RPC_URL))
        if not _w3.is_connected():
            logger.error(f"Cannot connect to Polygon RPC at {POLYGON_RPC_URL}")
            _w3 = None
            return

        _account = _w3.eth.account.from_key(POLYGON_PRIVATE_KEY)
        _contract = _w3.eth.contract(
            address=Web3.to_checksum_address(POLYGON_CONTRACT_ADDRESS),
            abi=CONTRACT_ABI,
        )
        logger.info(f"Polygon anchoring initialized — contract {POLYGON_CONTRACT_ADDRESS}, "
                     f"account {_account.address}")
    except Exception as e:
        logger.error(f"Polygon init failed: {e}")
        _w3 = None


def _credential_hash(credential_id: str) -> bytes:
    """Compute keccak256 hash of credential ID string."""
    from web3 import Web3
    return Web3.solidity_keccak(["string"], [credential_id])


def _send_tx(tx_func) -> Optional[str]:
    """Build, sign, and send a contract transaction. Returns tx hash hex."""
    _init()
    if not _w3 or not _contract or not _account:
        return None

    try:
        nonce = _w3.eth.get_transaction_count(_account.address)
        tx = tx_func.build_transaction({
            "from": _account.address,
            "nonce": nonce,
            "gas": 300_000,
            "gasPrice": _w3.eth.gas_price,
            "chainId": _w3.eth.chain_id,
        })
        signed = _account.sign_transaction(tx)
        tx_hash = _w3.eth.send_raw_transaction(signed.raw_transaction)
        hex_hash = tx_hash.hex()

        # Wait for receipt (up to 60s)
        receipt = _w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        if receipt.status != 1:
            logger.error(f"Transaction reverted: {hex_hash}")
            return None

        logger.info(f"On-chain tx confirmed: {hex_hash}")
        return hex_hash

    except Exception as e:
        logger.error(f"Polygon transaction failed: {e}")
        return None


def anchor_credential(credential_id: str, ipfs_cid: str, vc_type: str) -> Optional[str]:
    """
    Anchor a credential's IPFS CID on Polygon.
    Returns transaction hash or None if anchoring is disabled/failed.
    """
    if not ENABLED:
        return None

    _init()
    if not _contract:
        return None

    cred_hash = _credential_hash(credential_id)
    tx_func = _contract.functions.anchorCredential(cred_hash, ipfs_cid, vc_type)
    return _send_tx(tx_func)


def anchor_revocation(credential_id: str, reason: str = "Revoked") -> Optional[str]:
    """
    Record a credential revocation on Polygon.
    Returns transaction hash or None.
    """
    if not ENABLED:
        return None

    _init()
    if not _contract:
        return None

    cred_hash = _credential_hash(credential_id)
    tx_func = _contract.functions.revokeCredential(cred_hash, reason)
    return _send_tx(tx_func)


def verify_anchor(credential_id: str) -> Optional[dict]:
    """
    Read on-chain anchor for a credential. Returns anchor data or None.
    """
    _init()
    if not _w3 or not _contract:
        return None

    try:
        cred_hash = _credential_hash(credential_id)
        result = _contract.functions.getAnchor(cred_hash).call()
        ipfs_cid, vc_type, timestamp, revoked, reason = result

        if not ipfs_cid:
            return None

        return {
            "credential_id": credential_id,
            "ipfs_cid": ipfs_cid,
            "vc_type": vc_type,
            "anchored_at": timestamp,
            "revoked": revoked,
            "revoke_reason": reason,
        }
    except Exception as e:
        logger.error(f"Polygon anchor read failed for {credential_id}: {e}")
        return None


def is_available() -> bool:
    """Check if Polygon integration is configured."""
    return ENABLED
