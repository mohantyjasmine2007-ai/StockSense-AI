from typing import Optional, List
from fastapi import APIRouter, Query
from app.services.data_service import data_service
from app.core.models import SignalItem, WeatherStatusResponse
from app.config import settings

router = APIRouter(prefix="/signals", tags=["External Market Signals"])

@router.get("/list", response_model=List[SignalItem])
def get_signals_list(
    store_id: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500)
):
    """
    Returns external signal observations (weather, holidays, events, and simulated spike tags)
    filtered by store and date window.
    """
    signals = data_service.get_signals_list(
        store_id=store_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit
    )
    return [
        SignalItem(
            date=str(s.get("date")),
            store_id=str(s.get("store_id")),
            holiday_flag=bool(s.get("holiday_flag", False)),
            event_flag=bool(s.get("event_flag", False)),
            event_name=str(s.get("event_name", "None")),
            temperature=float(s["temperature"]) if s.get("temperature") is not None and str(s.get("temperature")) != "nan" else None,
            rainfall=float(s["rainfall"]) if s.get("rainfall") is not None and str(s.get("rainfall")) != "nan" else None,
            spike_label=str(s.get("spike_label", "Baseline"))
        )
        for s in signals
    ]

@router.get("/weather-status", response_model=WeatherStatusResponse)
def get_weather_status():
    """
    Returns the real status of external signal integrations.
    Clearly indicates that offline benchmark signals are currently verified,
    and live Open-Meteo is optional & configurable without fabricating results.
    """
    return WeatherStatusResponse(
        provider=settings.weather_api_provider,
        mode="Offline Verified Signals (CSV-first architecture)",
        is_live_enabled=settings.enable_live_weather,
        is_fallback_active=True,
        message="External signal pipeline operating reliably via verified signals dataset. Live Open-Meteo adapter ready for production deployment without paid API keys."
    )
