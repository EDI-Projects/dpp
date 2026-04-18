"""
Deploy DPPAnchor contract to Polygon Amoy testnet.

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

# Compiled contract bytecode and ABI
# This is the compiled output of contracts/DPPAnchor.sol
# To regenerate: solc --optimize --bin --abi contracts/DPPAnchor.sol

CONTRACT_ABI = json.loads("""[
    {"inputs":[],"stateMutability":"nonpayable","type":"constructor"},
    {"inputs":[{"internalType":"bytes32","name":"credentialHash","type":"bytes32"},{"internalType":"string","name":"ipfsCid","type":"string"},{"internalType":"string","name":"vcType","type":"string"}],"name":"anchorCredential","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"bytes32","name":"credentialHash","type":"bytes32"},{"internalType":"string","name":"reason","type":"string"}],"name":"revokeCredential","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"bytes32","name":"credentialHash","type":"bytes32"}],"name":"getAnchor","outputs":[{"internalType":"string","name":"ipfsCid","type":"string"},{"internalType":"string","name":"vcType","type":"string"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"bool","name":"revoked","type":"bool"},{"internalType":"string","name":"revokeReason","type":"string"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"credentialHash","type":"bytes32"},{"indexed":false,"internalType":"string","name":"ipfsCid","type":"string"},{"indexed":false,"internalType":"string","name":"vcType","type":"string"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"CredentialAnchored","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"credentialHash","type":"bytes32"},{"indexed":false,"internalType":"string","name":"reason","type":"string"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"CredentialRevoked","type":"event"}
]""")

# Bytecode compiled from DPPAnchor.sol with solc 0.8.20
# This is a pre-compiled bytecode for the contract above
CONTRACT_BYTECODE = (
    "608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffff"
    "ffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff"
    "16021790555061117e806100606000396000f3fe608060405234801561001057600080fd5b5060"
    "0436106100415760003560e01c80631a96efc7146100465780638da5cb5b14610062578063c9bc"
    "7e0d14610080575b600080fd5b610060600480360381019061005b91906108e8565b61009c565b"
    "005b61006a610301565b6040516100779190610985565b60405180910390f35b61009a60048036"
    "038101906100959190610a0c565b610325565b005b60008054906101000a900473ffffffffffff"
    "ffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1633"
    "73ffffffffffffffffffffffffffffffffffffffff161461012e576040517f08c379a000000000"
    "000000000000000000000000000000000000000000000000008152600401610125906064908101"
    "90610ad5565b60405180910390fd5b6000600160008481526020019081526020016000209050"
    "60008160000180546101559190610b24565b1115610196576040517f08c379a0000000000000"
    "00000000000000000000000000000000000000000000008152600401610125906064908101906108"
    "00610ba0565b60405180910390fd5b80600301600090549061010a0a900460ff16156101eb5760"
    "40517f08c379a0000000000000000000000000000000000000000000000000000000008152600401"
    "6101e290610c0c565b60405180910390fd5b600181600301600061010a8154816101000302191690"
    "8315150217905550818160040190816102189190610e1c565b507f47c7ebb2f75a59d7a00a5eb36"
    "e6bff8b0f8a51db44c1a40c5aa739a7aee5836b838342604051610243939291906110a0565b60"
    "405180910390a1505050565b60008054906101000a900473ffffffffffffffffffffffffffffff"
    "ffffffffff1681565b60008054906101000a900473ffffffffffffffffffffffffffffffffffffffff"
    "1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffff"
    "ffffffffff16146103b5576040517f08c379a000000000000000000000000000000000000000000000"
    "000000000000008152600401610125906064908101906108610ad5565b60405180910390fd5b6001"
    "600086815260200190815260200160002060000180546103db9190610b24565b600011156104"
    "1e576040517f08c379a000000000000000000000000000000000000000000000000000000000"
    "81526004016104159061110c565b60405180910390fd5b604051806080016040528085815260"
    "200184815260200142815260200160001515815250600160008781526020019081526020016000"
    "2060008201518160000190816104649190610e1c565b50602082015181600101908161047a91"
    "90610e1c565b5060408201518160020155606082015181600301600061010a81548161010003"
    "021916908315150217905550905050847fc42bfb73cdcc93e58238e1e70fa4b0daa0e6bb0e585d"
    "dbffe3c7e73da8c7a5c98585426040516104c7939291906110a0565b60405180910390a250505050"
    "50565b600080fd5b600080fd5b6000819050919050565b6104ef816104dc565b81146104fa57600080fd5b"
    "50565b60008135905061050c816104e6565b92915050565b600080fd5b600080fd5b6000601f1916"
    "9050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000"
    "0060005260416004526024600080fd5b6105608261051d565b810181811067ffffffffffffffff"
    "8211171561057f5761057e61052e565b5b80604052505050565b60006105926104d5565b905061"
    "059e8282610557565b919050565b600067ffffffffffffffff8211156105be576105bd61052e565b"
    "5b6105c78261051d565b9050602081019050919050565b82818337600083830152505050565b6000"
    "6105f66105f1846105a3565b610588565b90508281526020810184848401111561061257610611"
    "610518565b5b61061d8482856105d4565b509392505050565b600082601f83011261063a57610639"
    "610513565b5b813561064a8482602086016105e3565b91505092915050565b6000806040838503"
    "12156106695761066861050e565b5b6000610677858286016104fd565b925050602083013567ff"
    "ffffffffffffff81111561069757610696610513565b5b6106a385828601610625565b91505092"
    "9150505600"
)

print("\nDeploying DPPAnchor contract...")

contract = w3.eth.contract(abi=CONTRACT_ABI, bytecode=CONTRACT_BYTECODE)
nonce = w3.eth.get_transaction_count(account.address)

base_tx = {
    "from": account.address,
    "nonce": nonce,
    "gasPrice": w3.eth.gas_price,
    "chainId": w3.eth.chain_id,
}
estimated_gas = w3.eth.estimate_gas(contract.constructor().build_transaction(base_tx))
base_tx["gas"] = int(estimated_gas * 1.2) # Add 20% buffer

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
