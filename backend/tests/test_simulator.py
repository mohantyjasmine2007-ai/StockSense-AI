import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.data_service import data_service
from app.services.forecasting_engine import ForecastingEngine
from app.services.inventory_service import inventory_service
from app.services.simulation_service import simulation_service
from app.services.dashboard_service import dashboard_service

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_services():
    data_service.load_all()
    ForecastingEngine.clear_cache()

def test_simulation_runs_successfully():
    """Verify historical replay simulation returns complete comparison results."""
    res = simulation_service.run_simulation(store_id="ALL", product_id="ALL", eval_days=14)
    assert res is not None
    assert res.evaluation_days == 14
    assert res.baseline_policy.policy_name.startswith("Traditional")
    assert res.ai_policy.policy_name.startswith("StockSense")
    assert res.baseline_policy.total_demand_units > 0
    assert res.ai_policy.total_demand_units > 0
    assert len(res.daily_traces) > 0
    assert len(res.assumptions) >= 5
    assert "not guarantee future commercial outcomes" in res.disclaimer

def test_simulation_metrics_formulas_and_zero_safety():
    """Verify fill rate and denominator safety handling."""
    res = simulation_service.run_simulation(store_id="STORE_01", product_id="PROD_01", eval_days=14)
    
    # Fill rate calculation check
    b = res.baseline_policy
    if b.total_demand_units > 0:
        expected_fill = round((b.fulfilled_demand_units / b.total_demand_units) * 100.0, 2)
        assert abs(b.fill_rate_pct - expected_fill) < 0.05

    # Denominator safety
    if b.stockout_incidents == 0:
        assert res.deltas.stockout_reduction_pct is None or res.deltas.stockout_reduction_pct == 0.0
    else:
        assert res.deltas.stockout_reduction_pct is not None

def test_simulation_never_hardcodes_thirty_percent():
    """Verify stockout reduction percentage is calculated dynamically and not hardcoded to 30%."""
    res14 = simulation_service.run_simulation(store_id="ALL", eval_days=14)
    res30 = simulation_service.run_simulation(store_id="ALL", eval_days=30)
    
    # Check that stockout_reduction_pct reflects exact dynamic difference
    if res30.baseline_policy.stockout_incidents > 0 and res30.deltas.stockout_reduction_pct is not None:
        expected_reduction = round(
            ((res30.baseline_policy.stockout_incidents - res30.ai_policy.stockout_incidents) 
             / res30.baseline_policy.stockout_incidents) * 100.0, 2
        )
        assert abs(res30.deltas.stockout_reduction_pct - expected_reduction) < 0.01
        # Confirm it is not a hardcoded 30.00% constant across distinct periods
        assert not (res14.deltas.stockout_reduction_pct == 30.0 and res30.deltas.stockout_reduction_pct == 30.0)

def test_simulation_csv_export():
    """Verify CSV export produces valid CSV with headers and simulation rows."""
    csv_str = simulation_service.export_csv(store_id="STORE_01", product_id="PROD_01", eval_days=14)
    assert "# StockSense AI Policy Backtest Replay Audit Log" in csv_str
    assert "daily_demand" in csv_str
    assert "baseline_stock" in csv_str
    assert "ai_stock" in csv_str
    assert "ai_transfer_in" in csv_str
    lines = csv_str.strip().splitlines()
    assert len(lines) > 5

def test_dashboard_summary_metrics_and_empty_state():
    """Verify dashboard metrics calculation live from ingested dataset and empty state handling."""
    # 1. Normal state
    dash = dashboard_service.get_dashboard_summary(store_id="ALL", horizon_days=7)
    assert dash.is_available is True
    assert dash.empty_state_reason is None
    assert dash.total_stock_value > 0.0
    assert dash.total_inventory_units > 0
    assert dash.forecast_demand_units > 0.0
    assert dash.fill_rate_pct > 0.0
    assert dash.holding_cost_estimate > 0.0
    assert dash.total_positions_monitored == 60

    # Total stock value check
    expected_value = sum(
        it.stock_on_hand * it.unit_cost for it in inventory_service.get_inventory_status().items
    )
    assert abs(dash.total_stock_value - expected_value) < 1.0

    # 2. Informative empty state on invalid scope
    empty_dash = dashboard_service.get_dashboard_summary(store_id="STORE_NONEXISTENT")
    assert empty_dash.is_available is False
    assert empty_dash.empty_state_reason is not None
    assert "STORE_NONEXISTENT" in empty_dash.empty_state_reason

def test_api_endpoints_simulator_and_dashboard():
    """Verify REST API endpoints for dashboard and simulator."""
    # Dashboard API
    dash_res = client.get("/api/dashboard/summary?store_id=ALL&horizon_days=7")
    assert dash_res.status_code == 200
    dash_json = dash_res.json()
    assert dash_json["is_available"] is True
    assert "total_stock_value" in dash_json

    # Simulator API POST
    sim_post = client.post("/api/simulator/run", json={"store_id": "ALL", "product_id": "ALL", "eval_days": 14})
    assert sim_post.status_code == 200
    sim_json = sim_post.json()
    assert "baseline_policy" in sim_json
    assert "ai_policy" in sim_json
    assert "deltas" in sim_json

    # Simulator CSV export API GET
    csv_res = client.get("/api/simulator/export/csv?store_id=ALL&eval_days=14")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "daily_demand" in csv_res.text

def test_end_to_end_pipeline_flow():
    """
    Verifies full end-to-end integration:
    1. Data loaded
    2. Demand forecasts generated
    3. Inventory stockout risks computed
    4. Inter-store rebalance recommendations created
    5. Action approval workflow executed
    6. Policy impact simulator backtest executed
    """
    # Step 1: Health & Data check
    health_res = client.get("/api/health")
    assert health_res.status_code == 200
    assert health_res.json()["stores_count"] == 5

    # Step 2: Generate Forecast
    fc_res = client.get("/api/forecast/predict?store_id=STORE_01&product_id=PROD_10&horizon_days=14")
    assert fc_res.status_code == 200
    assert len(fc_res.json()["forecast_points"]) > 0

    # Step 3: Calculate Inventory Risks
    inv_res = client.get("/api/inventory/status")
    assert inv_res.status_code == 200
    inv_data = inv_res.json()
    assert inv_data["total_skus_monitored"] == 60
    assert inv_data["critical_shortages_count"] >= 1

    # Step 4: Recommend Transfers & Reorders
    recs_res = client.get("/api/rebalance/recommendations")
    assert recs_res.status_code == 200
    recs_data = recs_res.json()
    assert len(recs_data["recommendations"]) > 0
    pending_recs = [r for r in recs_data["recommendations"] if r["status"] == "pending"]
    assert len(pending_recs) > 0
    target_rec = pending_recs[0]

    # Step 5: Approve an Action
    appr_res = client.post(
        f"/api/rebalance/actions/{target_rec['id']}/approve",
        json={"notes": "End-to-end pipeline test approval"}
    )
    assert appr_res.status_code == 200
    assert appr_res.json()["updated_status"] == "approved"

    # Step 6: Run Simulator Policy Comparison
    sim_res = client.post(
        "/api/simulator/run",
        json={"store_id": "STORE_01", "product_id": target_rec["product_id"], "eval_days": 14}
    )
    assert sim_res.status_code == 200
    sim_result = sim_res.json()
    assert sim_result["baseline_policy"]["total_demand_units"] > 0
    assert sim_result["ai_policy"]["total_demand_units"] > 0
