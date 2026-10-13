import math
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from app.services.data_service import data_service

FEATURE_NAMES = [
    "day_of_week",
    "is_weekend",
    "month",
    "day_of_month",
    "promotion_active",
    "holiday_flag",
    "event_flag",
    "temperature",
    "rainfall",
    "lag_1",
    "lag_2",
    "lag_7",
    "lag_14",
    "rolling_mean_7",
    "rolling_std_7",
    "rolling_mean_14",
]

FEATURE_DESCRIPTIONS = {
    "day_of_week": "Day of the week seasonality (0=Mon, 6=Sun)",
    "is_weekend": "Weekend indicator (Fri/Sat/Sun retail volume)",
    "month": "Monthly seasonality index",
    "day_of_month": "Day of month (payday / grocery cycle)",
    "promotion_active": "Discount or marketing promotion active",
    "holiday_flag": "Regional or federal holiday indicator",
    "event_flag": "Local event / festival traffic signal",
    "temperature": "Observed temperature anomaly (°C)",
    "rainfall": "Precipitation volume (mm rainfall)",
    "lag_1": "Previous day sales (T-1)",
    "lag_2": "Sales from two days prior (T-2)",
    "lag_7": "Same day last week sales (T-7)",
    "lag_14": "Sales from two weeks prior (T-14)",
    "rolling_mean_7": "7-day moving average of prior sales",
    "rolling_std_7": "7-day sales standard deviation (demand volatility)",
    "rolling_mean_14": "14-day rolling demand trend baseline",
}

