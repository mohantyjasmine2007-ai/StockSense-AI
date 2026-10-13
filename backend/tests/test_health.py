import sys
from pathlib import Path
from fastapi.testclient import TestClient

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["app"] == "StockSense AI"

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["dataset_status"] == "ready"
    assert data["stores_count"] == 5
    assert data["products_count"] == 12
    assert data["sales_records_count"] == 5460
    assert data["external_signals_count"] == 525

def test_meta_endpoint():
    response = client.get("/api/meta")
    assert response.status_code == 200
    data = response.json()
    assert len(data["stores"]) == 5
    assert len(data["products"]) == 12
    assert len(data["categories"]) > 0
    assert "date_range" in data
