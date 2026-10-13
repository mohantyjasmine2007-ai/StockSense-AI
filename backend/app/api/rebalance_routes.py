from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, status
from app.services.inventory_service import inventory_service
from app.core.models import (
    InventorySummaryResponse,
    RebalanceRecommendationsResponse,
    ActionApprovalRequest,
    ActionRejectionRequest,
    ActionUpdateResponse,
    InventoryItemStatus,
)

router = APIRouter(tags=["Inventory Re-balancing & Action Workflow"])

@router.get("/inventory/status", response_model=InventorySummaryResponse)
def get_inventory_status(force_refresh: bool = Query(False)):
    """
    Returns multi-store stock positions, projected 14-day stock trajectories,
    dynamic safety stocks, reorder points, and stockout risk classifications.
    """
    return inventory_service.get_inventory_status(force_refresh=force_refresh)

@router.get("/inventory/store/{store_id}", response_model=List[InventoryItemStatus])
def get_store_inventory(store_id: str):
    """Returns inventory status items for a specific store."""
    summary = inventory_service.get_inventory_status()
    items = [it for it in summary.items if it.store_id == store_id]
    if not items and store_id != "ALL":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Store '{store_id}' not found in inventory catalog."
        )
    return items

@router.get("/rebalance/recommendations", response_model=RebalanceRecommendationsResponse)
def get_rebalance_recommendations(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: pending, approved, rejected"),
    action_type: Optional[str] = Query(None, description="Filter by action type: transfer, reorder"),
    store_id: Optional[str] = Query(None, description="Filter by destination or source store"),
    product_id: Optional[str] = Query(None, description="Filter by SKU")
):
    """
    Returns multi-store rebalancing recommendations (transfers and supplier reorders).
    Enforces donor store protection rule and provides quantitative rationale evidence.
    """
    res = inventory_service.solve_rebalancing_recommendations()
    recs = res.recommendations

    if status_filter and status_filter.lower() != "all":
        recs = [r for r in recs if r.status.lower() == status_filter.lower()]

    if action_type and action_type.lower() != "all":
        recs = [r for r in recs if r.action_type.lower() == action_type.lower()]

    if store_id and store_id != "ALL":
        recs = [r for r in recs if r.destination_store_id == store_id or r.source_store_id == store_id]

    if product_id and product_id != "ALL":
        recs = [r for r in recs if r.product_id == product_id]

    # Recalculate filtered counts
    return RebalanceRecommendationsResponse(
        recommendations=recs,
        total_pending=res.total_pending,
        total_approved=res.total_approved,
        total_rejected=res.total_rejected,
        transfers_count=res.transfers_count,
        reorders_count=res.reorders_count,
        potential_procurement_savings=res.potential_procurement_savings,
        prevented_stockout_events=res.prevented_stockout_events,
        workflow_mode=res.workflow_mode,
        disclaimer=res.disclaimer
    )

@router.post("/rebalance/actions/{action_id}/approve", response_model=ActionUpdateResponse)
def approve_recommendation(action_id: str, req: Optional[ActionApprovalRequest] = None):
    """
    Approves an inventory recommendation. Updates the persisted action state.
    Note: Staged for execution; does not simulate physical fulfillment without WMS connection.
    """
    notes = req.notes if req else None
    result = inventory_service.approve_action(action_id=action_id, notes=notes)
    return ActionUpdateResponse(
        status=result["status"],
        action_id=result["action_id"],
        updated_status=result["updated_status"],
        message=result["message"]
    )

@router.post("/rebalance/actions/{action_id}/reject", response_model=ActionUpdateResponse)
def reject_recommendation(action_id: str, req: Optional[ActionRejectionRequest] = None):
    """
    Rejects an inventory recommendation with reason logging.
    """
    reason = req.reason if req else "Declined by inventory manager"
    result = inventory_service.reject_action(action_id=action_id, reason=reason)
    return ActionUpdateResponse(
        status=result["status"],
        action_id=result["action_id"],
        updated_status=result["updated_status"],
        message=result["message"]
    )

@router.post("/rebalance/actions/reset", response_model=ActionUpdateResponse)
def reset_recommendations():
    """Resets all recommendations to pending status."""
    res = inventory_service.reset_actions()
    inventory_service.clear_cache()
    return ActionUpdateResponse(
        status="success",
        action_id="ALL",
        updated_status="pending",
        message="All recommendations reset to pending."
    )
