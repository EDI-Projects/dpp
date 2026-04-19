# Decentralized Digital Product Passport (DPP) — Composite Digital Twins

A research-grade, blockchain-native Digital Product Passport system designed for industrial supply chain verifiable provenance. 

This project transforms the traditional DPP concept from a flat document model into a Composite Digital Twin (CDT) paradigm. It implements a verifiable, on-chain Bill of Materials (BOM) using an ERC-1155 Burn-and-Mint DAG architecture on the Polygon network.

---

## Research Thesis and Core Novelty

Existing DPP systems often rely on centralized databases or flat placeholders. Our architecture introduces Material Lineage Inheritance:

1.  **Forward-Flowing Provenance**: Products are composed by cryptographically consuming (burning) their raw material constituents.
2.  **ERC-1155 DAG**: Every transformation (e.g., Cotton to Fabric to T-Shirt) is a node in a Direct Acyclic Graph (DAG) recorded on-chain.
3.  **Automatic ESG Aggregation**: Because the final product is linked to its burned parents, it automatically inherits and aggregates the ESG credentials (IPFS-anchored) of every constituent material.

---

## Application Structure

The frontend is designed for industrial visualization and academic demonstration:

### 1. Landing Hub (/ )
An entry point showcasing the project's vision of a transparent, circular economy. Features a live animated DAG visualization and a global search for Product URNs.

### 2. Provenance Explorer (/explorer )
An interactive, recursive tree-rendering engine. Enter a Product ID (e.g., urn:product:...) to see its entire lineage. 
- **Verifiable Depth**: Analysis of supply chain tier depth.
- **On-Chain Anchors**: Direct links to PolygonScan for every transformation.
- **Compliance VCs**: Access to the original W3C Verifiable Credentials stored on IPFS.

### 3. Supply Chain Console (/console )
The administrative interface for authorized actors.
- **Web3 Authentication**: Integration via MetaMask for identity management.
- **Material Minting**: Onboarding raw materials with IPFS-pinned certificates.
- **Smart Composition**: Selection of inventory tokens to execute composite product generation.

---

## Technology Stack

-   **Blockchain**: Polygon Amoy Testnet (ERC-1155 standard).
-   **Storage**: IPFS (via Pinata) for decentralized Verifiable Credential persistence.
-   **Backend**: FastAPI (Python 3.13) + SQLAlchemy + PostgreSQL.
-   **Frontend**: Next.js 16 + React 19 + TailwindCSS 4.
-   **Identity**: Web3 Wallet (MetaMask) using Ethers.js.

---

## Setup and Configuration

### Prerequisites
- Python 3.10+
- Node.js 20+
- A Pinata Account (for IPFS)
- A MetaMask wallet with Amoy Testnet MATIC (optional)

### 1. Backend Configuration
Create a `backend/.env` file:
```env
DATABASE_URL=postgresql://user:pass@localhost:5433/dpp_db
PINATA_JWT=your_pinata_jwt_here
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_CONTRACT_ADDRESS=0x...
POLYGON_PRIVATE_KEY=your_private_key_here
```

Run the backend:
```bash
cd backend
python -m venv .env
source .env/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 2. Frontend Configuration
Run the dev server:
```bash
cd frontend
npm install
npm run dev
```

---

## Academic Publication Focus

This repository serves as a reference implementation for research focused on:
-   **Composite Digital Twins (CDTs)** in Supply Chain 4.0.
-   **Verifiable Credential Inheritance** across token-burning transformations.
-   **On-chain DAG models** for Bill-of-Materials (BOM) auditability.

---

## License
MIT
