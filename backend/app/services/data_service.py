import os
import io
import csv
from pathlib import Path
from typing import Dict, Any, List, Optional, Set
import pandas as pd
from app.config import settings
from app.services.data_validator import DataValidator, normalize_columns

class DataService:
    def __init__(self):
        self.demo_dir = settings.demo_data_dir
        self.upload_dir = settings.upload_data_dir
        self.upload_dir.mkdir(parents=True, exist_ok=True)

        self.stores_df: Optional[pd.DataFrame] = None
        self.products_df: Optional[pd.DataFrame] = None
        self.inventory_df: Optional[pd.DataFrame] = None
        self.sales_df: Optional[pd.DataFrame] = None
        self.signals_df: Optional[pd.DataFrame] = None
        
        self.current_dataset_label = "calibrated_benchmark"
        self.last_validation_report: Optional[Dict[str, Any]] = None
        self.is_loaded = False
        self.load_all()

    @property
    def valid_store_ids(self) -> Set[str]:
        if self.stores_df is not None and "store_id" in self.stores_df.columns:
            return set(self.stores_df["store_id"].dropna().astype(str).tolist())
        return set()

    @property
    def valid_product_ids(self) -> Set[str]:
        if self.products_df is not None and "product_id" in self.products_df.columns:
            return set(self.products_df["product_id"].dropna().astype(str).tolist())
        return set()

    def load_all(self) -> Dict[str, Any]:
        """Loads and validates all core CSV datasets."""
        try:
            stores_path = self.demo_dir / "stores.csv"
            products_path = self.demo_dir / "products.csv"
            inv_path = self.demo_dir / "inventory_current.csv"
            sales_path = self.demo_dir / "sales_history.csv"
            signals_path = self.demo_dir / "external_signals.csv"

            if not (stores_path.exists() and products_path.exists() and inv_path.exists() and sales_path.exists() and signals_path.exists()):
                return {"status": "error", "message": "One or more demo CSV files are missing"}

            self.stores_df = pd.read_csv(stores_path)
            self.products_df = pd.read_csv(products_path)
            self.inventory_df = normalize_columns(pd.read_csv(inv_path))
            self.sales_df = normalize_columns(pd.read_csv(sales_path))
            self.signals_df = normalize_columns(pd.read_csv(signals_path))

            self.is_loaded = True
            return {
                "status": "ready",
                "stores_count": len(self.stores_df),
                "products_count": len(self.products_df),
                "sales_records": len(self.sales_df),
                "inventory_records": len(self.inventory_df),
                "signals_records": len(self.signals_df),
                "min_sales_date": self.sales_df["date"].min(),
                "max_sales_date": self.sales_df["date"].max(),
            }
        except Exception as e:
            self.is_loaded = False
            return {"status": "error", "message": str(e)}

    def reset_demo_data(self) -> Dict[str, Any]:
        """Re-runs demo generator and reloads benchmark dataset."""
        from app.services.generate_demo_data import generate_all_datasets
        generate_all_datasets()
        res = self.load_all()
        self.current_dataset_label = "calibrated_benchmark"
        self.last_validation_report = None
        return res

    def upload_and_validate(self, content_bytes: bytes, filename: str, dataset_type: str) -> Dict[str, Any]:
        """Validates uploaded CSV bytes and updates the dataset if valid."""
        try:
            df = pd.read_csv(io.BytesIO(content_bytes))
        except Exception as e:
            return {
                "is_valid": False,
                "total_rows": 0,
                "error_count": 1,
                "summary": f"Failed to parse CSV file: {str(e)}",
                "errors": [{"category": "PARSER_ERROR", "row": 0, "column": "file", "message": str(e)}],
                "warnings": []
            }

        # Run multi-rule validation
        report = DataValidator.validate_csv(
            df=df,
            dataset_type=dataset_type,
            valid_store_ids=self.valid_store_ids,
            valid_product_ids=self.valid_product_ids
        )

        self.last_validation_report = report

        if report["is_valid"] and report.get("cleaned_dataframe") is not None:
            clean_df = report["cleaned_dataframe"]
            # Apply update
            if dataset_type == "sales":
                self.sales_df = clean_df
            elif dataset_type == "inventory":
                self.inventory_df = clean_df
            elif dataset_type == "signals":
                self.signals_df = clean_df

            # Save uploaded copy
            saved_path = self.upload_dir / f"{dataset_type}_{filename}"
            clean_df.to_csv(saved_path, index=False)
            self.current_dataset_label = f"custom_{filename}"

        return report

    def get_metadata(self) -> Dict[str, Any]:
        """Returns filter options and system metadata for the frontend."""
        if not self.is_loaded or self.stores_df is None:
            self.load_all()

        if self.stores_df is None or self.products_df is None:
            return {
                "stores": [],
                "categories": [],
                "products": [],
                "date_range": {"min": "", "max": ""},
                "current_dataset": "demo"
            }

        stores_list = self.stores_df.to_dict(orient="records")
        categories_list = sorted(self.products_df["category"].dropna().unique().tolist())
        products_list = self.products_df.to_dict(orient="records")

        min_date = self.sales_df["date"].min() if self.sales_df is not None and not self.sales_df.empty else ""
        max_date = self.sales_df["date"].max() if self.sales_df is not None and not self.sales_df.empty else ""

        return {
            "stores": stores_list,
            "categories": categories_list,
            "products": products_list,
            "date_range": {"min": min_date, "max": max_date},
            "current_dataset": self.current_dataset_label
        }

    def preview_dataset(
        self,
        dataset_type: str,
        store_id: Optional[str] = None,
        category: Optional[str] = None,
        product_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 50
    ) -> Dict[str, Any]:
        """Returns filtered slice and summary metrics for the Data Management preview table."""
        dataset_type = dataset_type.lower().strip()
        df: Optional[pd.DataFrame] = None

        if dataset_type == "sales":
            df = self.sales_df
        elif dataset_type == "inventory":
            df = self.inventory_df
        elif dataset_type == "signals":
            df = self.signals_df
        elif dataset_type == "stores":
            df = self.stores_df
        elif dataset_type == "products":
            df = self.products_df
        else:
            return {"error": f"Unknown dataset type '{dataset_type}'"}

        if df is None:
            return {"total_count": 0, "rows": [], "columns": []}

        filtered = df.copy()

        # Apply store filter
        if store_id and store_id != "ALL" and "store_id" in filtered.columns:
            filtered = filtered[filtered["store_id"] == store_id]

        # Apply product filter
        if product_id and product_id != "ALL" and "product_id" in filtered.columns:
            filtered = filtered[filtered["product_id"] == product_id]

        # Apply category filter
        if category and category != "ALL" and "product_id" in filtered.columns and self.products_df is not None:
            cat_products = set(self.products_df[self.products_df["category"] == category]["product_id"].tolist())
            filtered = filtered[filtered["product_id"].isin(cat_products)]

        # Apply date filters
        if "date" in filtered.columns:
            if start_date:
                filtered = filtered[filtered["date"] >= start_date]
            if end_date:
                filtered = filtered[filtered["date"] <= end_date]

        total_count = len(filtered)
        preview_rows = filtered.head(limit).to_dict(orient="records")

        return {
            "dataset_type": dataset_type,
            "total_count": total_count,
            "columns": list(df.columns),
            "rows": preview_rows
        }

    def get_signals_list(
        self,
        store_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Returns chronological external signals with weather and event spike tags."""
        if self.signals_df is None or self.signals_df.empty:
            return []

        df = self.signals_df.copy()
        if store_id and store_id != "ALL":
            df = df[df["store_id"] == store_id]
        if start_date:
            df = df[df["date"] >= start_date]
        if end_date:
            df = df[df["date"] <= end_date]

        df = df.sort_values(by=["date", "store_id"])
        return df.head(limit).to_dict(orient="records")

data_service = DataService()
