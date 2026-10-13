import React, { useState, useEffect } from 'react';
import {
  GlobalFilterState,
  SystemMeta,
  InventorySummaryResponse,
  RebalanceRecommendationsResponse,
  InventoryItemStatus,
} from '../types';
import { api } from '../api/client';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import {
  ArrowLeftRight,
  ShieldCheck,
  AlertTriangle,
  Package,
  Store,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Coins,
  Truck,
} from 'lucide-react';

interface InventoryRebalancingProps {
  filterState: GlobalFilterState;
  meta: SystemMeta | null;
  onNavigateToActions?: () => void;
}

export const InventoryRebalancing: React.FC<InventoryRebalancingProps> = ({
  filterState,
  meta,
  onNavigateToActions,
}) => {
  const [selectedStore, setSelectedStore] = useState<string>(filterState.selectedStore);
  const [riskFilter, setRiskFilter] = useState<string>('ALL');

  const [inventorySummary, setInventorySummary] = useState<InventorySummaryResponse | null>(null);
  const [recommendations, setRecommendations] = useState<RebalanceRecommendationsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (filterState.selectedStore !== selectedStore) {
      setSelectedStore(filterState.selectedStore);
    }
  }, [filterState.selectedStore]);

  const fetchData = async (forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, recRes] = await Promise.all([
        api.getInventoryStatus(forceRefresh),
        api.getRebalanceRecommendations(),
      ]);
      setInventorySummary(invRes);
      setRecommendations(recRes);
    } catch (err: any) {
      console.error('Inventory rebalancing error:', err);
      setError(err?.message || 'Failed to load inventory rebalancing data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredItems = React.useMemo(() => {
    if (!inventorySummary) return [];
    let items = inventorySummary.items;

    if (selectedStore !== 'ALL') {
      items = items.filter((it) => it.store_id === selectedStore);
    }

    if (riskFilter !== 'ALL') {
      items = items.filter((it) => it.stockout_risk === riskFilter);
    }

    return items;
  }, [inventorySummary, selectedStore, riskFilter]);

  const transferRecs = React.useMemo(() => {
    if (!recommendations) return [];
    return recommendations.recommendations.filter((r) => r.action_type === 'transfer');
  }, [recommendations]);

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'CRITICAL':
        return <Badge variant="critical" size="sm">CRITICAL STOCKOUT</Badge>;
      case 'HIGH':
        return <Badge variant="warning" size="sm">HIGH RISK (7D)</Badge>;
      case 'DEFICIT':
        return <Badge variant="warning" size="sm">DEFICIT (&lt; SS)</Badge>;
      case 'OVERSTOCK':
        return <Badge variant="info" size="sm">EXCESS OVERSTOCK</Badge>;
      case 'SURPLUS':
        return <Badge variant="teal" size="sm">DONOR SURPLUS</Badge>;
      default:
        return <Badge variant="neutral" size="sm">HEALTHY BUFFER</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Informational Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-slate-100">Multi-Location Inventory Balancing</h3>
            <Badge variant="teal" size="sm">Phase 4 Active Engine</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Cross-store transfer solver balancing network surplus before triggering supplier procurement.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs text-slate-300">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-teal-500/10 border border-teal-500/20 text-teal-300">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>Donor Store Protection Verified</span>
          </div>

          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
            title="Refresh Inventory Analysis"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !inventorySummary && (
        <LoadingState message="Analyzing cross-store stock levels, lead times, and solver transfers..." />
      )}

      {error && !loading && (
        <ErrorState message={error} onRetry={() => fetchData(true)} />
      )}

      {inventorySummary && (
        <>
          {/* Primary KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Stockout Risks Detected"
              value={inventorySummary.total_stockout_risks}
              badge={inventorySummary.critical_shortages_count > 0 ? 'Urgent Action' : 'Monitoring'}
              icon={AlertTriangle}
              subtext={`${inventorySummary.critical_shortages_count} critical (< lead-time), ${inventorySummary.total_deficit_units} units net deficit`}
            />

            <StatCard
              label="Network Inter-Store Transfers"
              value={recommendations?.transfers_count || 0}
              badge="Fast 1-Day Dispatch"
              icon={ArrowLeftRight}
              trend={{
                value: `$${(recommendations?.potential_procurement_savings || 0).toLocaleString()} Saved`,
                isPositive: true,
              }}
              subtext="Fulfilling shortages from surplus without new supplier POs"
            />

            <StatCard
              label="Capital in Excess Overstock"
              value={`$${Math.round(inventorySummary.excess_holding_value).toLocaleString()}`}
              badge={`${inventorySummary.overstock_count} SKUs Overstocked`}
              icon={Coins}
              subtext="Units with >25 days of supply exceeding buffer targets"
            />

            <StatCard
              label="Total Network Inventory Value"
              value={`$${Math.round(inventorySummary.total_inventory_value).toLocaleString()}`}
              badge="5 Network Stores"
              icon={Package}
              subtext={`${inventorySummary.total_skus_monitored} store-SKU positions analyzed`}
            />
          </div>

          {/* Transfer Solver Opportunities Card */}
          {transferRecs.length > 0 && (
            <Card
              title="Calculated Inter-Store Transfer Routes"
              subtitle="Linear optimizer identified genuine donor surplus to avert stockouts without supplier lead time"
              badge={
                <Badge variant="teal" size="sm">
                  {transferRecs.length} Active Transfer Opportunities
                </Badge>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {transferRecs.map((tr) => (
                  <div
                    key={tr.id}
                    className="p-4 rounded-xl border border-teal-500/30 bg-teal-950/20 space-y-3 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[11px] font-mono font-semibold text-teal-400">
                          {tr.product_id} · {tr.category}
                        </span>
                        <h4 className="text-sm font-bold text-slate-100">{tr.product_name}</h4>
                      </div>
                      <Badge variant="critical" size="sm">
                        {tr.urgency}
                      </Badge>
                    </div>

                    {/* Route Details */}
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5 text-slate-300">
                          <Store className="w-3.5 h-3.5 text-teal-400" />
                          <span>Donor: <strong>{tr.source_store_name}</strong></span>
                        </div>
                        <span className="text-[11px] text-teal-300 font-mono">
                          Surplus: {tr.evidence.donor_surplus_before_transfer} units
                        </span>
                      </div>

                      <div className="flex items-center justify-center text-teal-400 py-0.5">
                        <ArrowRight className="w-4 h-4" />
                        <span className="text-[11px] font-bold mx-2 text-white">
                          Transfer {tr.recommended_quantity} Units (${tr.total_cost.toFixed(2)})
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5 text-slate-300">
                          <Store className="w-3.5 h-3.5 text-rose-400" />
                          <span>Receiver: <strong>{tr.destination_store_name}</strong></span>
                        </div>
                        <span className="text-[11px] text-rose-300 font-mono">
                          SOH: {tr.evidence.receiving_stock_on_hand} (Stockout Day {tr.time_to_stockout_days ?? 1})
                        </span>
                      </div>
                    </div>

                    {/* Donor Protection & Speed Benefit */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
                      <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                        <span className="text-slate-500 block">Lead Time Advantage:</span>
                        <span className="text-teal-300 font-semibold">
                          {tr.lead_time_days}d Transfer vs {tr.evidence.supplier_lead_time_days}d Supplier
                        </span>
                      </div>
                      <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                        <span className="text-slate-500 block">Donor Post-Transfer Buffer:</span>
                        <span className="text-teal-300 font-semibold">
                          {tr.evidence.donor_surplus_after_transfer} Units Protected
                        </span>
                      </div>
                    </div>

                    {/* Action Status and Link */}
                    <div className="pt-1 flex items-center justify-between">
                      <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Status: <strong className="text-slate-200 capitalize">{tr.status}</strong></span>
                      </div>

                      {onNavigateToActions && (
                        <button
                          onClick={onNavigateToActions}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-teal-600 hover:bg-teal-500 transition-colors flex items-center space-x-1 shadow-sm"
                        >
                          <span>Review in Queue</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Complete Stock Health & Buffer Hierarchy Table */}
          <Card
            title="Catalog Stock Health & Safety Buffer Hierarchy"
            subtitle="Live inventory positions evaluated against Phase 3 machine learning demand projections"
            headerAction={
              <div className="flex flex-wrap items-center gap-2">
                {/* Store Filter */}
                <select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="ALL">All Stores Network</option>
                  {(meta?.stores || []).map((s) => (
                    <option key={s.store_id} value={s.store_id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                {/* Risk Filter */}
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="ALL">All Risk Levels</option>
                  <option value="CRITICAL">Critical Stockout</option>
                  <option value="HIGH">High Risk (7d)</option>
                  <option value="DEFICIT">Deficit (&lt; SS)</option>
                  <option value="HEALTHY">Healthy Buffer</option>
                  <option value="SURPLUS">Donor Surplus</option>
                  <option value="OVERSTOCK">Excess Overstock</option>
                </select>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                    <th className="py-2.5 px-3">Store Location</th>
                    <th className="py-2.5 px-3">Product Name & SKU</th>
                    <th className="py-2.5 px-3 text-right">On Hand + In</th>
                    <th className="py-2.5 px-3 text-right">14d Demand</th>
                    <th className="py-2.5 px-3 text-right">Safety Stock</th>
                    <th className="py-2.5 px-3 text-right">Reorder Pt</th>
                    <th className="py-2.5 px-3 text-right">Days Supply</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Donor Surplus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredItems.map((it) => (
                    <tr
                      key={`${it.store_id}_${it.product_id}`}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        it.stockout_risk === 'CRITICAL'
                          ? 'bg-rose-950/20'
                          : it.stockout_risk === 'SURPLUS'
                          ? 'bg-teal-950/10'
                          : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-300">
                        {it.store_name}
                        <span className="text-[10px] text-slate-500 block font-mono">{it.city}</span>
                      </td>

                      <td className="py-2.5 px-3 font-sans">
                        <span className="text-slate-200 font-medium block">{it.product_name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{it.product_id} · {it.category}</span>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <span className="text-white font-bold">{it.stock_on_hand}</span>
                        {it.incoming_quantity > 0 && (
                          <span className="text-teal-400 text-[10px] block">+{it.incoming_quantity} in</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right text-slate-300">
                        {it.forecast_demand_14d}
                        <span className="text-[10px] text-slate-500 block">{it.average_daily_demand}/d</span>
                      </td>

                      <td className="py-2.5 px-3 text-right text-amber-300 font-semibold">
                        {it.safety_stock}
                      </td>

                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {it.reorder_point}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={
                            it.days_of_supply < 4
                              ? 'text-rose-400 font-bold'
                              : it.days_of_supply > 25
                              ? 'text-sky-300'
                              : 'text-slate-300'
                          }
                        >
                          {it.days_of_supply}d
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center font-sans">
                        {getRiskBadge(it.stockout_risk)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-bold">
                        {it.available_donor_surplus > 0 ? (
                          <span className="text-teal-300">+{it.available_donor_surplus} units</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
