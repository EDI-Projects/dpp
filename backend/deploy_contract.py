"""
Deploy MaterialComposition contract to Polygon Amoy testnet.

Usage:
  python deploy_contract.py

Requires POLYGON_RPC_URL and POLYGON_PRIVATE_KEY in .env
Outputs the contract address to set as POLYGON_CONTRACT_ADDRESS.
"""

import os
import json
import sys

from dotenv import load_dotenv
load_dotenv()

POLYGON_RPC_URL = os.getenv("POLYGON_RPC_URL", "https://rpc-amoy.polygon.technology")
POLYGON_PRIVATE_KEY = os.getenv("POLYGON_PRIVATE_KEY", "")

if not POLYGON_PRIVATE_KEY:
    print("ERROR: POLYGON_PRIVATE_KEY not set in .env")
    sys.exit(1)

from web3 import Web3

w3 = Web3(Web3.HTTPProvider(POLYGON_RPC_URL))
if not w3.is_connected():
    print(f"ERROR: Cannot connect to {POLYGON_RPC_URL}")
    sys.exit(1)

account = w3.eth.account.from_key(POLYGON_PRIVATE_KEY)
balance = w3.eth.get_balance(account.address)
print(f"Deployer: {account.address}")
print(f"Balance:  {w3.from_wei(balance, 'ether')} MATIC")

if balance == 0:
    print("ERROR: Account has no MATIC. Get testnet MATIC from https://faucet.polygon.technology/")
    sys.exit(1)

abi_path = os.path.join(os.path.dirname(__file__), "contracts/build/MaterialComposition_sol_MaterialComposition.abi")
bin_path = os.path.join(os.path.dirname(__file__), "contracts/build/MaterialComposition_sol_MaterialComposition.bin")

try:
    with open(abi_path, "r") as f:
        CONTRACT_ABI = json.load(f)
    with open(bin_path, "r") as f:
        CONTRACT_BYTECODE = f.read().strip()
except FileNotFoundError:
    print(f"ERROR: ABI or BIN file not found. Ensure you ran `npx solc` first.")
    sys.exit(1)

print("\nDeploying MaterialComposition contract...")

contract = w3.eth.contract(abi=CONTRACT_ABI, bytecode=CONTRACT_BYTECODE)
nonce = w3.eth.get_transaction_count(account.address)

base_tx = {
    "from": account.address,
    "nonce": nonce,
    "gasPrice": w3.eth.gas_price,
    "gas": 4000000,
    "chainId": w3.eth.chain_id,
}


tx = contract.constructor().build_transaction(base_tx)

signed = account.sign_transaction(tx)
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
print(f"Tx sent: {tx_hash.hex()}")
print("Waiting for confirmation...")

receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

if receipt.status == 1:
    contract_address = receipt.contractAddress
    print(f"\n✅ Contract deployed successfully!")
    print(f"   Address: {contract_address}")
    print(f"   Tx hash: {tx_hash.hex()}")
    print(f"\nAdd this to your .env:")
    print(f"   POLYGON_CONTRACT_ADDRESS={contract_address}")
else:
    print(f"\n❌ Deployment failed. Tx hash: {tx_hash.hex()}")
    sys.exit(1)

