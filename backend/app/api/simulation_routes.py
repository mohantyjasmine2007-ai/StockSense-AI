from typing import Optional
from fastapi import APIRouter, Query, Response, status
from app.services.simulation_service import simulation_service
from app.core.models import (
    SimulationResponse,
    SimulatorRunRequest,
)

router = APIRouter(tags=["Impact Simulator"])

@router.post("/simulator/run", response_model=SimulationResponse)
def run_simulation(request: SimulatorRunRequest):
    """
    Replays historical daily demand under documented Traditional ERP Baseline vs StockSense AI policies.
    Simulates inventory movement, supplier lead times, and proactive 1-day inter-store transfers with donor protection.
    Tracks stockouts, unmet demand, fill rate, average inventory, and holding costs.
    """
    return simulation_service.run_simulation(
        store_id=request.store_id,
        product_id=request.product_id,
        eval_days=request.eval_days,
        initial_stock_mode=request.initial_stock_mode,
    )

@router.get("/simulator/run", response_model=SimulationResponse)
def run_simulation_get(
    store_id: str = Query("ALL", description="Store ID or ALL"),
    product_id: str = Query("ALL", description="Product ID or ALL"),
    eval_days: int = Query(30, description="Evaluation window days: 14, 30, or 60")
):
    """GET endpoint to run simulation with query parameters."""
    return simulation_service.run_simulation(
        store_id=store_id,
        product_id=product_id,
        eval_days=eval_days,
    )

@router.get("/simulator/export/csv")
def export_simulation_csv(
    store_id: str = Query("ALL", description="Store ID or ALL"),
    product_id: str = Query("ALL", description="Product ID or ALL"),
    eval_days: int = Query(30, description="Evaluation window days: 14, 30, or 60")
):
    """
    Exports the complete simulated daily inventory replay trace as an audit-ready CSV file.
    """
    csv_content = simulation_service.export_csv(
        store_id=store_id,
        product_id=product_id,
        eval_days=eval_days,
    )
    filename = f"stocksense_simulation_{store_id.lower()}_{eval_days}d.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )
