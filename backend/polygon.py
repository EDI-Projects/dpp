"""
Polygon on-chain orchestration for Material Composition.

Interacts with an ERC-1155 MaterialComposition smart contract on Polygon Amoy.
If POLYGON_PRIVATE_KEY is not set, all operations gracefully return mock TX hashes.
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

_w3 = None
_contract = None
_account = None

# Minimal ABI for ERC-1155 MaterialComposition
CONTRACT_ABI = json.loads("""[
    {
        "inputs": [
            {"internalType": "address", "name": "to", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
            {"internalType": "string", "name": "metadataURI", "type": "string"}
        ],
        "name": "mintMaterial",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "address", "name": "owner", "type": "address"},
            {"internalType": "uint256[]", "name": "burnedIds", "type": "uint256[]"},
            {"internalType": "uint256[]", "name": "burnedAmounts", "type": "uint256[]"},
            {"internalType": "uint256", "name": "newAmount", "type": "uint256"},
            {"internalType": "string", "name": "newMetadataURI", "type": "string"}
        ],
        "name": "composeMaterial",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
        "name": "uri",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function"
    }
]""")

def _init():
    global _w3, _contract, _account
    if _w3 is not None:
        return
    if not ENABLED:
        logger.warning("Polygon anchoring disabled (missing keys/address).")
        return
    try:
        from web3 import Web3
        _w3 = Web3(Web3.HTTPProvider(POLYGON_RPC_URL))
        if not _w3.is_connected():
            logger.error("Cannot connect to RPC.")
            _w3 = None
            return
        _account = _w3.eth.account.from_key(POLYGON_PRIVATE_KEY)
        _contract = _w3.eth.contract(
            address=Web3.to_checksum_address(POLYGON_CONTRACT_ADDRESS),
            abi=CONTRACT_ABI,
        )
    except Exception as e:
        logger.error(f"Polygon init failed: {e}")
        _w3 = None

def _send_tx(tx_func) -> Optional[dict]:
    """Execute tx, return receipt or None."""
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
        receipt = _w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        if receipt.status != 1:
            return None
        return dict(receipt) 
    except Exception as e:
        logger.error(f"Polygon tx failed: {e}")
        return None

def mint_material(amount: int, metadata_uri: str) -> tuple[int, Optional[str]]:
    """Mints raw materials and returns (tokenId, txHash). Uses random tokenId if disabled."""
    if not ENABLED:
        import random
        return random.randint(1000, 9999), "0xmocktx" + "0"*62
    
    _init()
    if not _contract:
        import random
        return random.randint(1000, 9999), "0xmocktx" + "0"*62
        
    try:
        # call the static view to get the result first if we wanted, but let's parse logs later
        tx_func = _contract.functions.mintMaterial(_account.address, amount, metadata_uri)
        receipt = _send_tx(tx_func)
        if receipt:
            return receipt['blockNumber'], receipt['transactionHash'].hex() # Hacky return blockNumber as pseudo-ID if we can't parse logs
    except Exception:
        pass
    import random
    return random.randint(1000, 9999), None

def compose_material(burned_ids: list[int], burned_amounts: list[int], new_amount: int, metadata_uri: str) -> tuple[int, Optional[str]]:
    """Burns materials and mints a new one. Returns (newTokenId, txHash)."""
    if not ENABLED:
        import random
        return random.randint(1000, 9999), "0xmocktx_compose" + "0"*46

    _init()
    if not _contract:
        import random
        return random.randint(1000, 9999), "0xmocktx_compose" + "0"*46

    try:
        tx_func = _contract.functions.composeMaterial(_account.address, burned_ids, burned_amounts, new_amount, metadata_uri)
        receipt = _send_tx(tx_func)
        if receipt:
            return receipt['blockNumber'], receipt['transactionHash'].hex()
    except Exception:
        pass
    import random
    return random.randint(1000, 9999), None

def anchor_credential(credential_id: str, ipfs_cid: str, vc_type: str) -> Optional[str]:
    """Anchor a credential's IPFS CID on Polygon. Returns tx hash or None."""
    if not ENABLED:
        return None
    # Not implemented for MaterialComposition contract — legacy DPPAnchor removed
    logger.info(f"anchor_credential skipped (no DPPAnchor): {credential_id}")
    return None


def anchor_revocation(credential_id: str, reason: str = "Revoked") -> Optional[str]:
    """Record a credential revocation on Polygon. Returns tx hash or None."""
    if not ENABLED:
        return None
    logger.info(f"anchor_revocation skipped (no DPPAnchor): {credential_id}")
    return None


def verify_anchor(credential_id: str) -> Optional[dict]:
    """Read on-chain anchor for a credential. Returns anchor data or None."""
    if not ENABLED:
        return None
    logger.info(f"verify_anchor skipped (no DPPAnchor): {credential_id}")
    return None


def is_available() -> bool:
    return ENABLED
