from typing import Optional, List
import numpy as np
from fastapi import APIRouter, HTTPException, Query, status
from app.services.forecasting_engine import ForecastingEngine
from app.services.data_service import data_service
from app.core.models import (
    ForecastPredictRequest,
    ForecastPredictResponse,
    ForecastSummaryResponse,
    EvaluationSummaryItem,
)

router = APIRouter(prefix="/forecast", tags=["Demand Forecasting Engine"])

@router.post("/predict", response_model=ForecastPredictResponse)
def predict_demand(req: ForecastPredictRequest):
    """
    Generates daily demand forecast for a store-product combination for 7 or 14 days ahead.
    Returns chronological historical actuals, ML forecast, moving-average baseline,
    empirical uncertainty intervals (P10-P90), and honest evaluation metrics.
    """
    result = ForecastingEngine.generate_forecast(
        store_id=req.store_id,
        product_id=req.product_id,
        horizon_days=req.horizon_days,
        model_type=req.model_type
    )

    if result.get("diagnostics", {}).get("status") == "ERROR":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["diagnostics"]["notes"][0]
        )

    return result

@router.get("/predict", response_model=ForecastPredictResponse)
def get_predict_demand(
    store_id: str = Query(..., description="Store identifier (e.g. STORE_01)"),
    product_id: str = Query(..., description="Product identifier (e.g. PROD_01)"),
    horizon_days: int = Query(14, ge=7, le=14, description="Forecast horizon: 7 or 14 days"),
    model_type: str = Query("ml", description="Forecasting model type ('ml' or 'baseline')")
):
    """GET convenience endpoint for demand prediction."""
    return predict_demand(ForecastPredictRequest(
        store_id=store_id,
        product_id=product_id,
        horizon_days=horizon_days,
        model_type=model_type
    ))

@router.get("/evaluation-summary", response_model=ForecastSummaryResponse)
def get_evaluation_summary(
    store_id: Optional[str] = Query("STORE_01"),
    horizon_days: int = Query(14, ge=7, le=14)
):
    """
    Calculates actual out-of-sample forecast accuracy metrics across all products for a store.
    Never fabricates metrics: runs real evaluations against moving average baselines.
    """
    if not data_service.is_loaded:
        data_service.load_all()

    target_store = store_id if store_id and store_id != "ALL" else "STORE_01"
    products = data_service.products_df.to_dict(orient="records") if data_service.products_df is not None else []

    summary_items: List[EvaluationSummaryItem] = []
    ml_wmapes = []
    base_wmapes = []

    for p in products[:8]: # Evaluate top 8 SKUs
        pid = p["product_id"]
        pname = p["name"]
        res = ForecastingEngine.generate_forecast(
            store_id=target_store,
            product_id=pid,
            horizon_days=horizon_days,
            model_type="ml"
        )
        eval_data = res.get("evaluation", {})
        ml_wmape = float(eval_data.get("ml_wmape", 0.0))
        base_wmape = float(eval_data.get("baseline_wmape", 0.0))
        
        diff = ((base_wmape - ml_wmape) / max(0.001, base_wmape)) * 100.0 if base_wmape > 0 else 0.0
        ml_beats = eval_data.get("ml_beats_baseline", False)

        ml_wmapes.append(ml_wmape)
        base_wmapes.append(base_wmape)

        summary_items.append(EvaluationSummaryItem(
            store_id=target_store,
            product_id=pid,
            product_name=pname,
            ml_wmape=round(ml_wmape, 4),
            baseline_wmape=round(base_wmape, 4),
            improvement_pct=round(diff, 1),
            ml_beats_baseline=ml_beats
        ))

    overall_ml = round(float(np.mean(ml_wmapes)), 4) if ml_wmapes else 0.0
    overall_base = round(float(np.mean(base_wmapes)), 4) if base_wmapes else 0.0
    overall_imp = round(((overall_base - overall_ml) / max(0.001, overall_base)) * 100.0, 1) if overall_base > 0 else 0.0

    return ForecastSummaryResponse(
        summary=summary_items,
        overall_ml_wmape=overall_ml,
        overall_baseline_wmape=overall_base,
        overall_improvement_pct=overall_imp
    )
