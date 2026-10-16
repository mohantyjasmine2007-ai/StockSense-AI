import os
import sys
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app
from app.services.signals_service import HolidayCalendar, SignalsService, signals_service
from app.services.data_service import data_service
from app.services.forecasting_engine import ForecastingEngine
from app.config import settings

client = TestClient(app)

def test_holiday_calendar_mapping():
    """Verify federal holidays and regional Seattle-Tacoma event calendar mapping."""
    # Federal Holiday: Independence Day
    h_flag, e_flag, name, spike = HolidayCalendar.get_holiday_event("2026-07-04", city="Seattle")
    assert h_flag is True
    assert "Independence Day" in name
    assert spike == "Simulated Independence Day Surge"

    # Regional City Event: Seafair Festival (Seattle)
    h_flag, e_flag, name, spike = HolidayCalendar.get_holiday_event("2026-08-01", city="Seattle")
    assert e_flag is True
    assert "Seafair" in name
    assert spike == "Simulated Summer Festival Surge"

    # Regional City Event: Bellevue Arts Fair (Bellevue)
    h_flag, e_flag, name, spike = HolidayCalendar.get_holiday_event("2026-07-25", city="Bellevue")
    assert e_flag is True
    assert "Bellevue Arts" in name

    # Standard non-event day
    h_flag, e_flag, name, spike = HolidayCalendar.get_holiday_event("2026-04-14", city="Seattle")
    assert h_flag is False
    assert e_flag is False
    assert spike == "Baseline"

def test_unmatched_store_location_no_invented_values():
    """Verify unknown store location returns UNMATCHED and never invents fake weather numbers."""
    srv = SignalsService()
    sig = srv.get_signal(store_id="STORE_DOES_NOT_EXIST", date_str="2026-07-16")
    
    assert sig.provider_status == "UNMATCHED"
    assert "Unmatched Store Location" in sig.source
    assert sig.temperature is None
    assert sig.rainfall is None
    assert sig.holiday_flag is False
    assert sig.event_flag is False

def test_store_coordinate_matching_and_csv_fallback():
    """Verify store location coordinates are matched and CSV benchmark fallback works."""
    srv = SignalsService()
    # Test date present in CSV benchmark dataset
    sample_row = data_service.signals_df[data_service.signals_df["store_id"] == "STORE_01"].iloc[0]
    test_date = sample_row["date"]
    expected_temp = float(sample_row["temperature"])
    sig = srv.get_signal(store_id="STORE_01", date_str=test_date, allow_live=False)
    
    assert sig.store_id == "STORE_01"
    assert sig.city == "Seattle"
    assert sig.provider_status == "VERIFIED_FALLBACK"
    assert "CSV Benchmark Dataset" in sig.source
    assert sig.temperature == expected_temp
    assert sig.retrieved_at is not None

def test_caching_behavior():
    """Verify in-memory caching stores results and returns cached hits on repeated requests."""
    srv = SignalsService()
    srv.clear_cache()
    assert len(srv._cache) == 0

    sample_row = data_service.signals_df[data_service.signals_df["store_id"] == "STORE_01"].iloc[0]
    test_date = sample_row["date"]

    first = srv.get_signal(store_id="STORE_01", date_str=test_date, allow_live=False)
    assert first.is_cached is False
    assert len(srv._cache) == 1

    second = srv.get_signal(store_id="STORE_01", date_str=test_date, allow_live=False)
    assert second.is_cached is True
    assert second.temperature == first.temperature
    assert second.rainfall == first.rainfall

def test_missing_api_key_graceful_handling():
    """Verify keyed provider gracefully operates in fallback mode without crashing when key is absent."""
    with patch.object(settings, "weather_api_provider", "weatherapi"), \
         patch.object(settings, "weather_api_key", ""):
        srv = SignalsService()
        status = srv.get_provider_status()
        assert status.provider == "weatherapi"
        assert status.api_key_configured is False
        assert status.is_fallback_active is True
        assert "API Key Missing" in status.mode

def test_api_failure_fallback_without_hallucinated_values():
    """Verify that if live provider raises an exception or times out, fallback dataset is used."""
    srv = SignalsService()
    sample_row = data_service.signals_df[data_service.signals_df["store_id"] == "STORE_02"].iloc[0]
    test_date = sample_row["date"]
    expected_temp = float(sample_row["temperature"])
    with patch.object(srv._open_meteo, "fetch_weather", return_value=None):
        sig = srv.get_signal(store_id="STORE_02", date_str=test_date, allow_live=True)
        # Should gracefully fall back to CSV benchmark dataset without crash
        assert sig.provider_status == "VERIFIED_FALLBACK"
        assert sig.temperature == expected_temp

def test_signals_ablation_evaluation_in_forecasting():
    """Verify forecasting engine reports model evaluation with and without external signals on identical test period."""
    fc = ForecastingEngine.generate_forecast(
        store_id="STORE_01",
        product_id="PROD_01",
        horizon_days=7,
        model_type="ml"
    )
    eval_data = fc["evaluation"]
    
    assert "ml_wmape" in eval_data
    assert "ml_without_signals_wmape" in eval_data
    assert "ml_without_signals_mae" in eval_data
    assert "signals_available_at_forecast" in eval_data
    assert "signals_impact_note" in eval_data
    assert isinstance(eval_data["signals_available_at_forecast"], bool)

def test_signals_api_routes():
    """Verify /api/signals endpoints expose provenance, source, and timestamps."""
    # 1. Weather Status endpoint
    res_status = client.get("/api/signals/weather-status")
    assert res_status.status_code == 200
    st_data = res_status.json()
    assert "provider" in st_data
    assert "mode" in st_data
    assert "is_fallback_active" in st_data
    assert "cache_entries_count" in st_data
    assert "last_retrieval_timestamp" in st_data

    # 2. Signals List endpoint
    res_list = client.get("/api/signals/list?store_id=STORE_01&limit=5")
    assert res_list.status_code == 200
    sig_list = res_list.json()
    assert len(sig_list) > 0
    first_item = sig_list[0]
    assert "source" in first_item
    assert "provider_status" in first_item
    assert "retrieved_at" in first_item
    assert "city" in first_item
