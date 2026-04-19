from sqlalchemy import Column, String, Boolean, DateTime, Integer, BigInteger, Text, ForeignKey, Date, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB, TIMESTAMP
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone
import uuid

Base = declarative_base()


class Actor(Base):
    __tablename__ = "actors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    did = Column(String(128), unique=True, nullable=False, index=True)
    name = Column(String(256), nullable=False)
    role = Column(String(64), nullable=False, index=True)
    approved_by = Column(String(128))
    public_key_b64 = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PendingRegistration(Base):
    __tablename__ = "pending_registrations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    did = Column(String(128), unique=True, nullable=False, index=True)
    name = Column(String(256), nullable=False)
    role = Column(String(64), nullable=False)
    email = Column(String(256))
    public_key_b64 = Column(Text, nullable=False)
    submitted_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class AuthChallenge(Base):
    __tablename__ = "auth_challenges"

    nonce = Column(String(64), primary_key=True)
    did = Column(String(128), nullable=False, index=True)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    token = Column(String(64), primary_key=True)
    did = Column(String(128), nullable=False, index=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(TIMESTAMP(timezone=True))


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(String(256), unique=True, nullable=False, index=True)
    os_id = Column(String(128), nullable=False, index=True)
    category = Column(String(128))
    current_stage = Column(String(128))
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class LifecycleStage(Base):
    __tablename__ = "lifecycle_stages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(String(256), ForeignKey("products.product_id"), nullable=False, index=True)
    stage = Column(String(128), nullable=False)
    stage_date = Column(Date)
    issuer_did = Column(String(128), ForeignKey("actors.did"), nullable=False, index=True)
    issuer_name = Column(String(256))
    credential_id = Column(String(256), unique=True, nullable=False, index=True)
    vc_type = Column(String(128), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    vc_payload = Column(JSONB, nullable=False)
    # IPFS + Polygon anchoring (nullable for backward compat with pre-existing rows)
    ipfs_cid = Column(String(256), nullable=True)
    tx_hash = Column(String(128), nullable=True)


class CredentialStatus(Base):
    __tablename__ = "credential_status"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    credential_id = Column(String(256), unique=True, nullable=False, index=True)
    product_id = Column(String(256), index=True)
    vc_type = Column(String(128), nullable=False)
    status_index = Column(BigInteger, unique=True, nullable=False, index=True)
    is_revoked = Column(Boolean, nullable=False, default=False)
    revoked_at = Column(TIMESTAMP(timezone=True))
    revoked_by = Column(String(128))
    revoked_tx_hash = Column(String(128), nullable=True)
    ipfs_cid = Column(String(256), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class StatusListBit(Base):
    """DB-backed bitset storage for W3C StatusList2021."""
    __tablename__ = "status_list_bits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    byte_position = Column(BigInteger, unique=True, nullable=False, index=True)
    bits = Column(BigInteger, nullable=False, default=0)


class StatusListMeta(Base):
    __tablename__ = "status_list_meta"

    status_index = Column(BigInteger, primary_key=True)
    credential_id = Column(String(256), unique=True, nullable=False, index=True)
    product_id = Column(String(256), index=True)
    vc_type = Column(String(128), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class FactoryProduct(Base):
    __tablename__ = "factory_products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    os_id = Column(String(128), nullable=False, index=True)
    product_id = Column(String(256), ForeignKey("products.product_id"), nullable=False, index=True)
    added_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class AuditLogEntry(Base):
    __tablename__ = "audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ts = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    event = Column(String(128), nullable=False)
    actor_did = Column(String(128), index=True)
    product_id = Column(String(256), index=True)
    detail = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class MaterialToken(Base):
    """Tracks the ERC-1155 composition DAG.
    
    Each row represents one token (raw material or composed product).
    parent_token_ids stores the list of token IDs that were burned to create this one.
    If parent_token_ids is empty/null, this is a raw material (leaf node in the DAG).
    """
    __tablename__ = "material_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token_id = Column(Integer, unique=True, nullable=False, index=True)
    product_id = Column(String(256), ForeignKey("products.product_id"), nullable=False, index=True)
    material_type = Column(String(128), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    owner_did = Column(String(128), nullable=False, index=True)
    tx_hash = Column(String(128), nullable=True)
    parent_token_ids = Column(JSONB, nullable=True, default=list)  # [] = raw material, [1,2,3] = composed from tokens 1,2,3
    metadata_uri = Column(Text, nullable=True)
    is_burned = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

