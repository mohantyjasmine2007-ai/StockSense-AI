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
  holiday_flag: boolean;
  event_flag: boolean;
  event_name?: string;
  temperature?: number | null;
  rainfall?: number | null;
  spike_label?: string;
}

export interface WeatherStatus {
  provider: string;
  mode: string;
  is_live_enabled: boolean;
  is_fallback_active: boolean;
  message: string;
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
