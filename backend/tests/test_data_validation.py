import io
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app

client = TestClient(app)

def test_data_status():
    response = client.get("/api/data/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["stores_count"] == 5
    assert data["products_count"] == 12
    assert data["sales_records"] > 0
    assert data["inventory_records"] > 0
    assert data["signals_records"] > 0

def test_dataset_preview_sales():
    response = client.get("/api/data/preview/sales?store_id=STORE_01&limit=10")
    assert response.status_code == 200
    data = response.json()
    assert data["dataset_type"] == "sales"
    assert len(data["rows"]) <= 10
    if len(data["rows"]) > 0:
        assert data["rows"][0]["store_id"] == "STORE_01"

def test_signals_list():
    response = client.get("/api/signals/list?store_id=STORE_01&limit=20")
    assert response.status_code == 200
    signals = response.json()
    assert len(signals) <= 20
    assert len(signals) > 0
    first = signals[0]
    assert "date" in first
    assert "temperature" in first
    assert "rainfall" in first
    assert "spike_label" in first

def test_weather_status_adapter():
    response = client.get("/api/signals/weather-status")
    assert response.status_code == 200
    status = response.json()
    assert "Offline Verified Signals" in status["mode"]
    assert status["is_fallback_active"] is True

def test_valid_sales_upload():
    csv_content = (
        "date,store_id,product_id,units_sold,unit_price,promotion_active\n"
        "2026-05-01,STORE_01,PROD_01,15,4.50,True\n"
        "2026-05-01,STORE_01,PROD_02,22,3.80,False\n"
    )
    files = {"file": ("test_sales.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/data/upload/sales", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["is_valid"] is True
    assert data["total_rows"] == 2
    assert data["error_count"] == 0

def test_invalid_upload_missing_column():
    csv_content = (
        "date,store_id,product_id,unit_price,promotion_active\n" # Missing units_sold!
        "2026-05-01,STORE_01,PROD_01,4.50,True\n"
    )
    files = {"file": ("bad_sales.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/data/upload/sales", files=files)
    assert response.status_code == 422
    data = response.json()
    assert data["is_valid"] is False
    assert any(e["category"] == "MISSING_COLUMN" and e["column"] == "units_sold" for e in data["errors"])

def test_invalid_upload_negative_quantity():
    csv_content = (
        "date,store_id,product_id,units_sold,unit_price,promotion_active\n"
        "2026-05-01,STORE_01,PROD_01,-12,4.50,True\n" # Negative units_sold!
    )
    files = {"file": ("bad_negative.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/data/upload/sales", files=files)
    assert response.status_code == 422
    data = response.json()
    assert data["is_valid"] is False
    assert any(e["category"] == "NEGATIVE_VALUE" for e in data["errors"])

def test_invalid_upload_invalid_date():
    csv_content = (
        "date,store_id,product_id,units_sold,unit_price,promotion_active\n"
        "2026/05/01,STORE_01,PROD_01,10,4.50,True\n" # Slash instead of dash YYYY-MM-DD
    )
    files = {"file": ("bad_date.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/data/upload/sales", files=files)
    assert response.status_code == 422
    data = response.json()
    assert data["is_valid"] is False
    assert any(e["category"] == "INVALID_DATE" for e in data["errors"])

def test_invalid_upload_unknown_store_id():
    csv_content = (
        "date,store_id,product_id,units_sold,unit_price,promotion_active\n"
        "2026-05-01,STORE_999_UNKNOWN,PROD_01,10,4.50,True\n"
    )
    files = {"file": ("unknown_store.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/data/upload/sales", files=files)
    assert response.status_code == 422
    data = response.json()
    assert data["is_valid"] is False
    assert any(e["category"] == "UNKNOWN_STORE_ID" for e in data["errors"])

def test_invalid_upload_duplicate_key():
    csv_content = (
        "date,store_id,product_id,units_sold,unit_price,promotion_active\n"
        "2026-05-01,STORE_01,PROD_01,10,4.50,True\n"
        "2026-05-01,STORE_01,PROD_01,12,4.50,False\n" # Duplicate row on same date/store/prod!
    )
    files = {"file": ("duplicate_keys.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/data/upload/sales", files=files)
    assert response.status_code == 422
    data = response.json()
    assert data["is_valid"] is False
    assert any(e["category"] == "DUPLICATE_KEY" for e in data["errors"])

def test_invalid_upload_type_mismatch():
    csv_content = (
        "date,store_id,product_id,units_sold,unit_price,promotion_active\n"
        "2026-05-01,STORE_01,PROD_01,ten_units,4.50,True\n" # String in integer column!
    )
    files = {"file": ("bad_type.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/data/upload/sales", files=files)
    assert response.status_code == 422
    data = response.json()
    assert data["is_valid"] is False
    assert any(e["category"] == "TYPE_MISMATCH" for e in data["errors"])

def test_reset_demo_data_endpoint():
    response = client.post("/api/data/reset-demo")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
