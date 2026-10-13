import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app
from app.services.inventory_service import inventory_service

client = TestClient(app)

def test_inventory_status_endpoint():
    """Tests GET /api/inventory/status returns complete catalog metrics and projections."""
    response = client.get("/api/inventory/status")
    assert response.status_code == 200
    data = response.json()
    assert data["total_skus_monitored"] > 0
    assert len(data["items"]) == data["total_skus_monitored"]
    
    first = data["items"][0]
    assert "store_id" in first
    assert "product_id" in first
    assert "stock_on_hand" in first
    assert "safety_stock" in first
    assert "reorder_point" in first
    assert "projected_stock_14d" in first
    assert len(first["projected_stock_14d"]) == 14
    assert first["safety_stock"] >= 2
    assert first["reorder_point"] >= first["safety_stock"]

def test_stockout_detection_and_tts():
    """Tests projected stock calculations and Time To Shortage (TTS) detection."""
    # SOH = 10, Incoming = 0, Daily demand = [4, 4, 4, 4] -> Stockout on day 3
    soh = 10
    incoming = 0
    forecast = [4.0, 4.0, 4.0, 4.0]
    traj, tts = inventory_service.calculate_projected_stock(soh, incoming, forecast)
    assert len(traj) == 4
    assert traj[0] == 6.0
    assert traj[1] == 2.0
    assert traj[2] == -2.0
    assert tts == 3 # First day below or equal to zero

    # No stockout scenario: SOH = 50, demand = 2/day
    traj_safe, tts_safe = inventory_service.calculate_projected_stock(50, 0, [2.0] * 7)
    assert tts_safe is None
    assert all(s > 0 for s in traj_safe)

def test_dynamic_safety_stock_and_rop():
    """Tests safety stock formula: SS = ceil(z * sigma_d * sqrt(L)) and ROP = (avg_d * L) + SS."""
    # std = 3.0, lead_time = 4 days, z = 1.65 -> raw = 1.65 * 3.0 * 2 = 9.9 -> ceil is 10
    ss = inventory_service.calculate_safety_stock(demand_std=3.0, lead_time_days=4, service_z=1.65)
    assert ss == 10

    # avg_demand = 8.0, lead_time = 4, ss = 10 -> ROP = 8*4 + 10 = 42
    rop = inventory_service.calculate_reorder_point(average_daily_demand=8.0, lead_time_days=4, safety_stock=ss)
    assert rop == 42

def test_rebalance_recommendations_endpoint():
    """Tests /api/rebalance/recommendations generates valid transfers and reorders."""
    response = client.get("/api/rebalance/recommendations")
    assert response.status_code == 200
    data = response.json()
    assert "recommendations" in data
    assert len(data["recommendations"]) > 0
    assert "transfers_count" in data
    assert "reorders_count" in data
    assert "workflow_mode" in data
    assert "Human-in-the-Loop" in data["workflow_mode"]
    assert "disclaimer" in data

    # Verify action schema
    rec = data["recommendations"][0]
    assert rec["action_type"] in ["transfer", "reorder"]
    assert rec["recommended_quantity"] > 0
    assert rec["status"] in ["pending", "approved", "rejected"]
    assert "reason" in rec
    assert "evidence" in rec
    assert rec["evidence"]["receiving_stock_on_hand"] >= 0

def test_donor_store_protection():
    """
    CRITICAL REQUIREMENT: For every transfer recommendation, verify donor store
    retains sufficient inventory to cover its own demand and safety buffer.
    """
    response = client.get("/api/rebalance/recommendations?action_type=transfer")
    assert response.status_code == 200
    data = response.json()
    transfers = data["recommendations"]

    assert len(transfers) > 0, "Expected at least one valid transfer (e.g. umbrella rebalancing to Downtown)"
    for tr in transfers:
        ev = tr["evidence"]
        assert ev["donor_protection_verified"] is True
        assert ev["donor_stock_on_hand"] is not None
        assert ev["donor_surplus_before_transfer"] is not None
        assert ev["donor_surplus_after_transfer"] is not None
        # Transferred quantity cannot exceed surplus before transfer
        assert tr["recommended_quantity"] <= ev["donor_surplus_before_transfer"]
        # Donor must still have non-negative surplus remaining after transfer
        assert ev["donor_surplus_after_transfer"] >= 0

def test_action_approval_and_persistence():
    """Tests human approval workflow: approving an action persists the status."""
    # 1. Fetch pending actions
    response = client.get("/api/rebalance/recommendations?status=pending")
    data = response.json()
    assert len(data["recommendations"]) > 0
    target_action = data["recommendations"][0]
    action_id = target_action["id"]

    # 2. Approve action
    app_res = client.post(f"/api/rebalance/actions/{action_id}/approve", json={"notes": "Approved for dispatch"})
    assert app_res.status_code == 200
    app_data = app_res.json()
    assert app_data["status"] == "success"
    assert app_data["updated_status"] == "approved"

    # 3. Verify persistence in subsequent query
    check_res = client.get("/api/rebalance/recommendations?status=approved")
    approved_list = check_res.json()["recommendations"]
    assert any(a["id"] == action_id for a in approved_list)

def test_action_rejection_and_persistence():
    """Tests rejecting an action with reason logging and persistence."""
    response = client.get("/api/rebalance/recommendations?status=pending")
    data = response.json()
    if len(data["recommendations"]) > 1:
        target_action = data["recommendations"][1]
        action_id = target_action["id"]

        rej_res = client.post(f"/api/rebalance/actions/{action_id}/reject", json={"reason": "Holding for VIP customer event"})
        assert rej_res.status_code == 200
        rej_data = rej_res.json()
        assert rej_data["updated_status"] == "rejected"

        # Verify persistence
        check_res = client.get("/api/rebalance/recommendations?status=rejected")
        rejected_list = check_res.json()["recommendations"]
        assert any(a["id"] == action_id for a in rejected_list)

def test_reset_actions():
    """Tests resetting persisted action approvals back to clean default."""
    reset_res = client.post("/api/rebalance/actions/reset")
    assert reset_res.status_code == 200
    assert reset_res.json()["updated_status"] == "pending"
