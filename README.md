# StockSense AI — Demand Forecasting & Inventory Re-balancing

**StockSense AI** is an AI-assisted retail inventory management system designed to tackle the limitations of traditional ERP software. Traditional ERP forecasting relies on static moving averages, rigid safety stock rules, and isolated store silos—leading to costly stockouts during sudden demand shifts or bloated holding costs from excessive buffers.

StockSense AI combines **sales history**, **current inventory**, and **external market signals (weather, calendar holidays, local events)** to:
1. Forecast 7-day and 14-day demand per store and SKU with uncertainty intervals ($P_{10}, P_{50}, P_{90}$).
2. Dynamically adjust safety stock based on forecast volatility rather than fixed constants.
3. Balance inventory across neighboring stores before issuing supplier reorders, protecting donor store safety buffers.
4. Support human-in-the-loop decision-making with approval workflows.
5. Replay historical backtests to objectively measure stockout reductions and holding costs against traditional ERP baselines.

---

## Architecture & Technology Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Recharts, Lucide Icons.
- **Backend**: Python 3.14, FastAPI, Pydantic, Pandas, NumPy, Scikit-Learn.
- **Data Foundation**: Calibrated 5-store / 12-SKU benchmark dataset (`backend/data/demo/`).
- **External Signals**: Hyper-local weather (Open-Meteo API / offline synthetic fallback) + calendar/event schedules.

---

## Phase 2: Data Management & CSV Schemas

### Standardized Schemas

#### 1. Historical Sales (`sales_history.csv`)
- `date`: `YYYY-MM-DD` string
- `store_id`: String (Foreign key to `stores.csv`)
- `product_id`: String (Foreign key to `products.csv`)
- `units_sold`: Integer $\ge 0$
- `unit_price`: Float $> 0$
- `promotion_active`: Boolean (`true` / `false`)
- `simulated_spike_tag`: String (`None`, `Simulated Rainstorm Spike`, `Simulated Campus Festival Spike`)

#### 2. Current Inventory Snapshot (`inventory_current.csv`)
- `store_id`: String (Foreign key to `stores.csv`)
- `product_id`: String (Foreign key to `products.csv`)
- `stock_on_hand`: Integer $\ge 0$
- `incoming_quantity`: Integer $\ge 0$
- `supplier_lead_time_days`: Integer $\ge 0$
- `unit_cost`: Float $> 0$

#### 3. External Market Signals (`external_signals.csv`)
- `date`: `YYYY-MM-DD` string
- `store_id`: String (Foreign key to `stores.csv`)
- `holiday_flag`: Boolean (`0` or `1`)
- `event_flag`: Boolean (`0` or `1`)
- `event_name`: String (e.g. `Sunday Market`, `Campus Homecoming & Games`)
- `temperature`: Float (°C)
- `rainfall`: Float (mm $\ge 0$)
- `spike_label`: String (`Baseline`, `Simulated Rainstorm Event`, `Simulated Campus Homecoming Spike`)

---

## Data Validation Engine

