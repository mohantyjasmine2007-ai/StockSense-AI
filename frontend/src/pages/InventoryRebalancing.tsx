import React from 'react';
import { GlobalFilterState, SystemMeta } from '../types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { ArrowLeftRight, ShieldCheck, AlertCircle } from 'lucide-react';

interface InventoryRebalancingProps {
  filterState: GlobalFilterState;
  meta: SystemMeta | null;
}

export const InventoryRebalancing: React.FC<InventoryRebalancingProps> = ({
  filterState,
  meta,
}) => {
  return (
    <div className="space-y-6">
      {/* Informational Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-slate-100">Multi-Location Inventory Balancing</h3>
            <Badge variant="teal" size="sm">Phase 3 Specification</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Balancing surplus across {meta?.stores.length || 5} stores before triggering external supplier reorders.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-teal-400" />
          <span>Donor Stock Protection Rule Enforced</span>
        </div>
      </div>

      {/* Cross-Store Rebalance Matrix Shell */}
      <Card
        title="Network Transfer Opportunities"
        subtitle="Identifies eligible surplus stores to resolve shortages without purchasing new stock"
        headerAction={
          <Badge variant="neutral" size="sm">
            Phase 3 Solver Shell
          </Badge>
        }
      >
        <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-teal-400 mb-3">
            <ArrowLeftRight className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200">
            Linear Stock Transfer Optimizer Shell
          </h4>
          <p className="text-xs text-slate-400 max-w-lg mx-auto mt-1 leading-relaxed">
            In Phase 3, the engine will map surplus stores (e.g. Store 02 sitting on excess umbrellas & soup)
            to stores facing impending weather-driven shortages (Store 01 Downtown), ensuring the donor store’s
            own dynamic safety buffer is never violated.
          </p>
        </div>
      </Card>

      {/* Stock Health & Safety Buffer Table Preview */}
      <Card
        title="Current Stock On-Hand & Buffer Hierarchy"
        subtitle="Live catalog SKUs and their holding parameters"
      >
        <div className="overflow-x-auto">
          <table className="data-table-compact">
            <thead>
              <tr>
                <th>Product SKU</th>
                <th>Category</th>
                <th>Unit Cost</th>
                <th>Lead Time</th>
                <th>Min Order Qty</th>
                <th>Safety Buffer Logic</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {meta?.products.map((p) => (
                <tr key={p.product_id}>
                  <td className="font-medium text-slate-200">
                    <div>{p.name}</div>
                    <span className="text-[10px] text-slate-400 font-mono">{p.product_id}</span>
                  </td>
                  <td>{p.category}</td>
                  <td className="font-mono">${p.unit_cost.toFixed(2)}</td>
                  <td className="font-mono">{p.lead_time_days} days</td>
                  <td className="font-mono">{p.min_order_qty} units</td>
                  <td>
                    <span className="text-teal-400 text-xs font-mono">Dynamic (P90 - P50)</span>
                  </td>
                  <td>
                    <Badge variant="teal" size="sm">Catalog Loaded</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
