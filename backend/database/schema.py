from sqlalchemy import MetaData

metadata = MetaData()

# Import all models to register them with the metadata
from .models import (
    Actor,
    PendingRegistration,
    AuthChallenge,
    AuthToken,
    Product,
    LifecycleStage,
    CredentialStatus,
    StatusListBit,
    StatusListMeta,
    FactoryProduct,
    AuditLogEntry,
)
