from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Query, status
from fastapi.responses import JSONResponse
from app.services.data_service import data_service
from app.core.models import (
    ValidationReportResponse,
    DataPreviewResponse,
    DataStatusResponse,
)

router = APIRouter(prefix="/data", tags=["Data Management & Ingestion"])

@router.post("/upload/{dataset_type}", response_model=ValidationReportResponse)
async def upload_csv_file(
    dataset_type: str,
    file: UploadFile = File(...)
):
    """
    Uploads and validates a CSV file for: 'sales', 'inventory', or 'signals'.
    Returns structured validation feedback.
    """
    valid_types = ["sales", "inventory", "signals"]
    if dataset_type.lower() not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid dataset type '{dataset_type}'. Must be one of: {', '.join(valid_types)}"
        )

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV (.csv) files are supported for upload."
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded CSV file is completely empty."
        )

    report = data_service.upload_and_validate(
        content_bytes=content,
        filename=file.filename,
        dataset_type=dataset_type.lower()
    )

    if not report["is_valid"]:
        return JSONResponse(
            status_code=422,
            content=report
        )

    return report

@router.get("/preview/{dataset_type}", response_model=DataPreviewResponse)
def get_dataset_preview(
    dataset_type: str,
    store_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    product_id: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200)
):
    """Returns a filtered slice of the requested dataset for preview."""
    res = data_service.preview_dataset(
        dataset_type=dataset_type,
        store_id=store_id,
        category=category,
        product_id=product_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit
    )

    if "error" in res:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res["error"])

    return res

@router.get("/status", response_model=DataStatusResponse)
def get_data_status():
    """Returns the current state and record counts of all loaded CSV datasets."""
    sales_count = len(data_service.sales_df) if data_service.sales_df is not None else 0
    inv_count = len(data_service.inventory_df) if data_service.inventory_df is not None else 0
    signals_count = len(data_service.signals_df) if data_service.signals_df is not None else 0
    stores_count = len(data_service.stores_df) if data_service.stores_df is not None else 0
    products_count = len(data_service.products_df) if data_service.products_df is not None else 0

    min_date = data_service.sales_df["date"].min() if data_service.sales_df is not None and not data_service.sales_df.empty else None
    max_date = data_service.sales_df["date"].max() if data_service.sales_df is not None and not data_service.sales_df.empty else None

    return DataStatusResponse(
        status="ready" if data_service.is_loaded else "uninitialized",
        current_dataset=data_service.current_dataset_label,
        stores_count=stores_count,
        products_count=products_count,
        sales_records=sales_count,
        inventory_records=inv_count,
        signals_records=signals_count,
        min_sales_date=str(min_date) if min_date else None,
        max_sales_date=str(max_date) if max_date else None,
        last_validation=data_service.last_validation_report
    )

@router.post("/reset-demo")
def reset_demo_data():
    """Resets all data to the calibrated demo retail benchmark dataset."""
    res = data_service.reset_demo_data()
    return {"status": "ok", "message": "Reset to calibrated benchmark demo dataset successful.", "details": res}