All CSV uploads are rigorously validated through [data_validator.py](file:///c:/Users/Jasmini%20Mohanty/OneDrive/Documents/AIMPACT-1/backend/app/services/data_validator.py) with structured, human-readable error reports:
- **Missing Required Columns**: Rejects files lacking mandatory schema keys.
- **Invalid Date Formatting**: Enforces `YYYY-MM-DD` and checks calendar validity.
- **Negative Quantities**: Enforces non-negative sales, on-hand stock, incoming quantities, lead times, and rainfall.
- **Non-Positive Prices & Costs**: Guarantees unit prices and procurement costs are strictly positive.
- **Duplicate Composite Keys**: Enforces uniqueness across `(date, store_id, product_id)` for sales and `(store_id, product_id)` for inventory.
- **Referential Integrity**: Verifies unknown `store_id` or `product_id` values against registered stores and products catalogs.
- **Incompatible Data Types**: Detects non-numeric characters, unparseable booleans, and nulls with line numbers.

---

## Windows Setup & Execution Guide

### Prerequisites
- **Python 3.10+** (Python 3.14 verified)
- **Node.js v18+** & **npm**

### 1. Backend Setup & Run (PowerShell)

Open a PowerShell terminal in the repository root:

```powershell
# 1. Install backend dependencies
python -m pip install -r backend/requirements.txt

# 2. Run automated backend test suite (15 unit tests)
python -m pytest backend/tests

# 3. Start the FastAPI backend server
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

- API Base URL: `http://127.0.0.1:8000`
- Interactive API Documentation (Swagger): `http://127.0.0.1:8000/docs`
- Health Endpoint: `http://127.0.0.1:8000/api/health`
- Data Status Endpoint: `http://127.0.0.1:8000/api/data/status`

### 2. Frontend Setup & Run (PowerShell)

Open a second PowerShell terminal in the repository root:

```powershell
# 1. Navigate to the frontend directory
cd frontend

# 2. Install frontend dependencies
npm install

# 3. Run production build verification
npm run build

# 4. Start the Vite development server
npm run dev
```

- Frontend Dashboard: `http://localhost:5173`

## Phase 3: Demand Forecasting & Evaluation Engine

### Dual-Model Architecture
1. **Traditional ERP Baseline**: 7-day moving average calculated strictly on preceding days.
2. **Signal-Aware ML Engine**: Scikit-Learn `RandomForestRegressor` trained on shifted historical sales, lag features ($T-1, T-2, T-7, T-14$), rolling averages & standard deviations, day of week, month, day of month, promotion flags, and external signals (precipitation, temperature anomalies, holiday and event flags).
3. **No Future-Data Leakage**: Lags and rolling windows are shifted by 1 day; chronological train/test splitting preserves time ordering.
4. **Empirical Quantile Uncertainty**: Out-of-sample prediction intervals $[P_{10}, P_{90}]$ calculated from residual distributions and scaled forward into the future using $\sqrt{1 + 0.04k}$.
5. **Honest Out-of-Sample Evaluation**:
   - **WMAPE** ($\frac{\sum |y - \hat{y}|}{\sum y}$) with division-by-zero protection.
   - **MAE** (Mean Absolute Error).
   - Head-to-head comparison against 7-day moving average on the identical chronological test slice.
   - Transparent diagnostic notes for insufficient history (<14 days) and missing feature imputation.

---

## Verification & Checks Summary (Phase 2 & Phase 3)

| Verification Check | Target Component | Result | Details |
| :--- | :--- | :--- | :--- |
| **Frontend Production Build** | `frontend` | **PASSED** | `tsc -b && vite build` bundled cleanly (0 errors, 0 warnings). |
| **Backend Automated Tests** | `backend/tests` | **PASSED** | **22/22 pytest test cases passed** in 3.67s (15 validation + 7 forecasting engine tests). |
| **Chronological Split & No-Leakage** | `test_forecasting.py` | **PASSED** | Out-of-sample test window verified to follow training window with zero future data leakage. |
| **Zero-Demand WMAPE Safety** | `test_forecasting.py` | **PASSED** | Verified non-crashing division on zero/empty demand arrays. |
| **Short History & Fallbacks** | `test_forecasting.py` | **PASSED** | Graceful fallback and clear diagnostic alerts for records <14 days. |
| **Missing Signals Imputation** | `test_forecasting.py` | **PASSED** | Default signal imputation with transparent diagnostics when external tables are omitted. |
| **Interactive Recharts Visualizer** | `DemandForecasting.tsx` | **PASSED** | Live time-series with solid actuals, ML P50, ERP baseline, and shaded P10-P90 uncertainty cone. |
| **Feature Driver Ranking** | `DemandForecasting.tsx` | **PASSED** | Tree-based Gini feature importance visualization for weather shocks, calendar events, and lags. |

---

## Roadmap Next Steps

- **Phase 1 (Complete)**: Project foundation, design system, navigation shell, data contracts.
- **Phase 2 (Complete)**: Reliable CSV upload, multi-layer validation engine, schema guides, data explorer, and external market signals interface.
- **Phase 3 (Complete)**: Signal-Aware Demand Forecasting Engine (7-day MA baseline vs. ML model + Quantile uncertainty $P_{10}, P_{50}, P_{90}$ + out-of-sample evaluation).
- **Phase 4 (Next)**: Inventory Re-balancing & Optimization Engine (Dynamic safety stock, transfer solver, approval workflow).
- **Phase 5**: Historical Impact Simulator (Side-by-side policy replay, measuring the ~30% stockout reduction).
- **Phase 6**: Executive Dashboard Polish & 5-minute Pitch Demo.
