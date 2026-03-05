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
    raw_material_id: Optional[str] = None      # from MOCK_DATA CSV
    raw_material: str
    supplier: Optional[str] = None             # from MOCK_DATA CSV
    supplier_location: Optional[str] = None   # from MOCK_DATA CSV
    cost_per_unit: Optional[float] = None     # from MOCK_DATA CSV
    material_grade: str
    quantity_kg: float
    origin_country: str
    origin_region: str
    farm_name: str
    harvest_date: str
    sourcing_date: str
    certification_standard: str
    certified: bool
    certifying_body: str

class CertificationRecord(BaseModel):
    product_id: str
    sourcing_id: str
    certifying_body: str
    certification_standard: str
    audit_date: str
    audit_result: str
    expiry_date: str
    scope: str

class CustodyTransfer(BaseModel):
    product_id: str
    transfer_sequence: int
    transfer_type: str
    from_actor_name: str
    from_city: str
    to_actor_name: str
    to_city: str
    handover_date: str
    transport_mode: str
    carrier_name: Optional[str] = None
    distance_km: float
    carbon_emissions_kg: float
    condition_on_arrival: str

class OwnershipRecord(BaseModel):
    product_id: str
    owner_type: str
    ownership_start: str
    country_of_use: str
    product_still_in_use: bool

class RepairRecord(BaseModel):
    product_id: str
    service_type: str
    service_date: str
    service_provider: str
    repair_description: str
    item_condition_before: str
    item_condition_after: str
    right_to_repair_compliant: bool

class EndOfLifeRecord(BaseModel):
    product_id: str
    eol_trigger: str
    collection_date: str
    processing_date: str
    collector_name: str
    recycler_name: str
    recycler_country: str
    recycling_method: str
    second_life_eligible: bool
    eu_espr_compliant: bool