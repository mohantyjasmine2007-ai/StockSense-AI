from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    timestamp: str
    dataset_status: str
    stores_count: int = 0
    products_count: int = 0
    sales_records_count: int = 0
    external_signals_count: int = 0

class StoreModel(BaseModel):
    store_id: str
    name: str
    city: str
    latitude: float
    longitude: float
    max_capacity: int
    holding_cost_multiplier: float = 1.0

class ProductModel(BaseModel):
    product_id: str
    name: str
    category: str
    unit_cost: float
    selling_price: float
    holding_cost_per_day: float
    lead_time_days: int
    min_order_qty: int

class SystemMetaResponse(BaseModel):
    stores: List[StoreModel]
    categories: List[str]
    products: List[ProductModel]
    date_range: Dict[str, str]
    current_dataset: str

class ValidationErrorItem(BaseModel):
    category: str
    row: int
    column: str
    message: str

class ValidationReportResponse(BaseModel):
    is_valid: bool
    total_rows: int
    error_count: int
    summary: str
    errors: List[ValidationErrorItem] = []
    warnings: List[Dict[str, Any]] = []

class DataPreviewResponse(BaseModel):
    dataset_type: str
    total_count: int
    columns: List[str]
    rows: List[Dict[str, Any]]

class DataStatusResponse(BaseModel):
    status: str
    current_dataset: str
    stores_count: int
    products_count: int
    sales_records: int
    inventory_records: int
    signals_records: int
    min_sales_date: Optional[str]
    max_sales_date: Optional[str]
    last_validation: Optional[Dict[str, Any]] = None

class SignalItem(BaseModel):
    date: str
    store_id: str
    holiday_flag: bool
    event_flag: bool
    event_name: Optional[str] = "None"
    temperature: Optional[float] = None
    rainfall: Optional[float] = None
    spike_label: Optional[str] = "Baseline"

class WeatherStatusResponse(BaseModel):
    provider: str
    mode: str
    is_live_enabled: bool
    is_fallback_active: bool
    message: str

# Forecasting Models
class ForecastDataPoint(BaseModel):
    date: str
    actual_sales: Optional[float] = None
    predicted_demand: Optional[float] = None
    baseline_demand: Optional[float] = None
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    is_forecast: bool
    spike_label: Optional[str] = None

class FeatureImportanceItem(BaseModel):
    feature: str
    importance: float
    description: str

class ModelEvaluationModel(BaseModel):
    test_start_date: str
    test_end_date: str
    test_samples: int
    ml_mae: float
    ml_wmape: float
    baseline_mae: float
    baseline_wmape: float
    ml_beats_baseline: bool
    signals_impact_note: str
    uncertainty_method: str

class ForecastPredictRequest(BaseModel):
    store_id: str
    product_id: str
    horizon_days: int = 14
    model_type: str = "ml"

class ForecastPredictResponse(BaseModel):
    store_id: str
    product_id: str
    store_name: str
    product_name: str
    category: str
    horizon_days: int
    historical_points: List[ForecastDataPoint]
    forecast_points: List[ForecastDataPoint]
    evaluation: ModelEvaluationModel
    feature_importances: List[FeatureImportanceItem]
    diagnostics: Dict[str, Any]

class EvaluationSummaryItem(BaseModel):
    store_id: str
    product_id: str
    product_name: str
    ml_wmape: float
    baseline_wmape: float
    improvement_pct: float
    ml_beats_baseline: bool

class ForecastSummaryResponse(BaseModel):
    summary: List[EvaluationSummaryItem]
    overall_ml_wmape: float
    overall_baseline_wmape: float
    overall_improvement_pct: float

# Phase 4 Inventory & Re-balancing Models
class InventoryItemStatus(BaseModel):
    store_id: str
    store_name: str
    city: str
    product_id: str
    product_name: str
    category: str
    stock_on_hand: int
    incoming_quantity: int
    supplier_lead_time_days: int
    unit_cost: float
    forecast_demand_7d: float
    forecast_demand_14d: float
    average_daily_demand: float
    demand_std: float
    safety_stock: int
    reorder_point: int
    days_of_supply: float
    projected_stock_14d: List[float]
    time_to_shortage_days: Optional[int] = None
    stockout_risk: str # CRITICAL, HIGH, DEFICIT, HEALTHY, SURPLUS, OVERSTOCK
    net_surplus_deficit: float
    available_donor_surplus: int
    is_overstock: bool
    is_stockout_risk: bool

class ActionEvidence(BaseModel):
    receiving_stock_on_hand: int
    receiving_forecast_demand_14d: float
    receiving_safety_stock: int
    receiving_time_to_stockout_days: Optional[int] = None
    donor_stock_on_hand: Optional[int] = None
    donor_forecast_demand_14d: Optional[float] = None
    donor_safety_stock: Optional[int] = None
    donor_surplus_before_transfer: Optional[int] = None
    donor_surplus_after_transfer: Optional[int] = None
    donor_protection_verified: bool = True
    supplier_lead_time_days: int
    transfer_lead_time_days: int
    distance_miles: Optional[float] = None

