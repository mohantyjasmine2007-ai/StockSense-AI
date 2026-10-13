export interface Store {
  store_id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  max_capacity: number;
  holding_cost_multiplier: number;
}

export interface Product {
  product_id: string;
  name: string;
  category: string;
  unit_cost: number;
  selling_price: number;
  holding_cost_per_day: number;
  lead_time_days: number;
  min_order_qty: number;
}

export interface SystemMeta {
  stores: Store[];
  categories: string[];
  products: Product[];
  date_range: {
    min: string;
    max: string;
  };
  current_dataset: string;
}

export interface HealthStatus {
  status: string;
  version: string;
  timestamp: string;
  dataset_status: string;
  stores_count: number;
  products_count: number;
  sales_records_count: number;
  external_signals_count: number;
}

export interface ValidationErrorItem {
  category: string;
  row: number;
  column: string;
  message: string;
}

export interface ValidationReport {
  is_valid: boolean;
  total_rows: number;
  error_count: number;
  summary: string;
  errors: ValidationErrorItem[];
  warnings: Array<{ category: string; message: string }>;
}

export interface DataPreview {
  dataset_type: string;
  total_count: number;
  columns: string[];
  rows: Record<string, any>[];
}

export interface DataStatus {
  status: string;
  current_dataset: string;
  stores_count: number;
  products_count: number;
  sales_records: number;
  inventory_records: number;
  signals_records: number;
  min_sales_date: string | null;
  max_sales_date: string | null;
  last_validation?: ValidationReport | null;
}

export interface SignalItem {
  date: string;
  store_id: string;
  city?: string;
  holiday_flag: boolean;
  event_flag: boolean;
  event_name?: string;
  temperature?: number | null;
  rainfall?: number | null;
  spike_label?: string;
  source?: string;
  provider_status?: string;
  retrieved_at?: string;
  is_cached?: boolean;
}

export interface WeatherStatus {
  provider: string;
  mode: string;
  is_live_enabled: boolean;
  is_fallback_active: boolean;
  api_key_configured?: boolean;
  cache_entries_count?: number;
  message: string;
  last_retrieval_timestamp?: string;
}

export type PageId = 
  | 'dashboard'
  | 'forecasting'
  | 'rebalance'
  | 'signals'
  | 'actions'
  | 'simulator'
  | 'data-settings';

export interface GlobalFilterState {
  selectedStore: string;
  selectedCategory: string;
  selectedProduct: string;
  horizonDays: 7 | 14;
}

// Forecasting Interfaces
export interface ForecastDataPoint {
  date: string;
  actual_sales?: number | null;
  predicted_demand?: number | null;
  baseline_demand?: number | null;
  lower_bound?: number | null;
  upper_bound?: number | null;
  is_forecast: boolean;
  spike_label?: string | null;
}

export interface FeatureImportanceItem {
  feature: string;
  importance: number;
  description: string;
}

export interface ModelEvaluation {
  test_start_date: string;
  test_end_date: string;
  test_samples: number;
  ml_mae: number;
  ml_wmape: number;
  ml_without_signals_mae?: number | null;
  ml_without_signals_wmape?: number | null;
  signals_improvement_pct?: number | null;
  signals_available_at_forecast?: boolean;
  baseline_mae: number;
  baseline_wmape: number;
  ml_beats_baseline: boolean;
  signals_impact_note: string;
  uncertainty_method: string;
}

export interface ForecastDiagnostics {
  history_days_available: number;
  missing_signals_imputed: boolean;
  status: string;
  notes: string[];
}

export interface ForecastResponse {
  store_id: string;
  product_id: string;
  store_name: string;
  product_name: string;
  category: string;
  horizon_days: number;
  historical_points: ForecastDataPoint[];
  forecast_points: ForecastDataPoint[];
  evaluation: ModelEvaluation;
  feature_importances: FeatureImportanceItem[];
  diagnostics: ForecastDiagnostics;
}

export interface EvaluationSummaryItem {
  store_id: string;
  product_id: string;
  product_name: string;
  ml_wmape: number;
  baseline_wmape: number;
  improvement_pct: number;
  ml_beats_baseline: boolean;
}

export interface ForecastSummaryResponse {
  summary: EvaluationSummaryItem[];
  overall_ml_wmape: number;
  overall_baseline_wmape: number;
  overall_improvement_pct: number;
}

// Phase 4 Inventory & Re-balancing Interfaces
export interface InventoryItemStatus {
  store_id: string;
  store_name: string;
  city: string;
  product_id: string;
  product_name: string;
  category: string;
  stock_on_hand: number;
  incoming_quantity: number;
  supplier_lead_time_days: number;
  unit_cost: number;
  forecast_demand_7d: number;
  forecast_demand_14d: number;
  average_daily_demand: number;
  demand_std: number;
  safety_stock: number;
  reorder_point: number;
  days_of_supply: number;
  projected_stock_14d: number[];
  time_to_shortage_days: number | null;
  stockout_risk: 'CRITICAL' | 'HIGH' | 'DEFICIT' | 'HEALTHY' | 'SURPLUS' | 'OVERSTOCK';
  net_surplus_deficit: number;
  available_donor_surplus: number;
  is_overstock: boolean;
  is_stockout_risk: boolean;
}

