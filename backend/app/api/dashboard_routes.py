from typing import Optional
from fastapi import APIRouter, Query
from app.services.dashboard_service import dashboard_service
from app.core.models import DashboardSummaryResponse

router = APIRouter(tags=["Executive Dashboard"])

@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    store_id: Optional[str] = Query("ALL", description="Filter by store ID or ALL"),
    category: Optional[str] = Query("ALL", description="Filter by product category or ALL"),
    product_id: Optional[str] = Query("ALL", description="Filter by product ID or ALL"),
    horizon_days: int = Query(7, description="Forecast horizon in days (7 or 14)")
):
    """
    Returns core executive dashboard KPIs computed live from the ingested data:
    - Total stock value (available stock * unit costs)
    - Products and stores at risk
    - Forecast demand for selected horizon
    - Stockout rate
    - Customer fill rate
    - Holding cost estimate over horizon
    - Machine learning forecast error vs baseline moving average
    Includes informative empty state if required inputs are missing or uninitialized.
    """
    return dashboard_service.get_dashboard_summary(
        store_id=store_id or "ALL",
        category=category or "ALL",
        product_id=product_id or "ALL",
        horizon_days=horizon_days or 7,
    )
