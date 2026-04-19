from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class W3CCredential(BaseModel):
    context: List[str]
    type: List[str]
    id: str
    issuer: str
    issuanceDate: str
    credentialSubject: Dict[str, Any]
    proof: Optional[Dict[str, Any]] = None

class MaterialSourcingRecord(BaseModel):
    product_id: str
    issuer_did: Optional[str] = None
    raw_material_id: Optional[str] = None
    raw_material: Optional[str] = None
    supplier: Optional[str] = None
    supplier_location: Optional[str] = None
    cost_per_unit: Optional[float] = None
    material_grade: Optional[str] = None
    quantity_kg: Optional[float] = None
    origin_country: Optional[str] = None
    origin_region: Optional[str] = None
    farm_name: Optional[str] = None
    harvest_date: Optional[str] = None
    sourcing_date: Optional[str] = None
    certification_standard: Optional[str] = None
    certified: Optional[bool] = None
    certifying_body: Optional[str] = None
    minted_token_id: Optional[int] = None

class MaterialMintRequest(BaseModel):
    material_type: str
    quantity_kg: float
    metadata_uri: Optional[str] = None

class ProductComposeRequest(BaseModel):
    consumed_token_ids: List[int]
    consumed_amounts: List[int]
    new_product_type: str
    new_quantity: int
    metadata_uri: Optional[str] = None

class CertificationRecord(BaseModel):
    product_id: str
    issuer_did: Optional[str] = None
    sourcing_id: Optional[str] = None          # auto-derived from chain if omitted
    certifying_body: Optional[str] = None
    certification_standard: Optional[str] = None
    audit_date: Optional[str] = None
    audit_result: Optional[str] = None
    expiry_date: Optional[str] = None
    scope: Optional[str] = None

class CustodyTransfer(BaseModel):
    product_id: str
    issuer_did: Optional[str] = None
    transfer_sequence: Optional[int] = None    # auto-assigned by backend
    transfer_type: Optional[str] = "logistics"
    from_owner_did: Optional[str] = None
    to_owner_did: Optional[str] = None
    from_actor_name: Optional[str] = None
    from_city: Optional[str] = None
    to_actor_name: Optional[str] = None
    to_city: Optional[str] = None
    handover_date: Optional[str] = None
    transport_mode: Optional[str] = "road"
    carrier_name: Optional[str] = None
    distance_km: Optional[float] = None
    carbon_emissions_kg: Optional[float] = None
    condition_on_arrival: Optional[str] = "good"

class OwnershipRecord(BaseModel):
    product_id: str
    issuer_did: Optional[str] = None
    previous_owner_did: Optional[str] = None
    new_owner_did: Optional[str] = None
    owner_type: Optional[str] = "individual"
    ownership_start: Optional[str] = None
    country_of_use: Optional[str] = None
    product_still_in_use: Optional[bool] = True

class RepairRecord(BaseModel):
    product_id: str
    issuer_did: Optional[str] = None
    service_type: Optional[str] = "repair"
    service_date: Optional[str] = None
    service_provider: Optional[str] = None
    repair_description: Optional[str] = None
    item_condition_before: Optional[str] = None
    item_condition_after: Optional[str] = None
    right_to_repair_compliant: Optional[bool] = True

class EndOfLifeRecord(BaseModel):
    product_id: str
    issuer_did: Optional[str] = None
    eol_trigger: Optional[str] = "end_of_use"
    collection_date: Optional[str] = None
    processing_date: Optional[str] = None
    collector_name: Optional[str] = None
    recycler_name: Optional[str] = None
    recycler_country: Optional[str] = None
    recycling_method: Optional[str] = "mechanical"
    second_life_eligible: Optional[bool] = False
    eu_espr_compliant: Optional[bool] = True