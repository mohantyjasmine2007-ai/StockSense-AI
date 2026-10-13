import json
import math
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd

from app.services.data_service import data_service
from app.services.forecasting_engine import ForecastingEngine
from app.core.models import (
    InventoryItemStatus,
    ActionEvidence,
    RecommendedActionItem,
    InventorySummaryResponse,
    RebalanceRecommendationsResponse,
)

ACTIONS_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "actions_store.json"

def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two GPS coordinates in miles."""
    R = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 1)

class InventoryService:
    def __init__(self):
        self._action_status_override: Dict[str, Dict[str, Any]] = {}
        self._cached_summary: Optional[InventorySummaryResponse] = None
        self._load_persisted_actions()

    def clear_cache(self):
        self._cached_summary = None

    def _load_persisted_actions(self):
        if ACTIONS_FILE.exists():
            try:
                with open(ACTIONS_FILE, "r", encoding="utf-8") as f:
                    self._action_status_override = json.load(f)
            except Exception as e:
                print(f"Warning: Failed to load {ACTIONS_FILE}: {e}")
                self._action_status_override = {}

    def _save_persisted_actions(self):
        ACTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(ACTIONS_FILE, "w", encoding="utf-8") as f:
                json.dump(self._action_status_override, f, indent=2)
        except Exception as e:
            print(f"Error saving {ACTIONS_FILE}: {e}")

    @staticmethod
    def calculate_safety_stock(
        demand_std: float,
        lead_time_days: int,
        service_z: float = 1.65,
        min_buffer: int = 2
    ) -> int:
        """
        Calculates dynamic safety stock: SS = ceil(z * sigma_d * sqrt(L)).
        Enforces a minimum buffer to handle retail lumpiness.
        """
        lead_time_days = max(1, lead_time_days)
        raw_ss = service_z * max(0.5, demand_std) * math.sqrt(lead_time_days)
        return max(min_buffer, int(math.ceil(raw_ss)))

    @staticmethod
    def calculate_reorder_point(
        average_daily_demand: float,
        lead_time_days: int,
        safety_stock: int
    ) -> int:
        """ROP = (AvgDailyDemand * LeadTime) + SafetyStock."""
        lead_time_days = max(1, lead_time_days)
        lead_time_demand = average_daily_demand * lead_time_days
        return int(math.ceil(lead_time_demand + safety_stock))

    @staticmethod
    def calculate_projected_stock(
        stock_on_hand: int,
        incoming_quantity: int,
        daily_forecast: List[float]
    ) -> Tuple[List[float], Optional[int]]:
        """
        Simulates daily inventory position over the forecast horizon.
        Assumes incoming orders arrive on day 1 (already in-transit).
        Returns: (projected_trajectory, time_to_shortage_day)
        """
        trajectory: List[float] = []
        curr = float(stock_on_hand + incoming_quantity)
        time_to_shortage: Optional[int] = None

        for day_idx, demand in enumerate(daily_forecast, start=1):
            curr -= float(demand)
            trajectory.append(round(curr, 1))
            if curr <= 0 and time_to_shortage is None:
                time_to_shortage = day_idx

        return trajectory, time_to_shortage

    def get_inventory_status(self, force_refresh: bool = False) -> InventorySummaryResponse:
        """
        Computes projected stock, stockout risk, safety buffers, and surplus/deficits
        for all store-product combinations.
        """
        if self._cached_summary is not None and not force_refresh:
            return self._cached_summary

        if not data_service.is_loaded:
            data_service.load_all()

        inv_df = data_service.inventory_df
        stores_df = data_service.stores_df
        products_df = data_service.products_df

        if inv_df is None or stores_df is None or products_df is None:
            return InventorySummaryResponse(
                total_skus_monitored=0,
                total_stockout_risks=0,
                critical_shortages_count=0,
                total_surplus_units=0,
                total_deficit_units=0,
                overstock_count=0,
                total_inventory_value=0.0,
                excess_holding_value=0.0,
                items=[]
            )

        stores_map = {row["store_id"]: row for _, row in stores_df.iterrows()}
        products_map = {row["product_id"]: row for _, row in products_df.iterrows()}

        items: List[InventoryItemStatus] = []
        total_value = 0.0
        excess_value = 0.0
        stockout_risks_count = 0
        critical_count = 0
        total_surplus_units = 0
        total_deficit_units = 0
        overstock_count = 0

        for _, row in inv_df.iterrows():
            store_id = str(row["store_id"])
            prod_id = str(row["product_id"])
            soh = int(row.get("stock_on_hand", 0))
            incoming = int(row.get("incoming_quantity", 0))
            lead_time = int(row.get("supplier_lead_time_days", 3))
            unit_cost = float(row.get("unit_cost", 1.0))

            s_info = stores_map.get(store_id, {})
            p_info = products_map.get(prod_id, {})
            store_name = s_info.get("name", store_id)
            city = s_info.get("city", "Regional")
            prod_name = p_info.get("name", prod_id)
            category = p_info.get("category", "General")

            # Fetch forecast from Phase 3 Forecasting Engine
            fc_res = ForecastingEngine.generate_forecast(
                store_id=store_id,
                product_id=prod_id,
                horizon_days=14,
                model_type="ml"
            )

            fc_points = fc_res.get("forecast_points", [])
            daily_demands = [float(p.get("predicted_demand", 0.0) or 0.0) for p in fc_points]
            
            # Ensure 14 daily demands
            if len(daily_demands) < 14:
                daily_demands = daily_demands + [daily_demands[-1] if daily_demands else 5.0] * (14 - len(daily_demands))

            d_7 = round(sum(daily_demands[:7]), 1)
            d_14 = round(sum(daily_demands[:14]), 1)
            avg_daily = round(d_14 / 14.0, 1)

            # Volatility from forecast spread or daily std
            demand_std = float(np.std(daily_demands[:14])) if len(daily_demands) >= 2 else max(1.0, avg_daily * 0.25)
            safety_stock = self.calculate_safety_stock(demand_std, lead_time)
            reorder_point = self.calculate_reorder_point(avg_daily, lead_time, safety_stock)

            # Projected trajectory
            proj_14, tts = self.calculate_projected_stock(soh, incoming, daily_demands[:14])
            days_of_supply = round((soh + incoming) / max(0.1, avg_daily), 1)

            # Net Position relative to 7-day replenishment cycle + safety buffer
            net_position_7 = round((soh + incoming) - (d_7 + safety_stock), 1)
            net_position_14 = round((soh + incoming) - (d_14 + safety_stock), 1)

            # Available genuine surplus for donor stores:
            # Donor must strictly retain at least its own 7-day forecast demand + safety buffer
            donor_surplus = max(0, int(math.floor((soh + incoming) - (d_7 + safety_stock))))

            # Risk classification
            is_overstock = False
            is_stockout = False

            if tts is not None and tts <= lead_time:
                stockout_risk = "CRITICAL"
                is_stockout = True
                critical_count += 1
                stockout_risks_count += 1
            elif tts is not None and tts <= 7:
                stockout_risk = "HIGH"
                is_stockout = True
                stockout_risks_count += 1
            elif net_position_7 < 0:
                stockout_risk = "DEFICIT"
                is_stockout = True
                stockout_risks_count += 1
            elif days_of_supply > 25.0 and soh > (d_14 + safety_stock) * 2.2:
                stockout_risk = "OVERSTOCK"
                is_overstock = True
                overstock_count += 1
                excess_units = max(0, soh - int(d_14 + safety_stock))
                excess_value += excess_units * unit_cost
            elif donor_surplus >= 15:
                stockout_risk = "SURPLUS"
            else:
                stockout_risk = "HEALTHY"

            if net_position_7 > 0:
                total_surplus_units += donor_surplus
            else:
                total_deficit_units += abs(int(net_position_7))

            item_val = (soh + incoming) * unit_cost
            total_value += item_val

            items.append(InventoryItemStatus(
                store_id=store_id,
                store_name=store_name,
                city=city,
                product_id=prod_id,
                product_name=prod_name,
                category=category,
                stock_on_hand=soh,
                incoming_quantity=incoming,
                supplier_lead_time_days=lead_time,
                unit_cost=unit_cost,
                forecast_demand_7d=d_7,
                forecast_demand_14d=d_14,
                average_daily_demand=avg_daily,
                demand_std=round(demand_std, 2),
                safety_stock=safety_stock,
                reorder_point=reorder_point,
                days_of_supply=days_of_supply,
                projected_stock_14d=proj_14,
                time_to_shortage_days=tts,
                stockout_risk=stockout_risk,
                net_surplus_deficit=net_position_7,
                available_donor_surplus=donor_surplus,
                is_overstock=is_overstock,
                is_stockout_risk=is_stockout
            ))

        summary = InventorySummaryResponse(
            total_skus_monitored=len(items),
            total_stockout_risks=stockout_risks_count,
            critical_shortages_count=critical_count,
            total_surplus_units=total_surplus_units,
            total_deficit_units=total_deficit_units,
            overstock_count=overstock_count,
            total_inventory_value=round(total_value, 2),
            excess_holding_value=round(excess_value, 2),
            items=items
        )
        self._cached_summary = summary
        return summary

    def solve_rebalancing_recommendations(self) -> RebalanceRecommendationsResponse:
        """
        Multi-store rebalancing solver:
        1. Identifies receiving stores with deficits.
        2. Searches neighboring donor stores with genuine surplus.
        3. Enforces donor store protection rule: donor never transfers below its own demand + safety buffer.
        4. Recommends transfers where possible (1-day lead time vs 3-5 days supplier lead time).
        5. Recommends supplier reorders when transfers are insufficient or unavailable.
        """
        inv_summary = self.get_inventory_status()
        items = inv_summary.items

        stores_df = data_service.stores_df
        products_df = data_service.products_df
        
        stores_coords: Dict[str, Tuple[float, float]] = {}
        if stores_df is not None:
            for _, r in stores_df.iterrows():
                stores_coords[str(r["store_id"])] = (float(r.get("latitude", 47.6)), float(r.get("longitude", -122.3)))

        products_info: Dict[str, Dict[str, Any]] = {}
        if products_df is not None:
            for _, r in products_df.iterrows():
                products_info[str(r["product_id"])] = r.to_dict()

        # Group items by product_id
        items_by_product: Dict[str, List[InventoryItemStatus]] = {}
        for item in items:
            items_by_product.setdefault(item.product_id, []).append(item)

        recommendations: List[RecommendedActionItem] = []
        total_procurement_savings = 0.0
        prevented_stockouts = 0

        # Maintain committed transfers to protect donors across multiple deficits
        donor_committed: Dict[Tuple[str, str], int] = {}

        for prod_id, prod_items in items_by_product.items():
            p_meta = products_info.get(prod_id, {})
            min_order_qty = int(p_meta.get("min_order_qty", 20))
            supplier_lead_time = int(p_meta.get("lead_time_days", 3))

            # Separate into deficit stores and surplus stores
            deficit_stores = [it for it in prod_items if it.net_surplus_deficit < 0 or it.is_stockout_risk]
            # Sort deficits by urgency: critical first, then deficit size
            deficit_stores.sort(key=lambda x: (
                0 if x.stockout_risk == "CRITICAL" else (1 if x.stockout_risk == "HIGH" else 2),
                x.time_to_shortage_days or 99,
                x.net_surplus_deficit
            ))

            for rec in deficit_stores:
                needed_qty = abs(int(math.ceil(rec.net_surplus_deficit)))
                if needed_qty <= 0 and rec.time_to_shortage_days is not None:
                    needed_qty = max(5, int(math.ceil(rec.average_daily_demand * 5)))

                remaining_deficit = needed_qty

                # Look for candidate donor stores
                candidate_donors = []
                for don in prod_items:
                    if don.store_id == rec.store_id:
                        continue
                    committed = donor_committed.get((don.store_id, prod_id), 0)
                    avail_surplus = don.available_donor_surplus - committed
                    if avail_surplus >= 4: # Minimum transfer threshold
                        # Calculate distance
                        c1 = stores_coords.get(rec.store_id, (47.6, -122.3))
                        c2 = stores_coords.get(don.store_id, (47.6, -122.3))
                        dist = haversine_miles(c1[0], c1[1], c2[0], c2[1])
                        candidate_donors.append((don, avail_surplus, dist))

                # Sort candidate donors by distance, then surplus volume
                candidate_donors.sort(key=lambda x: (x[2], -x[1]))

                # Allocate transfers
                for don, avail_surplus, dist in candidate_donors:
                    if remaining_deficit <= 0:
                        break

                    transfer_qty = min(remaining_deficit, avail_surplus)
                    if transfer_qty < 3 and remaining_deficit > 5:
                        continue # Skip tiny transfers if deficit is large

                    transfer_lead_time = 1 if dist <= 30 else 2
                    is_urgent_lead_time = (rec.time_to_shortage_days is not None and rec.time_to_shortage_days <= supplier_lead_time)

                    # Create unique action ID
                    action_id = f"ACT_TR_{don.store_id}_{rec.store_id}_{prod_id}"
                    override = self._action_status_override.get(action_id, {})
                    status = override.get("status", "pending")

                    urgency = "CRITICAL" if rec.stockout_risk == "CRITICAL" else ("HIGH" if rec.stockout_risk == "HIGH" else "MEDIUM")

                    # Narrative reason
                    tts_str = f"in {rec.time_to_shortage_days} days" if rec.time_to_shortage_days else "within 14 days"
                    reason = (
                        f"{rec.store_name} faces impending shortage {tts_str} (14d forecast demand: {rec.forecast_demand_14d} units vs SOH: {rec.stock_on_hand}). "
                        f"{don.store_name} has genuine surplus ({avail_surplus} units available beyond its own demand of {don.forecast_demand_14d} and safety stock of {don.safety_stock}). "
                        f"Inter-store transfer arrives in {transfer_lead_time} day ({dist} mi) vs {supplier_lead_time} days supplier lead time, avoiding new inventory holding costs."
                    )

                    evidence = ActionEvidence(
                        receiving_stock_on_hand=rec.stock_on_hand,
                        receiving_forecast_demand_14d=rec.forecast_demand_14d,
                        receiving_safety_stock=rec.safety_stock,
                        receiving_time_to_stockout_days=rec.time_to_shortage_days,
                        donor_stock_on_hand=don.stock_on_hand,
                        donor_forecast_demand_14d=don.forecast_demand_14d,
                        donor_safety_stock=don.safety_stock,
                        donor_surplus_before_transfer=avail_surplus,
                        donor_surplus_after_transfer=avail_surplus - transfer_qty,
                        donor_protection_verified=True,
                        supplier_lead_time_days=supplier_lead_time,
                        transfer_lead_time_days=transfer_lead_time,
                        distance_miles=dist
                    )

                    recommendations.append(RecommendedActionItem(
                        id=action_id,
                        action_type="transfer",
                        product_id=prod_id,
                        product_name=rec.product_name,
                        category=rec.category,
                        source_store_id=don.store_id,
                        source_store_name=don.store_name,
                        destination_store_id=rec.store_id,
                        destination_store_name=rec.store_name,
                        recommended_quantity=transfer_qty,
                        unit_cost=rec.unit_cost,
                        total_cost=round(transfer_qty * rec.unit_cost, 2),
                        urgency=urgency,
                        lead_time_days=transfer_lead_time,
                        time_to_stockout_days=rec.time_to_shortage_days,
                        reason=reason,
                        evidence=evidence,
                        status=status,
                        approved_at=override.get("approved_at"),
                        rejected_at=override.get("rejected_at"),
                        rejection_reason=override.get("rejection_reason"),
                        created_at="2026-10-13T23:30:00"
                    ))

                    # Update committed inventory to protect donor
                    donor_committed[(don.store_id, prod_id)] = donor_committed.get((don.store_id, prod_id), 0) + transfer_qty
                    remaining_deficit -= transfer_qty
                    total_procurement_savings += transfer_qty * rec.unit_cost
                    prevented_stockouts += 1

                # If deficit remains after checking all candidate donors, recommend supplier reorder
                if remaining_deficit > 0:
                    reorder_qty = max(min_order_qty, remaining_deficit)
                    action_id = f"ACT_RO_{rec.store_id}_{prod_id}"
                    override = self._action_status_override.get(action_id, {})
                    status = override.get("status", "pending")
                    urgency = "HIGH" if rec.stockout_risk in ["CRITICAL", "HIGH"] else "MEDIUM"

                    reason = (
                        f"{rec.store_name} requires replenishment of {rec.product_name}. "
                        f"Network surplus across neighboring stores was insufficient to cover the deficit ({remaining_deficit} units unfulfilled). "
                        f"Recommended purchase order of {reorder_qty} units (meeting supplier MOQ of {min_order_qty}) with {supplier_lead_time}-day lead time."
                    )

                    evidence = ActionEvidence(
                        receiving_stock_on_hand=rec.stock_on_hand,
                        receiving_forecast_demand_14d=rec.forecast_demand_14d,
                        receiving_safety_stock=rec.safety_stock,
                        receiving_time_to_stockout_days=rec.time_to_shortage_days,
                        donor_stock_on_hand=None,
                        donor_forecast_demand_14d=None,
                        donor_safety_stock=None,
                        donor_surplus_before_transfer=None,
                        donor_surplus_after_transfer=None,
                        donor_protection_verified=True,
                        supplier_lead_time_days=supplier_lead_time,
                        transfer_lead_time_days=0,
                        distance_miles=None
                    )

                    recommendations.append(RecommendedActionItem(
                        id=action_id,
                        action_type="reorder",
                        product_id=prod_id,
                        product_name=rec.product_name,
                        category=rec.category,
                        source_store_id="SUPPLIER",
                        source_store_name="Primary Supplier",
                        destination_store_id=rec.store_id,
                        destination_store_name=rec.store_name,
                        recommended_quantity=reorder_qty,
                        unit_cost=rec.unit_cost,
                        total_cost=round(reorder_qty * rec.unit_cost, 2),
                        urgency=urgency,
                        lead_time_days=supplier_lead_time,
                        time_to_stockout_days=rec.time_to_shortage_days,
                        reason=reason,
                        evidence=evidence,
                        status=status,
                        approved_at=override.get("approved_at"),
                        rejected_at=override.get("rejected_at"),
                        rejection_reason=override.get("rejection_reason"),
                        created_at="2026-10-13T23:30:00"
                    ))

        # Sort recommendations: transfers first (cheaper & faster), then by urgency
        recommendations.sort(key=lambda x: (
            0 if x.urgency == "CRITICAL" else (1 if x.urgency == "HIGH" else 2),
            0 if x.action_type == "transfer" else 1,
            -x.recommended_quantity
        ))

        total_pending = sum(1 for r in recommendations if r.status == "pending")
        total_approved = sum(1 for r in recommendations if r.status == "approved")
        total_rejected = sum(1 for r in recommendations if r.status == "rejected")
        transfers_count = sum(1 for r in recommendations if r.action_type == "transfer")
        reorders_count = sum(1 for r in recommendations if r.action_type == "reorder")

        return RebalanceRecommendationsResponse(
            recommendations=recommendations,
            total_pending=total_pending,
            total_approved=total_approved,
            total_rejected=total_rejected,
            transfers_count=transfers_count,
            reorders_count=reorders_count,
            potential_procurement_savings=round(total_procurement_savings, 2),
            prevented_stockout_events=prevented_stockouts,
            workflow_mode="Human-in-the-Loop (Mandatory Manual Approval)",
            disclaimer="Approved recommendations update the persisted application queue. Physical inventory transfers or supplier purchase orders require connecting an active WMS or ERP adapter."
        )

    def approve_action(self, action_id: str, notes: Optional[str] = None) -> Dict[str, Any]:
        """Approves a recommendation and persists status."""
        self._action_status_override[action_id] = {
            "status": "approved",
            "approved_at": datetime.now().isoformat(),
            "notes": notes
        }
        self._save_persisted_actions()
        return {
            "status": "success",
            "action_id": action_id,
            "updated_status": "approved",
            "message": "Action authorization approved and staged. Persistent record updated."
        }

    def reject_action(self, action_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
        """Rejects a recommendation and persists status."""
        self._action_status_override[action_id] = {
            "status": "rejected",
            "rejected_at": datetime.now().isoformat(),
            "rejection_reason": reason or "Declined by inventory manager"
        }
        self._save_persisted_actions()
        return {
            "status": "success",
            "action_id": action_id,
            "updated_status": "rejected",
            "message": "Action declined. Reason recorded in audit trail."
        }

    def reset_actions(self) -> Dict[str, Any]:
        """Clears persisted actions, resetting state."""
        self._action_status_override = {}
        if ACTIONS_FILE.exists():
            ACTIONS_FILE.unlink()
        return {
            "status": "success",
            "message": "Action statuses reset to pending default."
        }

inventory_service = InventoryService()
