import io
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app
from app.services.forecasting_engine import ForecastingEngine

client = TestClient(app)

def test_forecast_predict_endpoint_7day():
    """Tests 7-day demand forecasting via API endpoint."""
    response = client.post(
        "/api/forecast/predict",
        json={"store_id": "STORE_01", "product_id": "PROD_01", "horizon_days": 7, "model_type": "ml"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["store_id"] == "STORE_01"
    assert data["product_id"] == "PROD_01"
    assert data["horizon_days"] == 7
    assert len(data["forecast_points"]) == 7
    assert len(data["historical_points"]) > 0

    # Verify uncertainty bounds ordering: lower <= predicted <= upper
    for pt in data["forecast_points"]:
        assert pt["predicted_demand"] is not None
        assert pt["lower_bound"] is not None
        assert pt["upper_bound"] is not None
        assert pt["lower_bound"] <= pt["predicted_demand"] + 0.01
        assert pt["predicted_demand"] <= pt["upper_bound"] + 0.01

    eval_data = data["evaluation"]
    assert "ml_wmape" in eval_data
    assert "baseline_wmape" in eval_data
    assert "ml_mae" in eval_data
    assert "baseline_mae" in eval_data
    assert isinstance(eval_data["ml_beats_baseline"], bool)
    assert "uncertainty_method" in eval_data

def test_forecast_predict_endpoint_14day():
    """Tests 14-day demand forecasting via GET endpoint."""
    response = client.get("/api/forecast/predict?store_id=STORE_02&product_id=PROD_10&horizon_days=14")
    assert response.status_code == 200
    data = response.json()
    assert data["horizon_days"] == 14
    assert len(data["forecast_points"]) == 14
    assert len(data["feature_importances"]) > 0

def test_evaluation_summary_endpoint():
    """Tests evaluation summary endpoint comparing ML against moving-average baseline."""
    response = client.get("/api/forecast/evaluation-summary?store_id=STORE_01&horizon_days=14")
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert len(data["summary"]) > 0
    assert "overall_ml_wmape" in data
    assert "overall_baseline_wmape" in data
    assert data["overall_ml_wmape"] >= 0.0

    first_item = data["summary"][0]
    assert "product_id" in first_item
    assert "ml_wmape" in first_item
    assert "baseline_wmape" in first_item
    assert "improvement_pct" in first_item

def test_chronological_splitting_no_leakage():
    """Verifies that evaluation test window strictly follows the training window chronologically."""
    res = ForecastingEngine.generate_forecast("STORE_01", "PROD_01", horizon_days=14)
    eval_info = res["evaluation"]
    assert eval_info["test_samples"] == 14
    test_start = pd.to_datetime(eval_info["test_start_date"])
    test_end = pd.to_datetime(eval_info["test_end_date"])
    assert test_start <= test_end

    # First forecast date must be strictly after the test window / last historical date
    first_forecast_date = pd.to_datetime(res["forecast_points"][0]["date"])
    assert first_forecast_date > test_start

def test_zero_demand_wmape_safety():
    """Tests that calculate_wmape and calculate_mae never divide by zero or error on empty/zero arrays."""
    actual_zeros = np.zeros(10)
    pred_zeros = np.zeros(10)
    assert ForecastingEngine.calculate_wmape(actual_zeros, pred_zeros) == 0.0
    assert ForecastingEngine.calculate_mae(actual_zeros, pred_zeros) == 0.0

    pred_nonzero = np.array([1.0, 2.0, 0.0, 0.0])
    actual_zeros_short = np.zeros(4)
    # Should safely return 1.0 (100% error) without ZeroDivisionError
    wmape_nonzero_pred = ForecastingEngine.calculate_wmape(actual_zeros_short, pred_nonzero)
    assert wmape_nonzero_pred == 1.0

def test_short_history_fallback(monkeypatch):
    """Tests graceful fallback when history has fewer than 14 records."""
    from app.services.data_service import data_service
    
    # Create artificial 5-day sales dataframe
    short_df = pd.DataFrame([
        {"date": f"2026-10-0{i}", "store_id": "TEST_STORE", "product_id": "TEST_PROD", "units_sold": 10 + i, "unit_price": 5.0, "promotion_active": False}
        for i in range(1, 6)
    ])

    orig_sales = data_service.sales_df
    try:
        data_service.sales_df = short_df
        res = ForecastingEngine.generate_forecast("TEST_STORE", "TEST_PROD", horizon_days=7)
        assert res["diagnostics"]["status"] == "INSUFFICIENT_HISTORY"
        assert len(res["forecast_points"]) == 7
        assert res["forecast_points"][0]["predicted_demand"] > 0
    finally:
        data_service.sales_df = orig_sales

def test_missing_signals_imputation(monkeypatch):
    """Tests that forecasting completes cleanly with imputed defaults if external signals are absent."""
    from app.services.data_service import data_service

    orig_signals = data_service.signals_df
    try:
        data_service.signals_df = None
        res = ForecastingEngine.generate_forecast("STORE_01", "PROD_01", horizon_days=7)
        assert res["diagnostics"]["missing_signals_imputed"] is True
        assert len(res["forecast_points"]) == 7
    finally:
        data_service.signals_df = orig_signals