class RecommendedActionItem(BaseModel):
    id: str
    action_type: str # 'transfer' or 'reorder'
    product_id: str
    product_name: str
    category: str
    source_store_id: str
    source_store_name: str
    destination_store_id: str
    destination_store_name: str
    recommended_quantity: int
    unit_cost: float
    total_cost: float
    urgency: str # 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
    lead_time_days: int
    time_to_stockout_days: Optional[int] = None
    reason: str
    evidence: ActionEvidence
    status: str # 'pending', 'approved', 'rejected'
    approved_at: Optional[str] = None
    rejected_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    execution_note: str = "Human authorization staged. Execution integration pending physical WMS connection."
    created_at: str

class InventorySummaryResponse(BaseModel):
    total_skus_monitored: int
    total_stockout_risks: int
    critical_shortages_count: int
    total_surplus_units: int
    total_deficit_units: int
    overstock_count: int
    total_inventory_value: float
    excess_holding_value: float
    items: List[InventoryItemStatus]

class RebalanceRecommendationsResponse(BaseModel):
    recommendations: List[RecommendedActionItem]
    total_pending: int
    total_approved: int
    total_rejected: int
    transfers_count: int
    reorders_count: int
    potential_procurement_savings: float
    prevented_stockout_events: int
    workflow_mode: str = "Human-in-the-Loop (Mandatory Manual Approval)"
    disclaimer: str = "Approved actions stage inventory authorizations. Physical execution requires WMS/ERP adapter."

class ActionApprovalRequest(BaseModel):
    notes: Optional[str] = None

class ActionRejectionRequest(BaseModel):
    reason: Optional[str] = "Declined by inventory manager"

class ActionUpdateResponse(BaseModel):
    status: str
    action_id: str
    updated_status: str
    message: str

# Phase 5 Dashboard & Simulator Models
class DashboardSummaryResponse(BaseModel):
    is_available: bool = True
    empty_state_reason: Optional[str] = None
    total_stock_value: float = 0.0
    total_inventory_units: int = 0
    products_at_risk_count: int = 0
    stores_at_risk_count: int = 0
    critical_shortages_count: int = 0
    high_risk_count: int = 0
    total_positions_monitored: int = 0
    forecast_demand_units: float = 0.0
    horizon_days: int = 7
    average_daily_demand: float = 0.0
    stockout_rate_pct: float = 0.0
    fill_rate_pct: float = 100.0
    holding_cost_estimate: float = 0.0
    annualized_holding_cost: float = 0.0
    ml_wmape: Optional[float] = None
    baseline_wmape: Optional[float] = None
    wmape_improvement_pct: Optional[float] = None
    ml_beats_baseline: Optional[bool] = None
    applied_store_id: str = "ALL"
    applied_category: str = "ALL"
    applied_product_id: str = "ALL"
    active_dataset: str = "calibrated_benchmark"

class SimulatorRunRequest(BaseModel):
    store_id: str = "ALL"
    product_id: str = "ALL"
    eval_days: int = 30
    initial_stock_mode: str = "snapshot"

class PolicyMetricsModel(BaseModel):
    policy_name: str
    policy_description: str
    stockout_incidents: int
    unmet_demand_units: float
    fulfilled_demand_units: float
    total_demand_units: float
    fill_rate_pct: float
    stockout_rate_pct: float
    average_inventory: float
    total_holding_cost: float
    orders_placed_count: int
    transfers_executed_count: int = 0
    units_transferred: int = 0

class ComparisonDeltasModel(BaseModel):
    stockout_incidents_diff: int
    stockout_reduction_pct: Optional[float] = None
    unmet_demand_diff: float
    unmet_demand_reduction_pct: Optional[float] = None
    fill_rate_diff_pct: float
    average_inventory_diff: float
    holding_cost_diff: float
    holding_cost_change_pct: Optional[float] = None
    net_procurement_savings: float = 0.0
    ai_outperforms: bool = True

class DailySimulationTrace(BaseModel):
    date: str
    store_id: str
    product_id: str
    daily_demand: float
    baseline_stock: float
    baseline_fulfilled: float
    baseline_unmet: float
    baseline_stockout: bool
    ai_stock: float
    ai_fulfilled: float
    ai_unmet: float
    ai_stockout: bool
    ai_transfer_in: int
    baseline_holding_cost: float
    ai_holding_cost: float

class SimulationResponse(BaseModel):
    simulation_id: str
    start_date: str
    end_date: str
    evaluation_days: int
    store_id: str
    product_id: str
    stores_evaluated_count: int
    products_evaluated_count: int
    total_days_evaluated: int
    baseline_policy: PolicyMetricsModel
    ai_policy: PolicyMetricsModel
    deltas: ComparisonDeltasModel
    daily_traces: List[DailySimulationTrace]
    assumptions: List[str]
    disclaimer: str
    generated_at: str

