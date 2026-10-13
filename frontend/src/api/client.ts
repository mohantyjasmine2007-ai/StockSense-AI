import {
  HealthStatus,
  SystemMeta,
  ValidationReport,
  DataPreview,
  DataStatus,
  SignalItem,
  WeatherStatus,
  ForecastResponse,
  ForecastSummaryResponse,
  InventorySummaryResponse,
  InventoryItemStatus,
  RebalanceRecommendationsResponse,
  ActionUpdateResponse,
  DashboardSummaryResponse,
  SimulationResponse,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api';

export class ApiError extends Error {
  status: number;
  payload?: any;
  constructor(status: number, message: string, payload?: any) {
    super(message);
    this.status = status;
    this.payload = payload;
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!res.ok) {
      let errorPayload = null;
      try {
        errorPayload = await res.json();
      } catch {
        // Not JSON
      }
      throw new ApiError(
        res.status,
        errorPayload?.summary || errorPayload?.detail || `API Error (${res.status}): ${res.statusText}`,
        errorPayload
      );
    }

    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new Error(`Failed to connect to backend at ${url}. Ensure FastAPI is running on port 8000.`);
  }
}

export const api = {
  checkHealth: (): Promise<HealthStatus> => request<HealthStatus>('/health'),
  getMetadata: (): Promise<SystemMeta> => request<SystemMeta>('/meta'),

  // Data Management Endpoints
  getDataStatus: (): Promise<DataStatus> => request<DataStatus>('/data/status'),

  getDatasetPreview: (
    datasetType: string,
    params?: {
      store_id?: string;
      category?: string;
      product_id?: string;
      start_date?: string;
      end_date?: string;
      limit?: number;
    }
  ): Promise<DataPreview> => {
    const query = new URLSearchParams();
    if (params?.store_id && params.store_id !== 'ALL') query.set('store_id', params.store_id);
    if (params?.category && params.category !== 'ALL') query.set('category', params.category);
    if (params?.product_id && params.product_id !== 'ALL') query.set('product_id', params.product_id);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<DataPreview>(`/data/preview/${datasetType}${qs}`);
  },

  uploadCsv: async (datasetType: string, file: File): Promise<ValidationReport> => {
    const url = `${API_BASE}/data/upload/${datasetType}`;
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 422 && data.errors) {
        return data as ValidationReport;
      }
      throw new ApiError(res.status, data.detail || 'Upload failed', data);
    }
    return data as ValidationReport;
  },

  resetDemoData: (): Promise<{ status: string; message: string }> =>
    request<{ status: string; message: string }>('/data/reset-demo', {
      method: 'POST',
    }),

  // External Signals Endpoints
  getSignalsList: (params?: {
    store_id?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<SignalItem[]> => {
    const query = new URLSearchParams();
    if (params?.store_id && params.store_id !== 'ALL') query.set('store_id', params.store_id);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<SignalItem[]>(`/signals/list${qs}`);
  },

  getWeatherStatus: (): Promise<WeatherStatus> => request<WeatherStatus>('/signals/weather-status'),

  // Demand Forecasting Endpoints
  predictDemand: (params: {
    store_id: string;
    product_id: string;
    horizon_days?: number;
    model_type?: string;
  }): Promise<ForecastResponse> => {
    const query = new URLSearchParams({
      store_id: params.store_id,
      product_id: params.product_id,
      horizon_days: (params.horizon_days || 14).toString(),
      model_type: params.model_type || 'ml',
    });
    return request<ForecastResponse>(`/forecast/predict?${query.toString()}`);
  },

  getEvaluationSummary: (params?: {
    store_id?: string;
    horizon_days?: number;
  }): Promise<ForecastSummaryResponse> => {
    const query = new URLSearchParams();
    if (params?.store_id && params.store_id !== 'ALL') query.set('store_id', params.store_id);
    if (params?.horizon_days) query.set('horizon_days', params.horizon_days.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<ForecastSummaryResponse>(`/forecast/evaluation-summary${qs}`);
  },

  // Phase 4: Inventory & Re-balancing Endpoints
  getInventoryStatus: (forceRefresh: boolean = false): Promise<InventorySummaryResponse> => {
    const qs = forceRefresh ? '?force_refresh=true' : '';
    return request<InventorySummaryResponse>(`/inventory/status${qs}`);
  },

  getStoreInventory: (storeId: string): Promise<InventoryItemStatus[]> => {
    return request<InventoryItemStatus[]>(`/inventory/store/${storeId}`);
  },

  getRebalanceRecommendations: (params?: {
    status?: string;
    action_type?: string;
    store_id?: string;
    product_id?: string;
  }): Promise<RebalanceRecommendationsResponse> => {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    if (params?.action_type && params.action_type !== 'all') query.set('action_type', params.action_type);
    if (params?.store_id && params.store_id !== 'ALL') query.set('store_id', params.store_id);
    if (params?.product_id && params.product_id !== 'ALL') query.set('product_id', params.product_id);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<RebalanceRecommendationsResponse>(`/rebalance/recommendations${qs}`);
  },

  approveAction: (actionId: string, notes?: string): Promise<ActionUpdateResponse> => {
    return request<ActionUpdateResponse>(`/rebalance/actions/${actionId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  rejectAction: (actionId: string, reason?: string): Promise<ActionUpdateResponse> => {
    return request<ActionUpdateResponse>(`/rebalance/actions/${actionId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  resetActions: (): Promise<ActionUpdateResponse> => {
    return request<ActionUpdateResponse>('/rebalance/actions/reset', {
      method: 'POST',
    });
  },

  // Phase 5: Executive Dashboard Summary & Impact Simulator
  getDashboardSummary: (params?: {
    store_id?: string;
    category?: string;
    product_id?: string;
    horizon_days?: number;
  }): Promise<DashboardSummaryResponse> => {
    const query = new URLSearchParams();
    if (params?.store_id && params.store_id !== 'ALL') query.set('store_id', params.store_id);
    if (params?.category && params.category !== 'ALL') query.set('category', params.category);
    if (params?.product_id && params.product_id !== 'ALL') query.set('product_id', params.product_id);
    if (params?.horizon_days) query.set('horizon_days', params.horizon_days.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<DashboardSummaryResponse>(`/dashboard/summary${qs}`);
  },

  runSimulation: (params: {
    store_id?: string;
    product_id?: string;
    eval_days?: number;
    initial_stock_mode?: string;
  }): Promise<SimulationResponse> => {
    return request<SimulationResponse>('/simulator/run', {
      method: 'POST',
      body: JSON.stringify({
        store_id: params.store_id || 'ALL',
        product_id: params.product_id || 'ALL',
        eval_days: params.eval_days || 30,
        initial_stock_mode: params.initial_stock_mode || 'snapshot',
      }),
    });
  },

  getSimulationExportCsvUrl: (params: {
    store_id?: string;
    product_id?: string;
    eval_days?: number;
  }): string => {
    const query = new URLSearchParams();
    if (params.store_id) query.set('store_id', params.store_id);
    if (params.product_id) query.set('product_id', params.product_id);
    if (params.eval_days) query.set('eval_days', params.eval_days.toString());
    return `${API_BASE}/simulator/export/csv?${query.toString()}`;
  },
};

