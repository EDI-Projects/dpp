"""Initial schema - create all tables for DPP persistence

Revision ID: 001_initial
Revises:
Create Date: 2026-03-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, TIMESTAMPTZ

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable UUID extension
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # Table: actors
    op.create_table(
        'actors',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('did', sa.String(128), unique=True, nullable=False),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('role', sa.String(64), nullable=False),
        sa.Column('approved_by', sa.String(128)),
        sa.Column('public_key_b64', sa.Text, nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, default=True),
        sa.Column('created_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
        sa.Column('updated_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
    )
    op.create_index('ix_actors_did', 'actors', ['did'])
    op.create_index('ix_actors_role', 'actors', ['role'])

    # Table: pending_registrations
    op.create_table(
        'pending_registrations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('did', sa.String(128), unique=True, nullable=False),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('role', sa.String(64), nullable=False),
        sa.Column('email', sa.String(256)),
        sa.Column('public_key_b64', sa.Text, nullable=False),
        sa.Column('submitted_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
    )
    op.create_index('ix_pending_reg_did', 'pending_registrations', ['did'])

    # Table: auth_challenges
    op.create_table(
        'auth_challenges',
        sa.Column('nonce', sa.String(64), primary_key=True),
        sa.Column('did', sa.String(128), nullable=False),
        sa.Column('expires_at', TIMESTAMPTZ, nullable=False),
        sa.Column('created_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
    )
    op.create_index('ix_auth_challenges_did', 'auth_challenges', ['did'])
    op.create_index('ix_auth_challenges_expires', 'auth_challenges', ['expires_at'])

    # Table: auth_tokens
    op.create_table(
        'auth_tokens',
        sa.Column('token', sa.String(64), primary_key=True),
        sa.Column('did', sa.String(128), nullable=False),
        sa.Column('created_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
        sa.Column('expires_at', TIMESTAMPTZ),
    )
    op.create_index('ix_auth_tokens_did', 'auth_tokens', ['did'])

    # Table: products
    op.create_table(
        'products',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('product_id', sa.String(256), unique=True, nullable=False),
        sa.Column('os_id', sa.String(128), nullable=False),
        sa.Column('category', sa.String(128)),
        sa.Column('current_stage', sa.String(128)),
        sa.Column('created_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
        sa.Column('updated_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
    )
    op.create_index('ix_products_product_id', 'products', ['product_id'])
    op.create_index('ix_products_os_id', 'products', ['os_id'])

    # Table: lifecycle_stages
    op.create_table(
        'lifecycle_stages',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('product_id', sa.String(256), nullable=False),
        sa.Column('stage', sa.String(128), nullable=False),
        sa.Column('stage_date', sa.Date),
        sa.Column('issuer_did', sa.String(128), nullable=False),
        sa.Column('issuer_name', sa.String(256)),
        sa.Column('credential_id', sa.String(256), unique=True, nullable=False),
        sa.Column('vc_type', sa.String(128), nullable=False),
        sa.Column('created_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
        sa.Column('vc_payload', JSONB, nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.product_id']),
        sa.ForeignKeyConstraint(['issuer_did'], ['actors.did']),
    )
    op.create_index('ix_lifecycle_product', 'lifecycle_stages', ['product_id'])
    op.create_index('ix_lifecycle_cred_id', 'lifecycle_stages', ['credential_id'])
    op.create_index('ix_lifecycle_issuer', 'lifecycle_stages', ['issuer_did'])

    # Table: credential_status
    op.create_table(
        'credential_status',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('credential_id', sa.String(256), unique=True, nullable=False),
        sa.Column('product_id', sa.String(256)),
        sa.Column('vc_type', sa.String(128), nullable=False),
        sa.Column('status_index', sa.BigInteger, unique=True, nullable=False),
        sa.Column('is_revoked', sa.Boolean, nullable=False, default=False),
        sa.Column('revoked_at', TIMESTAMPTZ),
        sa.Column('revoked_by', sa.String(128)),
        sa.Column('created_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
        sa.ForeignKeyConstraint(['credential_id'], ['lifecycle_stages.credential_id']),
    )
    op.create_index('ix_cs_cred_id', 'credential_status', ['credential_id'])
    op.create_index('ix_cs_status_idx', 'credential_status', ['status_index'])

    # Table: status_list_bits
    op.create_table(
        'status_list_bits',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('byte_position', sa.BigInteger, unique=True, nullable=False),
        sa.Column('bits', sa.BigInteger, nullable=False, default=0),
    )
    op.create_index('ix_sl_bits_pos', 'status_list_bits', ['byte_position'])

    # Table: status_list_meta
    op.create_table(
        'status_list_meta',
        sa.Column('status_index', sa.BigInteger, primary_key=True),
        sa.Column('credential_id', sa.String(256), unique=True, nullable=False),
        sa.Column('product_id', sa.String(256)),
        sa.Column('vc_type', sa.String(128), nullable=False),
        sa.Column('created_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
    )
    op.create_index('ix_sl_meta_cred', 'status_list_meta', ['credential_id'])

    # Table: factory_products
    op.create_table(
        'factory_products',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('os_id', sa.String(128), nullable=False),
        sa.Column('product_id', sa.String(256), nullable=False),
        sa.Column('added_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
        sa.ForeignKeyConstraint(['product_id'], ['products.product_id']),
        sa.UniqueConstraint('os_id', 'product_id'),
    )
    op.create_index('ix_fp_os_id', 'factory_products', ['os_id'])
    op.create_index('ix_fp_product', 'factory_products', ['product_id'])

    # Table: audit_log
    op.create_table(
        'audit_log',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('ts', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
        sa.Column('event', sa.String(128), nullable=False),
        sa.Column('actor_did', sa.String(128)),
        sa.Column('product_id', sa.String(256)),
        sa.Column('detail', sa.Text),
        sa.Column('created_at', TIMESTAMPTZ, nullable=False, default=sa.func.now()),
    )
    op.create_index('ix_audit_ts', 'audit_log', ['ts'])
    op.create_index('ix_audit_actor', 'audit_log', ['actor_did'])
    op.create_index('ix_audit_product', 'audit_log', ['product_id'])


def downgrade() -> None:
    op.drop_table('audit_log')
    op.drop_table('factory_products')
    op.drop_table('status_list_meta')
    op.drop_table('status_list_bits')
    op.drop_table('credential_status')
    op.drop_table('lifecycle_stages')
    op.drop_table('products')
    op.drop_table('auth_tokens')
    op.drop_table('auth_challenges')
    op.drop_table('pending_registrations')
    op.drop_table('actors')
    op.execute('DROP EXTENSION IF EXISTS "uuid-ossp"')
