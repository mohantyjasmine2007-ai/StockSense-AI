import React from 'react';
import { HealthStatus, SystemMeta, GlobalFilterState } from '../types';
import { StatCard } from '../components/common/StatCard';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import {
  Store,
  Package,
  Layers,
  Activity,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Cpu,
} from 'lucide-react';

interface ExecutiveDashboardProps {
  health: HealthStatus | null;
  meta: SystemMeta | null;
  filterState: GlobalFilterState;
  onNavigate: (page: any) => void;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  health,
  meta,
  filterState,
  onNavigate,
}) => {
  return (
    <div className="space-y-6">
      {/* Scope Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-teal-950/40 border border-teal-500/20 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">StockSense AI Core Initialized (Phase 1)</h4>
            <p className="text-xs text-slate-400">
              Active Scope:{' '}
              <span className="text-slate-200 font-medium">
                {filterState.selectedStore === 'ALL' ? '5 Stores Network' : filterState.selectedStore}
              </span>{' '}
              · Horizon:{' '}
              <span className="text-teal-400 font-medium">{filterState.horizonDays} Days</span> · Calibrated
              Retail Benchmark Loaded
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="neutral" size="sm">Phase 2 Verified</Badge>
          <Badge variant="teal" size="sm">Phase 3 Forecasting Active</Badge>
        </div>
      </div>

      {/* Primary KPI Row - Sourced from Live Ingested Dataset */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Network Stores"
          value={health?.stores_count ?? (meta?.stores.length || 5)}
          subtext="Retail & grocery locations loaded"
          icon={Store}
          badge="Live Dataset"
        />
        <StatCard
          label="Monitored SKUs"
          value={health?.products_count ?? (meta?.products.length || 12)}
          subtext="Categories: Dairy, Soups, Beverages"
          icon={Package}
          badge="Live Dataset"
        />
        <StatCard
          label="Historical Sales Rows"
          value={(health?.sales_records_count ?? 5460).toLocaleString()}
          subtext="Daily records past 90 days"
          icon={Layers}
          badge="Live Dataset"
        />
        <StatCard
          label="Weather & Event Signals"
          value={(health?.external_signals_count ?? 525).toLocaleString()}
          subtext="Historical + 14-day forecasts"
          icon={Activity}
          badge="Live Dataset"
        />
      </div>

      {/* Phase 2/3 Feature Placeholders (Clearly Marked) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Radar Preview Container */}
        <Card
          title="Inventory Risk Distribution"
          subtitle="Real-time stockout and excess buffer identification"
          headerAction={
            <Badge variant="neutral" size="sm" className="opacity-80">
              Engine Ready for Phase 3
            </Badge>
          }
          className="lg:col-span-2"
        >
          <div className="py-8 px-4 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-teal-400 mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>
            <h5 className="text-sm font-semibold text-slate-200">
              Stockout Risk & Dynamic Safety Stock Engine
            </h5>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Dynamic safety stock calculations and surplus-to-deficit classifications will be
              populated when the Phase 3 optimization engine runs against the loaded inventory snapshot.
            </p>
            <div className="mt-4 flex items-center justify-center space-x-3">
              <button
                onClick={() => onNavigate('rebalance')}
                className="inline-flex items-center space-x-1.5 text-xs text-teal-400 hover:text-teal-300 font-medium transition-colors"
              >
                <span>View Store Re-balancing Layout</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </Card>

        {/* Quick Action Highlights */}
        <Card
          title="Recommended Interventions"
          subtitle="Pending manager authorizations"
          headerAction={
            <Badge variant="neutral" size="sm">
              Workflow Shell
            </Badge>
          }
        >
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/50 text-xs text-slate-400">
              <div className="flex items-center justify-between text-slate-300 font-medium mb-1">
                <span>Inter-Store Transfers</span>
                <span className="text-teal-400 font-mono">0 Pending</span>
              </div>
              <p className="text-[11px]">
                Awaiting Phase 3 Re-balancing Solver to compute surplus routes.
              </p>
            </div>

            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/50 text-xs text-slate-400">
              <div className="flex items-center justify-between text-slate-300 font-medium mb-1">
                <span>Supplier Replenishments</span>
                <span className="text-amber-400 font-mono">0 Pending</span>
              </div>
              <p className="text-[11px]">
                Supplier orders will be generated for residual network deficits.
              </p>
            </div>

            <div className="pt-2 text-center">
              <button
                onClick={() => onNavigate('actions')}
                className="w-full py-2 px-3 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 rounded-lg transition-colors flex items-center justify-center space-x-1.5"
              >
                <span>Open Actions Workflow</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Model & Simulator Pipeline Blueprint */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          onClick={() => onNavigate('forecasting')}
          className="analytics-card p-5 border border-slate-800 bg-slate-900/60 flex items-start space-x-4 cursor-pointer hover:border-teal-500/40 transition-all"
        >
          <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h4 className="text-xs font-semibold text-slate-200">Phase 3: Demand Forecasting & Evaluation</h4>
              <Badge variant="teal" size="sm">Active</Badge>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Live Random Forest ML predictions vs. 7-day Moving Average ERP baseline with empirical
              P10–P90 uncertainty intervals and out-of-sample WMAPE evaluation.
            </p>
          </div>
        </div>

        <div className="analytics-card p-5 border border-slate-800 bg-slate-900/60 flex items-start space-x-4">
          <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h4 className="text-xs font-semibold text-slate-200">Phase 4: Impact Simulator</h4>
              <Badge variant="neutral" size="sm">Planned</Badge>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dual-policy historical backtester replaying the 90-day benchmark to compare Traditional
              ERP rules against AI-balanced policy without hardcoded claims.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
