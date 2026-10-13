from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException, status
from app.services.signals_service import signals_service
from app.core.models import SignalItem, WeatherStatusResponse

router = APIRouter(prefix="/signals", tags=["External Market Signals"])

@router.get("/list", response_model=List[SignalItem])
def get_signals_list(
    store_id: Optional[str] = Query(None, description="Store identifier or ALL"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    limit: int = Query(100, ge=1, le=500, description="Max records to return")
):
    """
    Returns location-matched external signal observations (weather, holidays, events, and spike tags)
    with clear provenance sources, timestamps, and provider fallback status.
    """
    return signals_service.get_signals_for_store(
        store_id=store_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit
    )

@router.get("/weather-status", response_model=WeatherStatusResponse)
def get_weather_status():
    """
    Returns real configuration, authentication, caching, and fallback status
    of external weather and holiday providers.
    """
    return signals_service.get_provider_status()

@router.get("/store/{store_id}/date/{date_str}", response_model=SignalItem)
def get_single_signal(store_id: str, date_str: str):
    """
    Retrieves signal for a specific store and date with complete provenance metadata.
    """
    return signals_service.get_signal(store_id=store_id, date_str=date_str, allow_live=True)
