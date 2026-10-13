import React, { useState, useEffect } from 'react';
import { PageId, GlobalFilterState, HealthStatus, SystemMeta } from './types';
import { api } from './api/client';
import { Sidebar } from './components/common/Sidebar';
import { Navbar } from './components/common/Navbar';
import { GlobalFilterBar } from './components/common/GlobalFilterBar';
import { ExecutiveDashboard } from './pages/ExecutiveDashboard';
import { DemandForecasting } from './pages/DemandForecasting';
import { InventoryRebalancing } from './pages/InventoryRebalancing';
import { ExternalSignals } from './pages/ExternalSignals';
import { RecommendedActions } from './pages/RecommendedActions';
import { ImpactSimulator } from './pages/ImpactSimulator';
import { DataManagement } from './pages/DataManagement';
import { LoadingState } from './components/common/LoadingState';
import { ErrorState } from './components/common/ErrorState';

export function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [meta, setMeta] = useState<SystemMeta | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [filterState, setFilterState] = useState<GlobalFilterState>({
    selectedStore: 'ALL',
    selectedCategory: 'ALL',
    selectedProduct: 'ALL',
    horizonDays: 7,
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, metaRes] = await Promise.all([
        api.checkHealth(),
        api.getMetadata(),
      ]);
      setHealth(healthRes);
      setMeta(metaRes);
    } catch (err: any) {
      console.warn('Backend connection notice:', err);
      // Even if backend is starting up or disconnected, keep application shell responsive
      setError(err?.message || 'Unable to establish connection to StockSense AI backend API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFilterChange = (updated: Partial<GlobalFilterState>) => {
    setFilterState((prev) => ({ ...prev, ...updated }));
  };

  const renderActivePage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <ExecutiveDashboard
            health={health}
            meta={meta}
            filterState={filterState}
            onNavigate={(page) => setCurrentPage(page)}
          />
        );
      case 'forecasting':
        return <DemandForecasting filterState={filterState} meta={meta} />;
      case 'rebalance':
        return (
          <InventoryRebalancing
            filterState={filterState}
            meta={meta}
            onNavigateToActions={() => setCurrentPage('actions')}
          />
        );
      case 'signals':
        return <ExternalSignals filterState={filterState} meta={meta} />;
      case 'actions':
        return <RecommendedActions filterState={filterState} meta={meta} />;
      case 'simulator':
        return <ImpactSimulator filterState={filterState} meta={meta} />;
      case 'data-settings':
        return <DataManagement health={health} meta={meta} onRefreshMetadata={fetchData} />;
      default:
        return (
          <ExecutiveDashboard
            health={health}
            meta={meta}
            filterState={filterState}
            onNavigate={(page) => setCurrentPage(page)}
          />
        );
    }
  };

  return (
    <div className="flex h-screen bg-[#090d16] text-slate-100 font-sans overflow-hidden">
      {/* Navigation Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        health={health}
        healthLoading={loading}
      />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar currentPage={currentPage} health={health} />
        
        <GlobalFilterBar
          stores={meta?.stores || []}
          categories={meta?.categories || []}
          products={meta?.products || []}
          filterState={filterState}
          onChange={handleFilterChange}
        />

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="mb-4">
              <ErrorState
                title="FastAPI Backend Disconnected"
                message={`${error} You can still inspect the full Phase 1 UI shell. Ensure 'uvicorn app.main:app' is running on port 8000.`}
                onRetry={fetchData}
              />
            </div>
          )}

          {loading && !health ? (
            <LoadingState
              message="Connecting to StockSense AI Engine..."
              subtext="Loading verified benchmark dataset (5 stores, 12 SKUs, 5,460 sales rows)"
            />
          ) : (
            renderActivePage()
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
