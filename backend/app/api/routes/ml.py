from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import pandas as pd
import structlog

from app.api.deps import get_current_user, get_current_tenant
from app.core.database import get_db
from app.models.user import User
from app.models.tenant import Tenant
from app.models.dataset import Dataset
from app.tools.sql_executor import sql_executor
from app.services.ml_service import run_forecast, run_anomaly_detection, run_segmentation

logger = structlog.get_logger()
router = APIRouter(prefix="/ml", tags=["ml"])


class ForecastRequest(BaseModel):
    dataset_id: str
    date_column: str
    metric_column: str
    periods: int = 30


class AnomalyRequest(BaseModel):
    dataset_id: str
    date_column: str
    metric_columns: List[str]


class SegmentationRequest(BaseModel):
    dataset_id: str
    features: List[str]
    n_clusters: int = 3


def _records_to_df(rows: List[Dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    for col in df.columns:
        if df[col].dtype == "object":
            converted = pd.to_datetime(df[col], errors="coerce")
            if converted.notna().sum() >= max(3, int(len(df) * 0.6)):
                df[col] = converted
    return df


async def _load_df_for_dataset(db: AsyncSession, tenant_id: str, dataset_id: str) -> pd.DataFrame:
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.tenant_id == tenant_id)
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.status != "ready":
        raise HTTPException(status_code=400, detail=f"Dataset is not ready: current status is {dataset.status}")

    try:
        rows = await sql_executor.execute(f'SELECT * FROM "{dataset.table_name}"', limit=5000)
        df = _records_to_df(rows)
        return df
    except Exception as e:
        logger.error("failed_to_load_df_for_ml", dataset_id=dataset_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to fetch dataset data: {e}")


@router.post("/forecast")
async def forecast(
    body: ForecastRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    df = await _load_df_for_dataset(db, current_tenant.id, body.dataset_id)
    if df.empty:
        raise HTTPException(status_code=400, detail="The dataset is empty.")

    if body.date_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Date column '{body.date_column}' not found in dataset.")
    if body.metric_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Metric column '{body.metric_column}' not found in dataset.")

    res = run_forecast(df, body.date_column, body.metric_column, periods=body.periods)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])

    # Prepare chart-ready data structure
    chart_data = []
    for h in res["historical"]:
        chart_data.append({
            "date": h["date"],
            "Actual": h["value"],
            "Forecast": None
        })
    if res["historical"] and res["forecast"]:
        last_h = res["historical"][-1]
        chart_data.append({
            "date": last_h["date"],
            "Actual": last_h["value"],
            "Forecast": last_h["value"]
        })
    for f in res["forecast"]:
        chart_data.append({
            "date": f["date"],
            "Actual": None,
            "Forecast": f["value"]
        })

    return {
        "summary": res["summary"],
        "metric": body.metric_column,
        "date_column": body.date_column,
        "chart_data": chart_data,
        "forecast_horizon": body.periods
    }


@router.post("/anomalies")
async def anomalies(
    body: AnomalyRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    df = await _load_df_for_dataset(db, current_tenant.id, body.dataset_id)
    if df.empty:
        raise HTTPException(status_code=400, detail="The dataset is empty.")

    if body.date_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Date column '{body.date_column}' not found.")
    for col in body.metric_columns:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Metric column '{col}' not found.")

    res = run_anomaly_detection(df, body.date_column, body.metric_columns)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])

    # Prepare chart-ready data structure
    primary_metric = body.metric_columns[0]
    df_clean = df.copy()
    df_clean[body.date_column] = pd.to_datetime(df_clean[body.date_column], errors="coerce")
    df_clean[primary_metric] = pd.to_numeric(df_clean[primary_metric], errors="coerce")
    df_clean = df_clean.dropna(subset=[body.date_column, primary_metric]).sort_values(by=body.date_column)
    df_daily = df_clean.set_index(body.date_column)[primary_metric].resample("D").sum().fillna(0)
    
    anom_dates = {a["date"] for a in res["anomalies"]}
    chart_data = []
    for date, val in df_daily.items():
        date_str = date.strftime("%Y-%m-%d")
        chart_data.append({
            "date": date_str,
            "Value": float(val),
            "Anomaly": float(val) if date_str in anom_dates else None
        })

    return {
        "summary": res["summary"],
        "metric": primary_metric,
        "date_column": body.date_column,
        "chart_data": chart_data,
        "anomaly_count": res["anomaly_count"],
        "total_analyzed": res["total_analyzed"]
    }


@router.post("/segmentation")
async def segmentation(
    body: SegmentationRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    df = await _load_df_for_dataset(db, current_tenant.id, body.dataset_id)
    if df.empty:
        raise HTTPException(status_code=400, detail="The dataset is empty.")

    for col in body.features:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Feature column '{col}' not found.")

    res = run_segmentation(df, body.features, n_clusters=body.n_clusters)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])

    # Prepare chart-ready data structure
    chart_data = []
    for s in res["segments"]:
        chart_data.append({
            "Segment": f"Cluster {s['cluster_id']}",
            "Size": s["size"],
            "Percentage": s["percentage"]
        })

    return {
        "summary": res["summary"],
        "segments": res["segments"],
        "chart_data": chart_data,
        "total_segmented": res["total_segmented"]
    }


class RecommendRequest(BaseModel):
    dataset_id: str


class CompareRequest(BaseModel):
    dataset_id: str
    date_column: str
    metric_column: str


@router.post("/recommend")
async def recommend(
    body: RecommendRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    df = await _load_df_for_dataset(db, current_tenant.id, body.dataset_id)
    if df.empty:
        raise HTTPException(status_code=400, detail="The dataset is empty.")
        
    from app.services.ml_service import recommend_models
    recs = recommend_models(df)
    return {"recommendations": recs}


@router.post("/compare-models")
async def compare_models_endpoint(
    body: CompareRequest,
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    df = await _load_df_for_dataset(db, current_tenant.id, body.dataset_id)
    if df.empty:
        raise HTTPException(status_code=400, detail="The dataset is empty.")

    if body.date_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Date column '{body.date_column}' not found.")
    if body.metric_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Metric column '{body.metric_column}' not found.")

    from app.services.ml_service import compare_forecasting_models
    res = compare_forecasting_models(df, body.date_column, body.metric_column)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
        
    return res
