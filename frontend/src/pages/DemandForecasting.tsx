import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  GlobalFilterState,
  SystemMeta,
  ForecastResponse,
  ForecastSummaryResponse,
  ForecastDataPoint,
} from '../types';
import { api } from '../api/client';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import {
  TrendingUp,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Layers,
  Store as StoreIcon,
  Package,
  Calendar,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface DemandForecastingProps {
  filterState: GlobalFilterState;
  meta: SystemMeta | null;
}

export const DemandForecasting: React.FC<DemandForecastingProps> = ({
  filterState,
  meta,
}) => {
  // Local store/product selection, defaulted from global filter
  const initialStore = filterState.selectedStore !== 'ALL' ? filterState.selectedStore : 'STORE_01';
  const initialProduct = filterState.selectedProduct !== 'ALL' ? filterState.selectedProduct : 'PROD_01';

  const [selectedStore, setSelectedStore] = useState<string>(initialStore);
  const [selectedProduct, setSelectedProduct] = useState<string>(initialProduct);
  const [horizonDays, setHorizonDays] = useState<7 | 14>(filterState.horizonDays);
  const [modelView, setModelView] = useState<'both' | 'ml' | 'baseline'>('both');

  // Forecast API state
  const [forecastData, setForecastData] = useState<ForecastResponse | null>(null);
  const [evaluationSummary, setEvaluationSummary] = useState<ForecastSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync if global filter changes to a specific store/product
  useEffect(() => {
    if (filterState.selectedStore !== 'ALL' && filterState.selectedStore !== selectedStore) {
      setSelectedStore(filterState.selectedStore);
    }
    if (filterState.selectedProduct !== 'ALL' && filterState.selectedProduct !== selectedProduct) {
      setSelectedProduct(filterState.selectedProduct);
    }
    if (filterState.horizonDays !== horizonDays) {
      setHorizonDays(filterState.horizonDays);
    }
  }, [filterState]);

  const fetchForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const [fRes, sRes] = await Promise.all([
        api.predictDemand({
          store_id: selectedStore,
          product_id: selectedProduct,
          horizon_days: horizonDays,
          model_type: 'ml',
        }),
        api.getEvaluationSummary({
          store_id: selectedStore,
          horizon_days: horizonDays,
        }),
      ]);
      setForecastData(fRes);
      setEvaluationSummary(sRes);
    } catch (err: any) {
      console.error('Forecast load error:', err);
      setError(err?.message || 'Failed to load forecast data from backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, [selectedStore, selectedProduct, horizonDays]);

  // Prepare chart series: combine historical + forecast points
  const combinedChartPoints = React.useMemo(() => {
    if (!forecastData) return [];

    const hist = forecastData.historical_points.map((p) => ({
      date: p.date,
      displayDate: p.date.substring(5), // MM-DD
      actual_sales: p.actual_sales,
      predicted_demand: null,
      baseline_demand: null,
      lower_bound: null,
      upper_bound: null,
      is_forecast: false,
      spike_label: p.spike_label,
    }));

    // If historical points exist, bridge the last historical point with forecast line for continuity
    const lastHist = hist[hist.length - 1];

    const fc = forecastData.forecast_points.map((p, idx) => ({
      date: p.date,
      displayDate: p.date.substring(5), // MM-DD
      actual_sales: null,
      predicted_demand: p.predicted_demand,
      baseline_demand: p.baseline_demand,
      lower_bound: p.lower_bound,
      upper_bound: p.upper_bound,
      is_forecast: true,
      spike_label: p.spike_label,
    }));

    return [...hist, ...fc];
  }, [forecastData]);

  // Compute forecast totals and bounds
  const forecastMetrics = React.useMemo(() => {
    if (!forecastData || !forecastData.forecast_points.length) {
      return { totalP50: 0, totalLower: 0, totalUpper: 0, totalBaseline: 0 };
    }
    const pts = forecastData.forecast_points;
    const totalP50 = pts.reduce((sum, p) => sum + (p.predicted_demand || 0), 0);
    const totalLower = pts.reduce((sum, p) => sum + (p.lower_bound || 0), 0);
    const totalUpper = pts.reduce((sum, p) => sum + (p.upper_bound || 0), 0);
    const totalBaseline = pts.reduce((sum, p) => sum + (p.baseline_demand || 0), 0);

    return {
      totalP50: Math.round(totalP50),
      totalLower: Math.round(totalLower),
      totalUpper: Math.round(totalUpper),
      totalBaseline: Math.round(totalBaseline),
    };
  }, [forecastData]);

  const currentStoreObj = meta?.stores.find((s) => s.store_id === selectedStore);
  const currentProductObj = meta?.products.find((p) => p.product_id === selectedProduct);

  const evaluation = forecastData?.evaluation;
  const diagnostics = forecastData?.diagnostics;
  const mlBeats = evaluation?.ml_beats_baseline ?? false;
  const mlWmapePct = evaluation ? (evaluation.ml_wmape * 100).toFixed(1) : '0.0';
  const baseWmapePct = evaluation ? (evaluation.baseline_wmape * 100).toFixed(1) : '0.0';
  const diffPct = evaluation && evaluation.baseline_wmape > 0
    ? (((evaluation.baseline_wmape - evaluation.ml_wmape) / evaluation.baseline_wmape) * 100).toFixed(1)
    : '0.0';

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload as any;
      const isFc = point.is_forecast;

      return (
        <div className="bg-slate-900/95 border border-slate-700/80 p-3.5 rounded-xl shadow-2xl backdrop-blur-md text-xs max-w-xs space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="font-semibold text-slate-200">{point.date}</span>
            <Badge variant={isFc ? 'teal' : 'neutral'} size="sm">
              {isFc ? `${horizonDays}d Out-of-Sample Forecast` : 'Historical Actual'}
            </Badge>
          </div>

          {!isFc && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <span>Actual Sold:</span>
                <span className="font-mono font-bold text-white text-sm">
                  {point.actual_sales} units
                </span>
              </div>
              {point.spike_label && point.spike_label !== 'None' && point.spike_label !== 'Baseline' && (
                <div className="mt-1 p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                  ⚡ {point.spike_label}
                </div>
              )}
            </div>
          )}

          {isFc && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-cyan-300">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span>AI ML Forecast (P50):</span>
                </span>
                <span className="font-mono font-bold text-white text-sm">
                  {point.predicted_demand} units
                </span>
              </div>

              <div className="flex items-center justify-between text-amber-300">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>ERP 7-Day MA:</span>
                </span>
                <span className="font-mono text-slate-300">
                  {point.baseline_demand} units
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-slate-800/80">
                <span>Uncertainty (P10 - P90):</span>
                <span className="font-mono text-slate-300">
                  {point.lower_bound} – {point.upper_bound} units
                </span>
              </div>

              {point.spike_label && point.spike_label !== 'Baseline' && (
                <div className="mt-1 p-1.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px]">
                  🌦️ Signal: {point.spike_label}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Scope Controls Header */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Store Selector */}
          <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5">
            <StoreIcon className="w-4 h-4 text-teal-400" />
            <span className="text-xs text-slate-400">Store:</span>
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer"
            >
              {(meta?.stores || []).map((s) => (
                <option key={s.store_id} value={s.store_id} className="bg-slate-900 text-slate-200">
                  {s.name} ({s.city})
                </option>
              ))}
            </select>
          </div>

          {/* Product Selector */}
          <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5">
            <Package className="w-4 h-4 text-teal-400" />
            <span className="text-xs text-slate-400">SKU:</span>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              {(meta?.products || []).map((p) => (
                <option key={p.product_id} value={p.product_id} className="bg-slate-900 text-slate-200">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Horizon Toggle */}
          <div className="flex items-center space-x-1 bg-slate-950/80 border border-slate-800 rounded-lg p-1 text-xs">
            <button
              onClick={() => setHorizonDays(7)}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                horizonDays === 7 ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              7 Days Ahead
            </button>
            <button
              onClick={() => setHorizonDays(14)}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                horizonDays === 14 ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              14 Days Ahead
            </button>
          </div>
        </div>

        {/* View and Status Right Side */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 bg-slate-950/80 border border-slate-800 rounded-lg p-1 text-xs">
            <button
              onClick={() => setModelView('both')}
              className={`px-2 py-0.5 rounded transition-colors text-[11px] font-medium ${
                modelView === 'both' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Overlay Both
            </button>
            <button
              onClick={() => setModelView('ml')}
              className={`px-2 py-0.5 rounded transition-colors text-[11px] font-medium ${
                modelView === 'ml' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ML Only
            </button>
            <button
              onClick={() => setModelView('baseline')}
              className={`px-2 py-0.5 rounded transition-colors text-[11px] font-medium ${
                modelView === 'baseline' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Baseline Only
            </button>
          </div>

          <button
            onClick={fetchForecast}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
            title="Refresh Forecast"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Diagnostics / Alerts if insufficient history */}
      {diagnostics && diagnostics.status !== 'OK' && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold">{diagnostics.status}: </span>
            {diagnostics.notes.join(' ')}
          </div>
        </div>
      )}

      {loading && !forecastData && (
        <LoadingState message={`Generating signal-aware forecast for ${currentProductObj?.name || selectedProduct}...`} />
      )}

      {error && !loading && (
        <ErrorState message={error} onRetry={fetchForecast} />
      )}

      {forecastData && (
        <>
          {/* Key Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={`Expected Demand (${horizonDays}d)`}
              value={`${forecastMetrics.totalP50} units`}
              badge="P50 Median"
              icon={TrendingUp}
              trend={{
                value: `${forecastMetrics.totalP50 >= forecastMetrics.totalBaseline ? '+' : ''}${Math.round(
                  forecastMetrics.totalP50 - forecastMetrics.totalBaseline
                )} vs Baseline`,
                isPositive: forecastMetrics.totalP50 >= forecastMetrics.totalBaseline,
              }}
              subtext={`Uncertainty Range: [${forecastMetrics.totalLower} – ${forecastMetrics.totalUpper}] units`}
            />

            <StatCard
              label="Out-of-Sample AI WMAPE"
              value={`${mlWmapePct}%`}
              badge={mlBeats ? 'Beats Baseline' : 'Competitive'}
              icon={Zap}
              subtext={`MAE: ${evaluation?.ml_mae ?? 0} units / day`}
            />

            <StatCard
              label="ERP 7-Day Moving Avg WMAPE"
              value={`${baseWmapePct}%`}
              badge="Traditional Rule"
              icon={Layers}
              subtext={`MAE: ${evaluation?.baseline_mae ?? 0} units / day`}
            />

            <StatCard
              label="Forecast Accuracy Advantage"
              value={mlBeats ? `+${diffPct}%` : `-${Math.abs(Number(diffPct))}%`}
              badge={mlBeats ? 'Error Reduced' : 'Baseline Parity'}
              icon={ShieldCheck}
              trend={{
                value: mlBeats ? `${diffPct}% Error Reduction` : 'Baseline Parity',
                isPositive: mlBeats,
              }}
              subtext={`Evaluated on last ${evaluation?.test_samples ?? 14} days without leakage`}
            />
          </div>

          {/* Main Forecast Visualizer Card */}
          <Card
            title={`${currentProductObj?.name || selectedProduct} — Chronological Demand Curve`}
            subtitle={`Store: ${currentStoreObj?.name || selectedStore} (${currentStoreObj?.city}) · ${horizonDays}-Day Forward Horizon`}
            badge={
              <Badge variant="teal" size="sm">
                RandomForest ML + Empirical Quantiles
              </Badge>
            }
          >
            <div className="h-96 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={combinedChartPoints} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <defs>
                    <linearGradient id="uncertaintyConeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

                  <XAxis
                    dataKey="displayDate"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}`}
                  />

                  <Tooltip content={<CustomTooltip />} />

                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: 16, fontSize: 12 }}
                  />

                  {/* Shaded Uncertainty Range Cone */}
                  {(modelView === 'both' || modelView === 'ml') && (
                    <Area
                      type="monotone"
                      dataKey="upper_bound"
                      stroke="#06b6d4"
                      strokeDasharray="2 2"
                      strokeOpacity={0.4}
                      fill="url(#uncertaintyConeGrad)"
                      name="Uncertainty Range [P10-P90]"
                      connectNulls={false}
                    />
                  )}

                  {/* Historical Sales Curve */}
                  <Line
                    type="monotone"
                    dataKey="actual_sales"
                    stroke="#818cf8"
                    strokeWidth={2.5}
                    dot={{ r: 2.5, fill: '#818cf8', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#a5b4fc' }}
                    name="Historical Sales (Actual)"
                    connectNulls={false}
                  />

                  {/* Moving Average Baseline */}
                  {(modelView === 'both' || modelView === 'baseline') && (
                    <Line
                      type="monotone"
                      dataKey="baseline_demand"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      name="ERP 7-Day Moving Avg Baseline"
                      connectNulls={false}
                    />
                  )}

                  {/* Machine Learning Forecast Line */}
                  {(modelView === 'both' || modelView === 'ml') && (
                    <Line
                      type="monotone"
                      dataKey="predicted_demand"
                      stroke="#06b6d4"
                      strokeWidth={3}
                      dot={{ r: 3.5, fill: '#06b6d4', strokeWidth: 1.5, stroke: '#083344' }}
                      activeDot={{ r: 6, fill: '#22d3ee' }}
                      name="Signal-Aware AI Forecast (P50)"
                      connectNulls={false}
                    />
                  )}

                  {/* Forecast Horizon Origin Reference Line */}
                  {forecastData.forecast_points.length > 0 && (
                    <ReferenceLine
                      x={forecastData.forecast_points[0].date.substring(5)}
                      stroke="#0ea5e9"
                      strokeDasharray="3 3"
                      label={{
                        value: 'Forecast Origin',
                        position: 'top',
                        fill: '#38bdf8',
                        fontSize: 10,
                      }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Sub-chart legend details */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
              <div className="flex items-center space-x-4">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                  <span>30-Day Solid Actuals</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <span>AI ML P50 (Signal-Adjusted)</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span>ERP 7d Moving Avg</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-3.5 h-2 rounded-sm bg-cyan-500/20 border border-cyan-500/40" />
                  <span>P10–P90 Uncertainty Cone</span>
                </span>
              </div>

              <div className="text-slate-400 text-[11px] font-mono">
                Historical: 90 days · Holdout: {evaluation?.test_samples ?? 14} days · Model: RandomForest (50 trees)
              </div>
            </div>
          </Card>

          {/* Model Diagnostics, Feature Drivers, and Methodology */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Out-of-Sample Evaluation Scorecard */}
            <Card
              title="Out-of-Sample Evaluation"
              subtitle={`Chronological Test Window: ${evaluation?.test_start_date} to ${evaluation?.test_end_date}`}
              badge={
                <Badge variant={mlBeats ? 'teal' : 'neutral'} size="sm">
                  {mlBeats ? 'ML Outperforms' : 'Baseline Parity'}
                </Badge>
              }
            >
              <div className="space-y-3 text-xs">
                {/* Benchmark Comparison Table */}
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-teal-300 font-medium">Full ML (With Weather & Signals):</span>
                    <span className="font-mono font-bold text-teal-300">{mlWmapePct}% WMAPE</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Core ML (Without Signals Ablation):</span>
                    <span className="font-mono text-slate-300">
                      {evaluation?.ml_without_signals_wmape
                        ? `${(evaluation.ml_without_signals_wmape * 100).toFixed(1)}% WMAPE`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">ERP 7-Day Moving Average:</span>
                    <span className="font-mono text-amber-300">{baseWmapePct}% WMAPE</span>
                  </div>

                  {evaluation?.signals_improvement_pct !== null && evaluation?.signals_improvement_pct !== undefined && (
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/80">
                      <span className="text-slate-300 font-medium">Signals Improvement Delta:</span>
                      <span
                        className={`font-mono font-bold ${
                          evaluation.signals_improvement_pct > 0 ? 'text-teal-400' : 'text-slate-400'
                        }`}
                      >
                        {evaluation.signals_improvement_pct > 0
                          ? `+${evaluation.signals_improvement_pct}% Accuracy Gain`
                          : `${evaluation.signals_improvement_pct}% (Lags Dominant)`}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                    <span className="text-slate-400 text-[11px]">Forecast Horizon Status:</span>
                    <span className="font-mono text-[11px] text-cyan-300">
                      {evaluation?.signals_available_at_forecast
                        ? '⚡ Live Signals Available'
                        : 'Core Lag Model Fallback'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-1.5 text-[11px]">
                  <div className="flex items-center space-x-1.5 text-slate-300 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                    <span>Evaluation Integrity & Ablation:</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    {evaluation?.signals_impact_note}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] text-slate-400">
                  <span className="text-slate-300 font-medium block mb-0.5">Uncertainty Calculation:</span>
                  {evaluation?.uncertainty_method}
                </div>
              </div>
            </Card>

            {/* External Predictive Feature Drivers */}
            <Card
              title="Predictive Signal Drivers"
              subtitle="Tree-based Gini feature importance"
              className="lg:col-span-2"
            >
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Relative impact of historical lags, weather shocks, day of week, and calendar events in the trained model:
                </p>

                <div className="space-y-2.5">
                  {(forecastData.feature_importances || []).map((feat, idx) => {
                    const pct = Math.round(feat.importance * 100);
                    const isSignal = ['rainfall', 'temperature', 'holiday_flag', 'event_flag', 'promotion_active'].includes(feat.feature);

                    return (
                      <div key={feat.feature} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center space-x-2">
                            <span className="font-mono text-slate-300 font-medium">{feat.feature}</span>
                            {isSignal && (
                              <Badge variant="teal" size="sm">
                                External Signal
                              </Badge>
                            )}
                            <span className="text-slate-500 text-[11px] hidden sm:inline">
                              — {feat.description}
                            </span>
                          </span>
                          <span className="font-mono text-slate-300 font-medium">{pct}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isSignal ? 'bg-gradient-to-r from-teal-500 to-cyan-400' : 'bg-slate-500'
                            }`}
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>

          {/* Network-Wide Model Evaluation Across Products */}
          {evaluationSummary && evaluationSummary.summary.length > 0 && (
            <Card
              title="Store SKU Evaluation Benchmark"
              subtitle={`Head-to-head out-of-sample comparison across top SKUs at ${currentStoreObj?.name || selectedStore}`}
              badge={
                <Badge variant="teal" size="sm">
                  Overall WMAPE: {(evaluationSummary.overall_ml_wmape * 100).toFixed(1)}% vs {(evaluationSummary.overall_baseline_wmape * 100).toFixed(1)}%
                </Badge>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3 font-mono">Product ID</th>
                      <th className="py-2.5 px-3 text-right">ML WMAPE</th>
                      <th className="py-2.5 px-3 text-right">Baseline WMAPE</th>
                      <th className="py-2.5 px-3 text-right">Error Delta</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {evaluationSummary.summary.map((row) => (
                      <tr
                        key={row.product_id}
                        onClick={() => setSelectedProduct(row.product_id)}
                        className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                          row.product_id === selectedProduct ? 'bg-teal-500/10' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                          {row.product_name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{row.product_id}</td>
                        <td className="py-2.5 px-3 text-right text-cyan-300 font-bold">
                          {(row.ml_wmape * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-300">
                          {(row.baseline_wmape * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={row.ml_beats_baseline ? 'text-teal-400 font-semibold' : 'text-slate-400'}
                          >
                            {row.improvement_pct > 0 ? `-${row.improvement_pct}%` : `+${Math.abs(row.improvement_pct)}%`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-sans">
                          {row.ml_beats_baseline ? (
                            <Badge variant="teal" size="sm">
                              AI Outperforms
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              Baseline Parity
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
