import React from 'react';
import { Store, Product, GlobalFilterState } from '../../types';
import { Store as StoreIcon, Layers, Package, Calendar } from 'lucide-react';
import { Badge } from './Badge';

interface GlobalFilterBarProps {
  stores: Store[];
  categories: string[];
  products: Product[];
  filterState: GlobalFilterState;
  onChange: (updated: Partial<GlobalFilterState>) => void;
}

export const GlobalFilterBar: React.FC<GlobalFilterBarProps> = ({
  stores,
  categories,
  products,
  filterState,
  onChange,
}) => {
  const filteredProducts = filterState.selectedCategory === 'ALL'
    ? products
    : products.filter((p) => p.category === filterState.selectedCategory);

  return (
    <div className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
      <div className="flex flex-wrap items-center gap-3">
        {/* Store Filter */}
        <div className="flex items-center space-x-2 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-1.5 focus-within:border-teal-500/50">
          <StoreIcon className="w-4 h-4 text-teal-400" />
          <span className="text-xs font-medium text-slate-400">Store:</span>
          <select
            value={filterState.selectedStore}
            onChange={(e) => onChange({ selectedStore: e.target.value })}
            className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer pr-1"
          >
            <option value="ALL" className="bg-slate-900 text-slate-200">Network Overview (All Stores)</option>
            {stores.map((s) => (
              <option key={s.store_id} value={s.store_id} className="bg-slate-900 text-slate-200">
                {s.name} ({s.city})
              </option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div className="flex items-center space-x-2 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-1.5 focus-within:border-teal-500/50">
          <Layers className="w-4 h-4 text-teal-400" />
          <span className="text-xs font-medium text-slate-400">Category:</span>
          <select
            value={filterState.selectedCategory}
            onChange={(e) => onChange({ selectedCategory: e.target.value, selectedProduct: 'ALL' })}
            className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer pr-1"
          >
            <option value="ALL" className="bg-slate-900 text-slate-200">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat} className="bg-slate-900 text-slate-200">
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Product Filter */}
        <div className="flex items-center space-x-2 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-1.5 focus-within:border-teal-500/50">
          <Package className="w-4 h-4 text-teal-400" />
          <span className="text-xs font-medium text-slate-400">Product:</span>
          <select
            value={filterState.selectedProduct}
            onChange={(e) => onChange({ selectedProduct: e.target.value })}
            className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer pr-1 max-w-[200px] truncate"
          >
            <option value="ALL" className="bg-slate-900 text-slate-200">All Products</option>
            {filteredProducts.map((p) => (
              <option key={p.product_id} value={p.product_id} className="bg-slate-900 text-slate-200">
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Horizon Toggle & Status Indicator */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center bg-slate-950/70 border border-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => onChange({ horizonDays: 7 })}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              filterState.horizonDays === 7
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>7-Day Horizon</span>
          </button>
          <button
            onClick={() => onChange({ horizonDays: 14 })}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              filterState.horizonDays === 14
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>14-Day Horizon</span>
          </button>
        </div>

        <Badge variant="teal" size="sm" className="hidden lg:inline-flex">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mr-1.5 animate-pulse" />
          Synthetic Benchmark Dataset
        </Badge>
      </div>
    </div>
  );
};
