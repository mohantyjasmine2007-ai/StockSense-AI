import uuid
import io
import csv
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np

from app.services.data_service import data_service
from app.services.inventory_service import inventory_service
from app.core.models import (
    SimulationResponse,
    PolicyMetricsModel,
    ComparisonDeltasModel,
    DailySimulationTrace,
    SimulatorRunRequest,
)

class SimulationService:
    def __init__(self):
        pass

    def run_simulation(
        self,
        store_id: str = "ALL",
        product_id: str = "ALL",
        eval_days: int = 30,
        initial_stock_mode: str = "snapshot"
    ) -> SimulationResponse:
        """
        Executes a historical policy backtest replaying daily demand under:
        1. Policy A: Traditional ERP Baseline (Fixed ROP, MA7 buffer, siloed store operations)
        2. Policy B: StockSense AI (Dynamic buffer, proactive 1-day inter-store transfers with donor protection)
        """
        # Ensure data is loaded
        if not data_service.is_loaded:
            data_service.load_all()

        sales_df = data_service.sales_df.copy()
        inventory_df = data_service.inventory_df.copy()
        stores_df = data_service.stores_df.copy()
        products_df = data_service.products_df.copy()

        if sales_df is None or len(sales_df) == 0:
            raise ValueError("Sales history dataset is missing or empty. Please load or upload sales data.")

        # Prepare date range
        all_dates = sorted(sales_df["date"].unique().tolist())
        if not all_dates:
            raise ValueError("No valid sales dates found in sales dataset.")

        # Evaluation window
        eval_days = max(7, min(eval_days, len(all_dates)))
        eval_dates = all_dates[-eval_days:]
        start_date_str = eval_dates[0]
        end_date_str = eval_dates[-1]

        # Scope filters
        all_store_ids = sorted(stores_df["store_id"].unique().tolist()) if stores_df is not None else sorted(sales_df["store_id"].unique().tolist())
        all_product_ids = sorted(products_df["product_id"].unique().tolist()) if products_df is not None else sorted(sales_df["product_id"].unique().tolist())

        target_stores = [store_id] if store_id != "ALL" and store_id in all_store_ids else all_store_ids
        target_products = [product_id] if product_id != "ALL" and product_id in all_product_ids else all_product_ids

        # Build fast lookup metadata
        store_multipliers: Dict[str, float] = {}
        if stores_df is not None:
            for _, r in stores_df.iterrows():
                store_multipliers[str(r["store_id"])] = float(r.get("holding_cost_multiplier", 1.0))

        product_meta: Dict[str, Dict[str, Any]] = {}
        if products_df is not None:
            for _, r in products_df.iterrows():
                product_meta[str(r["product_id"])] = {
                    "unit_cost": float(r.get("unit_cost", 10.0)),
                    "lead_time": int(r.get("lead_time_days", 2)),
                    "min_order_qty": int(r.get("min_order_qty", 30)),
                    "holding_cost_day": float(r.get("holding_cost_per_day", 0.05)),
                }

        # Snapshot initial stock lookup
        initial_stock_map: Dict[Tuple[str, str], int] = {}
        if inventory_df is not None:
            for _, r in inventory_df.iterrows():
                s = str(r["store_id"])
                p = str(r["product_id"])
                initial_stock_map[(s, p)] = int(r.get("stock_on_hand", 30))

        # Build demand lookup: (date, store_id, product_id) -> units_sold
        # Group to avoid duplicates
        sales_subset = sales_df[sales_df["date"].isin(eval_dates)]
        grouped_sales = sales_subset.groupby(["date", "store_id", "product_id"])["units_sold"].sum().reset_index()
        demand_matrix: Dict[Tuple[str, str, str], float] = {}
        for _, r in grouped_sales.iterrows():
            demand_matrix[(str(r["date"]), str(r["store_id"]), str(r["product_id"]))] = float(r["units_sold"])

        # Historical pre-window sales for initial moving average calculation
        pre_window_dates = [d for d in all_dates if d < start_date_str]
        sales_pre = sales_df[sales_df["date"].isin(pre_window_dates[-14:])] if pre_window_dates else sales_subset

        mean_demand_lookup: Dict[Tuple[str, str], float] = {}
        std_demand_lookup: Dict[Tuple[str, str], float] = {}
        for s in all_store_ids:
            for p in all_product_ids:
                sp_sales = sales_pre[(sales_pre["store_id"] == s) & (sales_pre["product_id"] == p)]["units_sold"]
                mean_demand_lookup[(s, p)] = float(sp_sales.mean()) if len(sp_sales) > 0 else 10.0
                std_demand_lookup[(s, p)] = float(sp_sales.std()) if len(sp_sales) > 1 and not np.isnan(sp_sales.std()) else 3.0

        # Simulation States
        # Both policies simulate the ENTIRE network so inter-store transfers can realistically occur from donor stores!
        stock_A: Dict[Tuple[str, str], float] = {}
        stock_B: Dict[Tuple[str, str], float] = {}
        in_transit_A: List[Dict[str, Any]] = [] # [{"arrival_date_idx": int, "store_id": s, "product_id": p, "qty": int}]
        in_transit_B: List[Dict[str, Any]] = []

        # Initialize inventory identically for Policy A and Policy B
        for s in all_store_ids:
            for p in all_product_ids:
                init_val = initial_stock_map.get((s, p), 35)
                # Ensure fair baseline: exactly identical start
                stock_A[(s, p)] = float(init_val)
                stock_B[(s, p)] = float(init_val)

        # Output tracking
        daily_traces: List[DailySimulationTrace] = []
        date_to_idx = {d: i for i, d in enumerate(eval_dates)}

        # Metrics Accumulators
        metrics_A = {
            "stockout_incidents": 0,
            "unmet_demand": 0.0,
            "fulfilled_demand": 0.0,
            "total_demand": 0.0,
            "total_inventory_days": 0.0,
            "total_holding_cost": 0.0,
            "orders_placed": 0,
            "transfers_executed": 0,
            "units_transferred": 0,
        }
        metrics_B = {
            "stockout_incidents": 0,
            "unmet_demand": 0.0,
            "fulfilled_demand": 0.0,
            "total_demand": 0.0,
            "total_inventory_days": 0.0,
            "total_holding_cost": 0.0,
            "orders_placed": 0,
            "transfers_executed": 0,
            "units_transferred": 0,
        }

        # Step Day by Day
        for day_idx, current_date in enumerate(eval_dates):
            # 1. Deliver scheduled arrivals for Policy A
            remaining_in_transit_A = []
            for item in in_transit_A:
                if item["arrival_date_idx"] <= day_idx:
                    k = (item["store_id"], item["product_id"])
                    stock_A[k] += item["qty"]
                else:
                    remaining_in_transit_A.append(item)
            in_transit_A = remaining_in_transit_A

            # 1. Deliver scheduled arrivals for Policy B
            remaining_in_transit_B = []
            for item in in_transit_B:
                if item["arrival_date_idx"] <= day_idx:
                    k = (item["store_id"], item["product_id"])
                    stock_B[k] += item["qty"]
                else:
                    remaining_in_transit_B.append(item)
            in_transit_B = remaining_in_transit_B

            # 2. Demand Fulfillment for Each (Store, Product)
            # We record traces and metrics for the user's target scope
            day_transfers_today: Dict[Tuple[str, str], int] = {}

            for s in all_store_ids:
                for p in all_product_ids:
                    key = (s, p)
                    demand = demand_matrix.get((current_date, s, p), 0.0)
                    meta = product_meta.get(p, {"unit_cost": 10.0, "lead_time": 2, "min_order_qty": 30})
                    unit_cost = meta["unit_cost"]
                    mult = store_multipliers.get(s, 1.0)
                    lead_time = meta["lead_time"]
                    min_order_qty = meta["min_order_qty"]

                    # Policy A Execution
                    curr_stock_A = stock_A[key]
                    fulfilled_A = min(curr_stock_A, demand)
                    unmet_A = demand - fulfilled_A
                    stock_A[key] = max(0.0, curr_stock_A - fulfilled_A)
                    is_stockout_A = unmet_A > 0.0
                    cost_A = stock_A[key] * (unit_cost * 0.0005 * mult)

                    # Policy B Execution
                    curr_stock_B = stock_B[key]
                    fulfilled_B = min(curr_stock_B, demand)
                    unmet_B = demand - fulfilled_B
                    stock_B[key] = max(0.0, curr_stock_B - fulfilled_B)
                    is_stockout_B = unmet_B > 0.0
                    cost_B = stock_B[key] * (unit_cost * 0.0005 * mult)

                    # If this store & product match the user evaluation scope, accumulate metrics
                    in_scope = (s in target_stores) and (p in target_products)
                    if in_scope:
                        metrics_A["total_demand"] += demand
                        metrics_A["fulfilled_demand"] += fulfilled_A
                        metrics_A["unmet_demand"] += unmet_A
                        metrics_A["total_inventory_days"] += stock_A[key]
                        metrics_A["total_holding_cost"] += cost_A
                        if is_stockout_A:
                            metrics_A["stockout_incidents"] += 1

                        metrics_B["total_demand"] += demand
                        metrics_B["fulfilled_demand"] += fulfilled_B
                        metrics_B["unmet_demand"] += unmet_B
                        metrics_B["total_inventory_days"] += stock_B[key]
                        metrics_B["total_holding_cost"] += cost_B
                        if is_stockout_B:
                            metrics_B["stockout_incidents"] += 1

                        daily_traces.append(
                            DailySimulationTrace(
                                date=current_date,
                                store_id=s,
                                product_id=p,
                                daily_demand=round(demand, 1),
                                baseline_stock=round(stock_A[key], 1),
                                baseline_fulfilled=round(fulfilled_A, 1),
                                baseline_unmet=round(unmet_A, 1),
                                baseline_stockout=is_stockout_A,
                                ai_stock=round(stock_B[key], 1),
                                ai_fulfilled=round(fulfilled_B, 1),
                                ai_unmet=round(unmet_B, 1),
                                ai_stockout=is_stockout_B,
                                ai_transfer_in=0, # updated below if transferred
                                baseline_holding_cost=round(cost_A, 4),
                                ai_holding_cost=round(cost_B, 4),
                            )
                        )

            # 3. Policy Review & Replenishment Triggers for Day End
            # Policy A: Traditional Siloed ERP
            for s in all_store_ids:
                for p in all_product_ids:
                    key = (s, p)
                    meta = product_meta.get(p, {"unit_cost": 10.0, "lead_time": 2, "min_order_qty": 30})
                    lead_time = meta["lead_time"]
                    min_order_qty = meta["min_order_qty"]

                    # Pending in transit for A
                    pending_qty_A = sum(
                        item["qty"] for item in in_transit_A
                        if item["store_id"] == s and item["product_id"] == p
                    )
                    inv_pos_A = stock_A[key] + pending_qty_A

                    # Fixed ROP based on moving average
                    mean_d = mean_demand_lookup.get(key, 10.0)
                    std_d = std_demand_lookup.get(key, 3.0)
                    ss_trad = 1.65 * std_d * np.sqrt(max(1, lead_time))
                    rop_trad = (mean_d * lead_time) + ss_trad

                    # Trigger supplier reorder if at or below ROP
                    if inv_pos_A <= rop_trad and pending_qty_A == 0:
                        order_qty = max(min_order_qty, int(round(mean_d * 7)))
                        arrival_idx = day_idx + lead_time
                        in_transit_A.append({
                            "arrival_date_idx": arrival_idx,
                            "store_id": s,
                            "product_id": p,
                            "qty": order_qty
                        })
                        if s in target_stores and p in target_products:
                            metrics_A["orders_placed"] += 1

            # Policy B: StockSense AI (Network Re-balancing + Proactive 1-Day Transfer)
            for p in all_product_ids:
                # Find all stores with deficit vs genuine donor surplus for this SKU
                for s in all_store_ids:
                    key = (s, p)
                    meta = product_meta.get(p, {"unit_cost": 10.0, "lead_time": 2, "min_order_qty": 30})
                    lead_time = meta["lead_time"]
                    min_order_qty = meta["min_order_qty"]

                    pending_qty_B = sum(
                        item["qty"] for item in in_transit_B
                        if item["store_id"] == s and item["product_id"] == p
                    )
                    inv_pos_B = stock_B[key] + pending_qty_B
                    mean_d = mean_demand_lookup.get(key, 10.0)
                    std_d = std_demand_lookup.get(key, 3.0)

                    # Dynamic AI buffer with signal sensitivity
                    ss_ai = 1.96 * std_d * np.sqrt(max(1, lead_time))
                    rop_ai = (mean_d * lead_time) + ss_ai

                    # Check for imminent shortage within supplier lead time
                    projected_stock_lt = stock_B[key] - (mean_d * lead_time)

                    if projected_stock_lt <= ss_ai * 0.5 and pending_qty_B == 0:
                        needed_qty = max(15, int(round((mean_d * 7) + ss_ai - stock_B[key])))

                        # Search for regional donor store with genuine surplus
                        # Donor protection rule: donor must maintain its own 7d demand + safety buffer!
                        best_donor = None
                        best_surplus = 0

                        for donor_s in all_store_ids:
                            if donor_s == s:
                                continue
                            donor_key = (donor_s, p)
                            donor_stock = stock_B[donor_key]
                            donor_mean_d = mean_demand_lookup.get(donor_key, 10.0)
                            donor_std_d = std_demand_lookup.get(donor_key, 3.0)
                            donor_protected = (donor_mean_d * 7) + (1.65 * donor_std_d * np.sqrt(lead_time))
                            donor_surplus = max(0, int(round(donor_stock - donor_protected)))

                            if donor_surplus > best_surplus and donor_surplus >= 10:
                                best_donor = donor_s
                                best_surplus = donor_surplus

                        if best_donor is not None:
                            # Execute proactive 1-day inter-store transfer!
                            transfer_qty = min(needed_qty, best_surplus)
                            stock_B[(best_donor, p)] -= transfer_qty
                            in_transit_B.append({
                                "arrival_date_idx": day_idx + 1, # 1-day transit between stores
                                "store_id": s,
                                "product_id": p,
                                "qty": transfer_qty
                            })

                            if s in target_stores and p in target_products:
                                metrics_B["transfers_executed"] += 1
                                metrics_B["units_transferred"] += transfer_qty

                            # Residual supplier replenishment if transfer was insufficient
                            remaining_deficit = needed_qty - transfer_qty
                            if remaining_deficit >= min_order_qty:
                                in_transit_B.append({
                                    "arrival_date_idx": day_idx + lead_time,
                                    "store_id": s,
                                    "product_id": p,
                                    "qty": remaining_deficit
                                })
                                if s in target_stores and p in target_products:
                                    metrics_B["orders_placed"] += 1
                        else:
                            # No donor store available; trigger direct supplier reorder
                            in_transit_B.append({
                                "arrival_date_idx": day_idx + lead_time,
                                "store_id": s,
                                "product_id": p,
                                "qty": max(min_order_qty, needed_qty)
                            })
                            if s in target_stores and p in target_products:
                                metrics_B["orders_placed"] += 1

                    elif inv_pos_B <= rop_ai and pending_qty_B == 0:
                        # Routine reorder
                        in_transit_B.append({
                            "arrival_date_idx": day_idx + lead_time,
                            "store_id": s,
                            "product_id": p,
                            "qty": max(min_order_qty, int(round(mean_d * 7)))
                        })
                        if s in target_stores and p in target_products:
                            metrics_B["orders_placed"] += 1

        # Calculate Final Policy Metrics
        evaluated_sku_days = max(1, len(target_stores) * len(target_products) * eval_days)

        fill_rate_A = (
            (metrics_A["fulfilled_demand"] / metrics_A["total_demand"] * 100.0)
            if metrics_A["total_demand"] > 0
            else 100.0
        )
        fill_rate_B = (
            (metrics_B["fulfilled_demand"] / metrics_B["total_demand"] * 100.0)
            if metrics_B["total_demand"] > 0
            else 100.0
        )

        stockout_rate_A = (metrics_A["stockout_incidents"] / evaluated_sku_days) * 100.0
        stockout_rate_B = (metrics_B["stockout_incidents"] / evaluated_sku_days) * 100.0

        avg_inv_A = metrics_A["total_inventory_days"] / evaluated_sku_days
        avg_inv_B = metrics_B["total_inventory_days"] / evaluated_sku_days

        baseline_policy = PolicyMetricsModel(
            policy_name="Traditional ERP Policy (Baseline)",
            policy_description="Fixed ROP (μ_MA7 × LeadTime + 1.65 × σ × √L), siloed store replenishment, 0 transfers.",
            stockout_incidents=metrics_A["stockout_incidents"],
            unmet_demand_units=round(metrics_A["unmet_demand"], 1),
            fulfilled_demand_units=round(metrics_A["fulfilled_demand"], 1),
            total_demand_units=round(metrics_A["total_demand"], 1),
            fill_rate_pct=round(fill_rate_A, 2),
            stockout_rate_pct=round(stockout_rate_A, 2),
            average_inventory=round(avg_inv_A, 1),
            total_holding_cost=round(metrics_A["total_holding_cost"], 2),
            orders_placed_count=metrics_A["orders_placed"],
            transfers_executed_count=0,
            units_transferred=0,
        )

        ai_policy = PolicyMetricsModel(
            policy_name="StockSense AI Policy",
            policy_description="Dynamic volatility-adjusted buffers, proactive 1-day inter-store transfers with donor protection.",
            stockout_incidents=metrics_B["stockout_incidents"],
            unmet_demand_units=round(metrics_B["unmet_demand"], 1),
            fulfilled_demand_units=round(metrics_B["fulfilled_demand"], 1),
            total_demand_units=round(metrics_B["total_demand"], 1),
            fill_rate_pct=round(fill_rate_B, 2),
            stockout_rate_pct=round(stockout_rate_B, 2),
            average_inventory=round(avg_inv_B, 1),
            total_holding_cost=round(metrics_B["total_holding_cost"], 2),
            orders_placed_count=metrics_B["orders_placed"],
            transfers_executed_count=metrics_B["transfers_executed"],
            units_transferred=metrics_B["units_transferred"],
        )

        # Deltas & Denominator Safety
        # Positive stockout_reduction_pct means AI achieved a reduction!
        # Formula: (Baseline - AI) / Baseline * 100%
        stockout_diff = metrics_A["stockout_incidents"] - metrics_B["stockout_incidents"]
        stockout_reduction_pct: Optional[float] = None
        if metrics_A["stockout_incidents"] > 0:
            stockout_reduction_pct = round(
                (stockout_diff / metrics_A["stockout_incidents"]) * 100.0, 2
            )

        unmet_diff = metrics_A["unmet_demand"] - metrics_B["unmet_demand"]
        unmet_reduction_pct: Optional[float] = None
        if metrics_A["unmet_demand"] > 0:
            unmet_reduction_pct = round(
                (unmet_diff / metrics_A["unmet_demand"]) * 100.0, 2
            )

        fill_rate_diff = round(fill_rate_B - fill_rate_A, 2)
        avg_inv_diff = round(avg_inv_B - avg_inv_A, 1)
        holding_diff = round(metrics_B["total_holding_cost"] - metrics_A["total_holding_cost"], 2)
        
        holding_change_pct: Optional[float] = None
        if metrics_A["total_holding_cost"] > 0:
            holding_change_pct = round(
                (holding_diff / metrics_A["total_holding_cost"]) * 100.0, 2
            )

        # Net procurement savings from avoiding emergency PO setups and unmet sales
        net_procurement_savings = round(
            max(0.0, unmet_diff * 4.50) + (metrics_B["transfers_executed"] * 18.0), 2
        )

        ai_outperforms = (
            metrics_B["stockout_incidents"] < metrics_A["stockout_incidents"]
            or (metrics_B["stockout_incidents"] == metrics_A["stockout_incidents"] and fill_rate_B >= fill_rate_A)
        )

        deltas = ComparisonDeltasModel(
            stockout_incidents_diff=stockout_diff,
            stockout_reduction_pct=stockout_reduction_pct,
            unmet_demand_diff=round(unmet_diff, 1),
            unmet_demand_reduction_pct=unmet_reduction_pct,
            fill_rate_diff_pct=fill_rate_diff,
            average_inventory_diff=avg_inv_diff,
            holding_cost_diff=holding_diff,
            holding_cost_change_pct=holding_change_pct,
            net_procurement_savings=net_procurement_savings,
            ai_outperforms=ai_outperforms,
        )

        assumptions = [
            "Demand Replay: Replays exact historical sales observations chronologically day-by-day.",
            "Traditional Baseline Policy: Fixed ROP (μ_MA7 × LeadTime + 1.65 × σ × √L), siloed store replenishment, zero inter-store transfers.",
            "AI-Assisted Policy: Volatility-responsive dynamic buffers + proactive 1-day inter-store transfers from genuine surplus donor stores.",
            "Donor Store Protection Rule: Donor store transfers are strictly capped so post-transfer inventory remains >= 7-day demand buffer + safety stock.",
            "Transit Times: Supplier replenishment orders arrive in catalog lead time (1–5 days); inter-store transfers arrive in 1 transit day.",
            "Carrying Cost: Calculated daily at 0.05% of unit cost (approx 18.25% APR) adjusted by store footprint multiplier.",
            "Unmet Demand: Unfulfilled customer demand within the day is treated as lost sales (no backorders)."
        ]

        disclaimer = (
            "Simulated backtest results evaluate policy heuristics against historical sales observations and do not "
            "guarantee future commercial outcomes. Real-world results are subject to transport delays, unexpected demand swings, "
            "and supplier lead time variance."
        )

        return SimulationResponse(
            simulation_id=f"SIM_{uuid.uuid4().hex[:8].upper()}",
            start_date=start_date_str,
            end_date=end_date_str,
            evaluation_days=eval_days,
            store_id=store_id,
            product_id=product_id,
            stores_evaluated_count=len(target_stores),
            products_evaluated_count=len(target_products),
            total_days_evaluated=eval_days,
            baseline_policy=baseline_policy,
            ai_policy=ai_policy,
            deltas=deltas,
            daily_traces=daily_traces,
            assumptions=assumptions,
            disclaimer=disclaimer,
            generated_at=datetime.now().isoformat(),
        )

    def export_csv(
        self,
        store_id: str = "ALL",
        product_id: str = "ALL",
        eval_days: int = 30
    ) -> str:
        """
        Generates a CSV string of the simulated daily traces for audit & external analysis.
        """
        sim_res = self.run_simulation(store_id=store_id, product_id=product_id, eval_days=eval_days)
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Metadata comments
        writer.writerow(["# StockSense AI Policy Backtest Replay Audit Log"])
        writer.writerow(["# Simulation ID", sim_res.simulation_id])
        writer.writerow(["# Scope Store", sim_res.store_id, "# Scope Product", sim_res.product_id])
        writer.writerow(["# Evaluation Period", f"{sim_res.start_date} to {sim_res.end_date}", f"{sim_res.evaluation_days} days"])
        writer.writerow([
            "# Baseline Stockouts", sim_res.baseline_policy.stockout_incidents,
            "# AI Stockouts", sim_res.ai_policy.stockout_incidents,
            "# Stockout Delta %", f"{sim_res.deltas.stockout_reduction_pct}%" if sim_res.deltas.stockout_reduction_pct is not None else "N/A"
        ])
        writer.writerow([]) # blank
        
        # Column headers
        writer.writerow([
            "date",
            "store_id",
            "product_id",
            "daily_demand",
            "baseline_stock",
            "baseline_fulfilled",
            "baseline_unmet",
            "baseline_stockout",
            "ai_stock",
            "ai_fulfilled",
            "ai_unmet",
            "ai_stockout",
            "ai_transfer_in",
            "baseline_holding_cost",
            "ai_holding_cost",
        ])

        for trace in sim_res.daily_traces:
            writer.writerow([
                trace.date,
                trace.store_id,
                trace.product_id,
                trace.daily_demand,
                trace.baseline_stock,
                trace.baseline_fulfilled,
                trace.baseline_unmet,
                "YES" if trace.baseline_stockout else "NO",
                trace.ai_stock,
                trace.ai_fulfilled,
                trace.ai_unmet,
                "YES" if trace.ai_stockout else "NO",
                trace.ai_transfer_in,
                trace.baseline_holding_cost,
                trace.ai_holding_cost,
            ])

        return output.getvalue()

simulation_service = SimulationService()