export interface ActionEvidence {
  receiving_stock_on_hand: number;
  receiving_forecast_demand_14d: number;
  receiving_safety_stock: number;
  receiving_time_to_stockout_days: number | null;
  donor_stock_on_hand?: number | null;
  donor_forecast_demand_14d?: number | null;
  donor_safety_stock?: number | null;
  donor_surplus_before_transfer?: number | null;
  donor_surplus_after_transfer?: number | null;
  donor_protection_verified: boolean;
  supplier_lead_time_days: number;
  transfer_lead_time_days: number;
  distance_miles?: number | null;
}

export interface RecommendedActionItem {
  id: string;
  action_type: 'transfer' | 'reorder';
  product_id: string;
  product_name: string;
  category: string;
  source_store_id: string;
  source_store_name: string;
  destination_store_id: string;
  destination_store_name: string;
  recommended_quantity: number;
  unit_cost: number;
  total_cost: number;
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  lead_time_days: number;
  time_to_stockout_days?: number | null;
  reason: string;
  evidence: ActionEvidence;
  status: 'pending' | 'approved' | 'rejected';
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  execution_note: string;
  created_at: string;
}

export interface InventorySummaryResponse {
  total_skus_monitored: number;
  total_stockout_risks: number;
  critical_shortages_count: number;
  total_surplus_units: number;
  total_deficit_units: number;
  overstock_count: number;
  total_inventory_value: number;
  excess_holding_value: number;
  items: InventoryItemStatus[];
}

export interface RebalanceRecommendationsResponse {
  recommendations: RecommendedActionItem[];
  total_pending: number;
  total_approved: number;
  total_rejected: number;
  transfers_count: number;
  reorders_count: number;
  potential_procurement_savings: number;
  prevented_stockout_events: number;
  workflow_mode: string;
  disclaimer: string;
}

export interface ActionUpdateResponse {
  status: string;
  action_id: string;
  updated_status: string;
  message: string;
}

// Phase 5 Dashboard & Simulator Types
export interface DashboardSummaryResponse {
  is_available: boolean;
  empty_state_reason?: string | null;
  total_stock_value: number;
  total_inventory_units: number;
  products_at_risk_count: number;
  stores_at_risk_count: number;
  critical_shortages_count: number;
  high_risk_count: number;
  total_positions_monitored: number;
  forecast_demand_units: number;
  horizon_days: number;
  average_daily_demand: number;
  stockout_rate_pct: number;
  fill_rate_pct: number;
  holding_cost_estimate: number;
  annualized_holding_cost: number;
  ml_wmape?: number | null;
  baseline_wmape?: number | null;
  wmape_improvement_pct?: number | null;
  ml_beats_baseline?: boolean | null;
  applied_store_id: string;
  applied_category: string;
  applied_product_id: string;
  active_dataset: string;
}

export interface PolicyMetrics {
  policy_name: string;
  policy_description: string;
  stockout_incidents: number;
  unmet_demand_units: number;
  fulfilled_demand_units: number;
  total_demand_units: number;
  fill_rate_pct: number;
  stockout_rate_pct: number;
  average_inventory: number;
  total_holding_cost: number;
  orders_placed_count: number;
  transfers_executed_count: number;
  units_transferred: number;
}

export interface ComparisonDeltas {
  stockout_incidents_diff: number;
  stockout_reduction_pct?: number | null;
  unmet_demand_diff: number;
  unmet_demand_reduction_pct?: number | null;
  fill_rate_diff_pct: number;
  average_inventory_diff: number;
  holding_cost_diff: number;
  holding_cost_change_pct?: number | null;
  net_procurement_savings: number;
  ai_outperforms: boolean;
}

export interface DailySimulationTrace {
  date: string;
  store_id: string;
  product_id: string;
  daily_demand: number;
  baseline_stock: number;
  baseline_fulfilled: number;
  baseline_unmet: number;
  baseline_stockout: boolean;
  ai_stock: number;
  ai_fulfilled: number;
  ai_unmet: number;
  ai_stockout: boolean;
  ai_transfer_in: number;
  baseline_holding_cost: number;
  ai_holding_cost: number;
}

export interface SimulationResponse {
  simulation_id: string;
  start_date: string;
  end_date: string;
  evaluation_days: number;
  store_id: string;
  product_id: string;
  stores_evaluated_count: number;
  products_evaluated_count: number;
  total_days_evaluated: number;
  baseline_policy: PolicyMetrics;
  ai_policy: PolicyMetrics;
  deltas: ComparisonDeltas;
  daily_traces: DailySimulationTrace[];
  assumptions: string[];
  disclaimer: string;
  generated_at: string;
}