class ForecastingEngine:
    _cache: Dict[Tuple[str, str, int, str], Dict[str, Any]] = {}

    @classmethod
    def clear_cache(cls):
        cls._cache.clear()

    @staticmethod
    def calculate_wmape(actual: np.ndarray, predicted: np.ndarray) -> float:
        """Calculates Weighted Mean Absolute Percentage Error, safely handling zero total demand."""
        sum_actual = float(np.sum(actual))
        if sum_actual <= 0:
            # If total actual demand is 0, return 0.0 if predictions match 0, else 1.0 (100%)
            return 0.0 if np.all(predicted == 0) else 1.0
        return float(np.sum(np.abs(actual - predicted)) / sum_actual)

    @staticmethod
    def calculate_mae(actual: np.ndarray, predicted: np.ndarray) -> float:
        if len(actual) == 0:
            return 0.0
        return float(np.mean(np.abs(actual - predicted)))

    @classmethod
    def generate_forecast(
        cls,
        store_id: str,
        product_id: str,
        horizon_days: int = 14,
        model_type: str = "ml"
    ) -> Dict[str, Any]:
        """
        Generates demand forecasts for a store-product combination.
        Includes chronological test evaluation, moving-average baseline comparison,
        and empirical quantile uncertainty bounds.
        """
        horizon_days = 7 if horizon_days == 7 else 14
        cache_key = (store_id, product_id, horizon_days, model_type)
        if cache_key in cls._cache:
            return cls._cache[cache_key]
        
        # 1. Fetch data
        if not data_service.is_loaded:
            data_service.load_all()

        sales_df = data_service.sales_df
        signals_df = data_service.signals_df
        stores_df = data_service.stores_df
        products_df = data_service.products_df

        store_name = store_id
        if stores_df is not None and "store_id" in stores_df.columns:
            match = stores_df[stores_df["store_id"] == store_id]
            if not match.empty:
                store_name = match.iloc[0]["name"]

        product_name = product_id
        category = "General"
        if products_df is not None and "product_id" in products_df.columns:
            pmatch = products_df[products_df["product_id"] == product_id]
            if not pmatch.empty:
                product_name = pmatch.iloc[0]["name"]
                category = pmatch.iloc[0]["category"]

        diagnostics: Dict[str, Any] = {
            "history_days_available": 0,
            "missing_signals_imputed": False,
            "status": "OK",
            "notes": []
        }

        if sales_df is None or sales_df.empty:
            return cls._empty_fallback(store_id, product_id, store_name, product_name, category, horizon_days, "No sales dataset loaded.")

        # 2. Filter and sort chronologically
        sp_sales = sales_df[(sales_df["store_id"] == store_id) & (sales_df["product_id"] == product_id)].copy()
        if sp_sales.empty:
            return cls._empty_fallback(store_id, product_id, store_name, product_name, category, horizon_days, f"No sales history found for store {store_id} and product {product_id}.")

        # Aggregate at date level in case multiple records exist
        sp_sales["date"] = pd.to_datetime(sp_sales["date"])
        agg_dict: Dict[str, Any] = {"units_sold": "sum"}
        if "promotion_active" in sp_sales.columns:
            agg_dict["promotion_active"] = "max"
        if "simulated_spike_tag" in sp_sales.columns:
            agg_dict["simulated_spike_tag"] = "first"

        daily = sp_sales.groupby("date").agg(agg_dict).reset_index()
        daily = daily.sort_values(by="date").reset_index(drop=True)

        # Ensure regular daily calendar cadence (filling zero-demand days safely)
        min_dt = daily["date"].min()
        max_dt = daily["date"].max()
        full_idx = pd.date_range(min_dt, max_dt, freq="D")
        daily = daily.set_index("date").reindex(full_idx).reset_index()
        daily = daily.rename(columns={"index": "date"})
        daily["store_id"] = store_id
        daily["product_id"] = product_id
        daily["units_sold"] = daily["units_sold"].fillna(0.0)
        if "promotion_active" in daily.columns:
            daily["promotion_active"] = daily["promotion_active"].fillna(False)
        if "simulated_spike_tag" in daily.columns:
            daily["simulated_spike_tag"] = daily["simulated_spike_tag"].fillna("None")

        daily = daily.sort_values(by="date").reset_index(drop=True)
        diagnostics["history_days_available"] = len(daily)

        # Check for insufficient history
        if len(daily) < 14:
            diagnostics["status"] = "INSUFFICIENT_HISTORY"
            diagnostics["notes"].append("Fewer than 14 historical daily records available. Model training skipped; using basic historical average.")
            return cls._insufficient_history_fallback(daily, store_id, product_id, store_name, product_name, category, horizon_days, diagnostics)

        # 3. Merge external signals (leakage-free past merge)
        has_signals = signals_df is not None and not signals_df.empty and "store_id" in signals_df.columns
        if has_signals:
            sig = signals_df[signals_df["store_id"] == store_id].copy()
            sig["date"] = pd.to_datetime(sig["date"])
            cols_to_merge = [c for c in ["holiday_flag", "event_flag", "event_name", "temperature", "rainfall", "spike_label"] if c in sig.columns]
            merged = pd.merge(daily, sig[["date"] + cols_to_merge], on="date", how="left")
            
            # Check for missing columns
            missing_cols = []
            if "holiday_flag" not in merged.columns:
                merged["holiday_flag"] = 0
                missing_cols.append("holiday_flag")
            if "event_flag" not in merged.columns:
                merged["event_flag"] = 0
                missing_cols.append("event_flag")
            if "temperature" not in merged.columns:
                merged["temperature"] = 18.0
                missing_cols.append("temperature")
            if "rainfall" not in merged.columns:
                merged["rainfall"] = 0.0
                missing_cols.append("rainfall")
            
            if missing_cols:
                diagnostics["missing_signals_imputed"] = True
                diagnostics["notes"].append(f"External features missing and imputed with defaults: {', '.join(missing_cols)}.")
        else:
            merged = daily.copy()
            merged["holiday_flag"] = 0
            merged["event_flag"] = 0
            merged["temperature"] = 18.0
            merged["rainfall"] = 0.0
            diagnostics["missing_signals_imputed"] = True
            diagnostics["notes"].append("External signals table unavailable; default baseline signals imputed.")

        # Ensure numeric features
        merged["holiday_flag"] = merged["holiday_flag"].fillna(False).astype(int)
        merged["event_flag"] = merged["event_flag"].fillna(False).astype(int)
        merged["promotion_active"] = merged["promotion_active"].fillna(False).astype(int)
        avg_temp = float(merged["temperature"].mean()) if not pd.isna(merged["temperature"].mean()) else 18.0
        merged["temperature"] = merged["temperature"].fillna(avg_temp)
        merged["rainfall"] = merged["rainfall"].fillna(0.0)

        # 4. Feature engineering strictly on shifted historical data
        merged["day_of_week"] = merged["date"].dt.dayofweek
        merged["is_weekend"] = (merged["day_of_week"] >= 5).astype(int)
        merged["month"] = merged["date"].dt.month
        merged["day_of_month"] = merged["date"].dt.day

        # Lags
        merged["lag_1"] = merged["units_sold"].shift(1)
        merged["lag_2"] = merged["units_sold"].shift(2)
        merged["lag_7"] = merged["units_sold"].shift(7)
        merged["lag_14"] = merged["units_sold"].shift(14)

        # Rolling statistics strictly shifted by 1 to prevent current-day leakage
        merged["rolling_mean_7"] = merged["units_sold"].shift(1).rolling(7, min_periods=1).mean()
        merged["rolling_std_7"] = merged["units_sold"].shift(1).rolling(7, min_periods=1).std().fillna(0)
        merged["rolling_mean_14"] = merged["units_sold"].shift(1).rolling(14, min_periods=1).mean()

        # Drop warmup rows with missing lags
        clean_df = merged.dropna(subset=["lag_14"]).reset_index(drop=True)

        if len(clean_df) < (horizon_days + 7):
            diagnostics["status"] = "INSUFFICIENT_HISTORY"
            diagnostics["notes"].append(f"Insufficient historical records ({len(clean_df)} post-warmup) to support chronological {horizon_days}-day evaluation. Using fallback.")
            return cls._insufficient_history_fallback(daily, store_id, product_id, store_name, product_name, category, horizon_days, diagnostics)

        # 5. Chronological Train / Test Split
        # Test set is the last horizon_days of historical records (no future leakage)
        train_df = clean_df.iloc[:-horizon_days].copy()
        test_df = clean_df.iloc[-horizon_days:].copy()

        X_train = train_df[FEATURE_NAMES].values
        y_train = train_df["units_sold"].values
        X_test = test_df[FEATURE_NAMES].values
        y_test = test_df["units_sold"].values

        # 6. Model Training: Random Forest Regressor
        rf = RandomForestRegressor(
            n_estimators=50,
            max_depth=5,
            min_samples_leaf=2,
            random_state=42
        )
        rf.fit(X_train, y_train)

        # In-sample predictions and residuals for uncertainty estimation
        y_train_pred = rf.predict(X_train)
        residuals = y_train - y_train_pred
        q10_residual = float(np.percentile(residuals, 10))
        q90_residual = float(np.percentile(residuals, 90))

        # Test set predictions
        y_test_pred_ml = np.maximum(0, rf.predict(X_test))

        # Baseline: 7-day Moving Average on test set
        # For each test day, baseline is the rolling_mean_7 (average of preceding 7 days)
        y_test_pred_baseline = np.maximum(0, test_df["rolling_mean_7"].values)

        # Metrics calculation
        ml_mae = cls.calculate_mae(y_test, y_test_pred_ml)
        ml_wmape = cls.calculate_wmape(y_test, y_test_pred_ml)
        base_mae = cls.calculate_mae(y_test, y_test_pred_baseline)
        base_wmape = cls.calculate_wmape(y_test, y_test_pred_baseline)

        ml_beats_baseline = bool(ml_wmape < base_wmape)
        diff_pct = ((base_wmape - ml_wmape) / max(0.001, base_wmape)) * 100.0

        if ml_beats_baseline:
            signals_impact_note = f"ML model reduced forecast error by {diff_pct:.1f}% (WMAPE {ml_wmape:.1%} vs {base_wmape:.1%}) relative to moving average on chronological test slice."
        else:
            signals_impact_note = f"Moving average baseline was competitive (WMAPE {base_wmape:.1%} vs {ml_wmape:.1%}) during this test interval. External signals did not demonstrate a measurable accuracy improvement on this test slice."

        test_start_str = test_df["date"].iloc[0].strftime("%Y-%m-%d")
        test_end_str = test_df["date"].iloc[-1].strftime("%Y-%m-%d")

        evaluation = {
            "test_start_date": test_start_str,
            "test_end_date": test_end_str,
            "test_samples": len(y_test),
            "ml_mae": round(ml_mae, 2),
            "ml_wmape": round(ml_wmape, 4),
            "baseline_mae": round(base_mae, 2),
            "baseline_wmape": round(base_wmape, 4),
            "ml_beats_baseline": ml_beats_baseline,
            "signals_impact_note": signals_impact_note,
            "uncertainty_method": "Empirical residual quantile estimation (P10 to P90 bounds scaled by horizon step sqrt(1 + 0.04*k)) derived from chronological training residuals. Note: Decision-support model, not certified as production-ready."
        }

        # Feature importances
        raw_importances = rf.feature_importances_
        feature_importances = []
        for feat, imp in sorted(zip(FEATURE_NAMES, raw_importances), key=lambda x: x[1], reverse=True)[:8]:
            feature_importances.append({
                "feature": feat,
                "importance": round(float(imp), 4),
                "description": FEATURE_DESCRIPTIONS.get(feat, feat)
            })

        # 7. Generate Out-of-Sample Future Forecast (Next horizon_days days)
        last_date = daily["date"].max()
        future_dates = [last_date + timedelta(days=i) for i in range(1, horizon_days + 1)]

        # Fetch future external signals
        future_signals: Dict[str, Dict[str, Any]] = {}
        if signals_df is not None and not signals_df.empty:
            fsig = signals_df[signals_df["store_id"] == store_id].copy()
            fsig["date"] = pd.to_datetime(fsig["date"])
            for _, srow in fsig.iterrows():
                dt_key = srow["date"].strftime("%Y-%m-%d")
                future_signals[dt_key] = {
                    "holiday_flag": int(srow.get("holiday_flag", False)),
                    "event_flag": int(srow.get("event_flag", False)),
                    "temperature": float(srow.get("temperature", 18.0)) if not pd.isna(srow.get("temperature")) else 18.0,
                    "rainfall": float(srow.get("rainfall", 0.0)) if not pd.isna(srow.get("rainfall")) else 0.0,
                    "spike_label": str(srow.get("spike_label", "Baseline"))
                }

        # Multi-step autoregressive rollout
        recent_sales = list(daily["units_sold"].values)
        forecast_points = []

        for k, f_date in enumerate(future_dates, start=1):
            f_date_str = f_date.strftime("%Y-%m-%d")
            sig_data = future_signals.get(f_date_str, {
                "holiday_flag": 0,
                "event_flag": 0,
                "temperature": 18.0,
                "rainfall": 0.0,
                "spike_label": "Baseline"
            })

            dow = f_date.dayofweek
            is_wknd = 1 if dow >= 5 else 0
            month = f_date.month
            dom = f_date.day
            promo = 0 # Default future promo assumption

            # Build lags from recent_sales sequence
            lag1 = recent_sales[-1] if len(recent_sales) >= 1 else 0
            lag2 = recent_sales[-2] if len(recent_sales) >= 2 else lag1
            lag7 = recent_sales[-7] if len(recent_sales) >= 7 else lag1
            lag14 = recent_sales[-14] if len(recent_sales) >= 14 else lag7

            r_mean7 = float(np.mean(recent_sales[-7:])) if len(recent_sales) >= 7 else float(lag1)
            r_std7 = float(np.std(recent_sales[-7:])) if len(recent_sales) >= 7 else 0.0
            r_mean14 = float(np.mean(recent_sales[-14:])) if len(recent_sales) >= 14 else r_mean7

            x_future = np.array([[
                dow,
                is_wknd,
                month,
                dom,
                promo,
                sig_data["holiday_flag"],
                sig_data["event_flag"],
                sig_data["temperature"],
                sig_data["rainfall"],
                lag1,
                lag2,
                lag7,
                lag14,
                r_mean7,
                r_std7,
                r_mean14
            ]])

            pred_val = float(np.maximum(0, rf.predict(x_future)[0]))
            base_val = round(r_mean7, 1)

            # Uncertainty bounds with horizon scaling
            step_scale = math.sqrt(1.0 + 0.04 * (k - 1))
            p50 = round(pred_val, 1)
            lower = max(0.0, round(pred_val + q10_residual * step_scale, 1))
            upper = max(lower, round(pred_val + q90_residual * step_scale, 1))
            
            # Enforce strict ordering lower <= p50 <= upper
            lower = min(lower, p50)
            upper = max(upper, p50)
            if upper <= lower:
                lower = max(0.0, round(p50 * 0.85, 1))
                upper = max(lower + 1.0, round(p50 * 1.15, 1))

            # Append to history sequence for next step autoregression
            recent_sales.append(p50)

            forecast_points.append({
                "date": f_date_str,
                "actual_sales": None,
                "predicted_demand": p50,
                "baseline_demand": base_val,
                "lower_bound": lower,
                "upper_bound": upper,
                "is_forecast": True,
                "spike_label": sig_data["spike_label"]
            })

        # Historical context points (last 30 days)
        hist_slice = daily.tail(30)
        historical_points = []
        for _, hrow in hist_slice.iterrows():
            historical_points.append({
                "date": hrow["date"].strftime("%Y-%m-%d"),
                "actual_sales": float(hrow["units_sold"]),
                "predicted_demand": None,
                "baseline_demand": None,
                "lower_bound": None,
                "upper_bound": None,
                "is_forecast": False,
                "spike_label": str(hrow.get("simulated_spike_tag", "None"))
            })

        result = {
            "store_id": store_id,
            "product_id": product_id,
            "store_name": store_name,
            "product_name": product_name,
            "category": category,
            "horizon_days": horizon_days,
            "historical_points": historical_points,
            "forecast_points": forecast_points,
            "evaluation": evaluation,
            "feature_importances": feature_importances,
            "diagnostics": diagnostics
        }
        cls._cache[cache_key] = result
        return result

    @classmethod
    def _insufficient_history_fallback(
        cls,
        daily: pd.DataFrame,
        store_id: str,
        product_id: str,
        store_name: str,
        product_name: str,
        category: str,
        horizon_days: int,
        diagnostics: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Provides a safe median fallback when history is too short for ML training."""
        median_val = float(daily["units_sold"].median()) if not daily.empty else 10.0
        last_date = daily["date"].max() if not daily.empty else pd.Timestamp.now()
        future_dates = [last_date + timedelta(days=i) for i in range(1, horizon_days + 1)]

        forecast_points = [
            {
                "date": d.strftime("%Y-%m-%d"),
                "actual_sales": None,
                "predicted_demand": round(median_val, 1),
                "baseline_demand": round(median_val, 1),
                "lower_bound": max(0.0, round(median_val * 0.7, 1)),
                "upper_bound": round(median_val * 1.3, 1),
                "is_forecast": True,
                "spike_label": "Insufficient History (Fallback)"
            }
            for d in future_dates
        ]

        historical_points = [
            {
                "date": r["date"].strftime("%Y-%m-%d"),
                "actual_sales": float(r["units_sold"]),
                "predicted_demand": None,
                "baseline_demand": None,
                "lower_bound": None,
                "upper_bound": None,
                "is_forecast": False,
                "spike_label": "Historical Record"
            }
            for _, r in daily.iterrows()
        ]

        return {
            "store_id": store_id,
            "product_id": product_id,
            "store_name": store_name,
            "product_name": product_name,
            "category": category,
            "horizon_days": horizon_days,
            "historical_points": historical_points,
            "forecast_points": forecast_points,
            "evaluation": {
                "test_start_date": "N/A",
                "test_end_date": "N/A",
                "test_samples": 0,
                "ml_mae": 0.0,
                "ml_wmape": 0.0,
                "baseline_mae": 0.0,
                "baseline_wmape": 0.0,
                "ml_beats_baseline": False,
                "signals_impact_note": "Insufficient chronological records (<14 days) to train machine learning model.",
                "uncertainty_method": "Default +/-30% buffer on historical median."
            },
            "feature_importances": [],
            "diagnostics": diagnostics
        }

    @classmethod
    def _empty_fallback(
        cls,
        store_id: str,
        product_id: str,
        store_name: str,
        product_name: str,
        category: str,
        horizon_days: int,
        error_msg: str
    ) -> Dict[str, Any]:
        return {
            "store_id": store_id,
            "product_id": product_id,
            "store_name": store_name,
            "product_name": product_name,
            "category": category,
            "horizon_days": horizon_days,
            "historical_points": [],
            "forecast_points": [],
            "evaluation": {
                "test_start_date": "N/A",
                "test_end_date": "N/A",
                "test_samples": 0,
                "ml_mae": 0.0,
                "ml_wmape": 0.0,
                "baseline_mae": 0.0,
                "baseline_wmape": 0.0,
                "ml_beats_baseline": False,
                "signals_impact_note": error_msg,
                "uncertainty_method": "N/A"
            },
            "feature_importances": [],
            "diagnostics": {
                "status": "ERROR",
                "notes": [error_msg]
            }
        }
