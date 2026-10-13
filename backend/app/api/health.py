from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.models import HealthResponse, SystemMetaResponse
from app.services.data_service import data_service

router = APIRouter(tags=["System & Health"])

@router.get("/health", response_model=HealthResponse)
def get_health():
    meta = data_service.get_metadata()
    stores_count = len(meta.get("stores", []))
    products_count = len(meta.get("products", []))
    sales_count = len(data_service.sales_df) if data_service.sales_df is not None else 0
    signals_count = len(data_service.signals_df) if data_service.signals_df is not None else 0

    return HealthResponse(
        status="ok",
        version="1.0.0",
        timestamp=datetime.now(timezone.utc).isoformat(),
        dataset_status="ready" if data_service.is_loaded else "uninitialized",
        stores_count=stores_count,
        products_count=products_count,
        sales_records_count=sales_count,
        external_signals_count=signals_count
    )

@router.get("/meta", response_model=SystemMetaResponse)
def get_metadata():
    return data_service.get_metadata()
