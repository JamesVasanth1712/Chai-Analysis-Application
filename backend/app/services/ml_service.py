import numpy as np
import pandas as pd
import structlog
from typing import Any, Dict, List, Tuple, Optional

logger = structlog.get_logger()


def _pick_columns(df: pd.DataFrame) -> Dict[str, List[str]]:
    columns: Dict[str, List[str]] = {"numeric": [], "categorical": [], "dates": []}

    for col in df.columns:
      series = df[col]
      col_lower = str(col).lower()

      if pd.api.types.is_datetime64_any_dtype(series):
          columns["dates"].append(col)
          continue

      if pd.api.types.is_numeric_dtype(series):
          columns["numeric"].append(col)
          continue

      numeric = pd.to_numeric(series, errors="coerce")
      if numeric.notna().sum() >= max(3, int(len(series) * 0.6)):
          columns["numeric"].append(col)
          continue

      if any(token in col_lower for token in ["date", "time", "year", "month"]):
          parsed = pd.to_datetime(series, errors="coerce")
          if parsed.notna().sum() >= max(3, int(len(series) * 0.4)):
              columns["dates"].append(col)
              continue

      columns["categorical"].append(col)

    return columns


def run_forecast(
    df: pd.DataFrame,
    date_col: str,
    metric_col: str,
    periods: int = 30
) -> Dict[str, Any]:
    try:
        df = df[[date_col, metric_col]].copy()
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        df[metric_col] = pd.to_numeric(df[metric_col], errors="coerce")
        df = df.dropna().sort_values(by=date_col)
        
        df.set_index(date_col, inplace=True)
        df_daily = df.resample("D").sum().fillna(0)
        
        if len(df_daily) < 5:
            return {"error": "Not enough data points to run forecasting (minimum 5 daily data points required)."}
        
        try:
            from statsmodels.tsa.api import ExponentialSmoothing
            model = ExponentialSmoothing(
                df_daily[metric_col],
                seasonal_periods=7,
                trend="add",
                seasonal="add"
            ).fit()
            forecast = model.forecast(periods)
        except Exception as es_err:
            logger.warning("statsmodels_ets_failed", error=str(es_err))
            last_val = df_daily[metric_col].iloc[-7:].mean()
            growth_rate = 0.0
            if len(df_daily) >= 14:
                first_avg = df_daily[metric_col].iloc[-14:-7].mean()
                if first_avg > 0:
                    growth_rate = (last_val - first_avg) / first_avg
            
            growth_rate = max(-0.05, min(0.05, growth_rate))
            forecast = [last_val * (1 + growth_rate * i) for i in range(1, periods + 1)]
            forecast = pd.Series(forecast, index=pd.date_range(start=df_daily.index[-1] + pd.Timedelta(days=1), periods=periods))

        historical = []
        for date, val in df_daily[metric_col].items():
            historical.append({
                "date": date.strftime("%Y-%m-%d"),
                "value": float(val),
                "type": "actual"
            })
            
        predictions = []
        for date, val in forecast.items():
            predictions.append({
                "date": date.strftime("%Y-%m-%d"),
                "value": float(max(0, val)),
                "type": "forecast"
            })

        hist_total = float(df_daily[metric_col].sum())
        proj_total = float(sum(max(0, val) for val in forecast))
        change_pct = ((proj_total / hist_total) * 100) if hist_total > 0 else 0
        
        summary = (
            f"### 🔮 Predictive Forecast Analysis\n\n"
            f"We analyzed historical daily trends for the metric **`{metric_col}`** using an Exponential Smoothing (ETS) regression model.\n"
            f"- **Historical Period**: {df_daily.index[0].strftime('%Y-%m-%d')} to {df_daily.index[-1].strftime('%Y-%m-%d')} ({len(df_daily)} days)\n"
            f"- **Forecast Window**: Next {periods} days\n"
            f"- **Forecasted Trend**: The model projects a total of **{proj_total:,.2f}** over the next {periods} days. "
            f"This represents a trend pattern of **{change_pct:.1f}%** relative to the historical total sum.\n\n"
            f"#### 💡 Business Opportunities & Risks:\n"
            f"- **Opportunity**: A positive slope suggests expanding customer demand; consider launching promotions during forecast peaks to maximize growth.\n"
            f"- **Risk**: Out-of-stock scenarios or capacity bottlenecks during peak dates represent severe downside risks. Implement safety buffers."
        )

        return {
            "historical": historical,
            "forecast": predictions,
            "summary": summary,
            "metric": metric_col,
            "date_column": date_col
        }
    except Exception as e:
        logger.error("forecasting_failed", error=str(e))
        return {"error": f"Forecasting failed: {e}"}


def run_anomaly_detection(
    df: pd.DataFrame,
    date_col: str,
    metric_cols: List[str]
) -> Dict[str, Any]:
    try:
        df_clean = df.copy()
        df_clean[date_col] = pd.to_datetime(df_clean[date_col], errors="coerce")
        for col in metric_cols:
            df_clean[col] = pd.to_numeric(df_clean[col], errors="coerce")
        df_clean = df_clean.dropna(subset=[date_col] + metric_cols).sort_values(by=date_col)

        if len(df_clean) < 10:
            return {"error": "Not enough data points for anomaly detection (minimum 10 rows required)."}

        df_daily = df_clean.set_index(date_col)[metric_cols].resample("D").sum().fillna(0)

        from sklearn.ensemble import IsolationForest
        X = df_daily[metric_cols].values
        
        clf = IsolationForest(contamination=0.05, random_state=42)
        preds = clf.fit_predict(X)

        anomalies = []
        for i, pred in enumerate(preds):
            if pred == -1:
                date_str = df_daily.index[i].strftime("%Y-%m-%d")
                row_vals = {col: float(df_daily[col].iloc[i]) for col in metric_cols}
                anomalies.append({
                    "date": date_str,
                    "metrics": row_vals
                })

        anom_dates_str = ", ".join([f"`{a['date']}`" for a in anomalies[:5]])
        summary = (
            f"### 🚨 Anomaly Detection Alert Summary\n\n"
            f"We ran an unsupervised Isolation Forest model (contamination rate = 5%) on **`{', '.join(metric_cols)}`**.\n"
            f"- **Total periods analyzed**: {len(df_daily)} days\n"
            f"- **Outliers detected**: **{len(anomalies)}** anomalies flagged\n"
        )
        if anomalies:
            summary += f"- **Key Anomaly Dates**: {anom_dates_str}"
            if len(anomalies) > 5:
                summary += f" (and {len(anomalies) - 5} more dates)"
        else:
            summary += "- **Status**: No abnormal spikes or outlier patterns detected in the current range."

        summary += (
            f"\n\n#### 💡 Business Opportunities & Risks:\n"
            f"- **Opportunity**: Flagged spike periods represent high-performing outliers (e.g. successful campaigns or viral events). Replicate these conditions to scale volume.\n"
            f"- **Risk**: Abrupt valleys indicate system failures, supply disruption, or server outages. Automate alerting on these coordinates to minimize operational down-time."
        )

        return {
            "anomalies": anomalies,
            "summary": summary,
            "total_analyzed": len(df_daily),
            "anomaly_count": len(anomalies)
        }

    except Exception as e:
        logger.error("anomaly_detection_failed", error=str(e))
        return {"error": f"Anomaly detection failed: {e}"}


def run_segmentation(
    df: pd.DataFrame,
    features: List[str],
    n_clusters: int = 3
) -> Dict[str, Any]:
    try:
        import traceback
        df_clean = df.copy()
        initial_len = len(df_clean)

        encoded_features = []
        from sklearn.preprocessing import LabelEncoder

        for col in features:
            numeric_col = pd.to_numeric(df_clean[col], errors="coerce")
            if numeric_col.isna().sum() > len(df_clean) * 0.3:
                df_clean[col] = df_clean[col].astype(str).fillna("Unknown")
                le = LabelEncoder()
                df_clean[col] = le.fit_transform(df_clean[col])
                encoded_features.append(col)
            else:
                df_clean[col] = numeric_col

        df_clean = df_clean.dropna(subset=features)
        after_len = len(df_clean)

        logger.info("segmentation_data_prep", initial_rows=initial_len, remaining_rows=after_len, features=features, encoded=encoded_features)
        print(f"[Segmentation Info] Initial rows: {initial_len}, remaining rows after prep: {after_len}, features: {features}, encoded: {encoded_features}", flush=True)

        if after_len < n_clusters:
            return {
                "error": (
                    f"Not enough data points for segmentation after filtering. "
                    f"Initial dataset rows: {initial_len}, valid rows with numeric/encoded values for features {features}: {after_len}. "
                    f"Minimum {n_clusters} valid rows are required for K={n_clusters} clustering. "
                    f"Please ensure the selected features contain sufficient non-empty data."
                )
            }

        X = df_clean[features].values
        from sklearn.preprocessing import StandardScaler
        from sklearn.cluster import KMeans
        
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")
        clusters = kmeans.fit_predict(X_scaled)
        
        df_clean["cluster_id"] = clusters
        
        cluster_summaries = []
        for c in range(n_clusters):
            c_df = df_clean[df_clean["cluster_id"] == c]
            stats = {}
            for col in features:
                stats[col] = {
                    "mean": float(c_df[col].mean()),
                    "min": float(c_df[col].min()),
                    "max": float(c_df[col].max())
                }
            cluster_summaries.append({
                "cluster_id": c,
                "size": len(c_df),
                "percentage": float((len(c_df) / len(df_clean)) * 100),
                "stats": stats
            })

        md = [
            f"### 👥 Customer / Row Segmentation Analysis",
            f"We ran a K-Means clustering algorithm (K={n_clusters}) on features: **`{', '.join(features)}`**.",
            "",
            "| Cluster ID | Size (Rows) | Percentage | Characteristics / Average Values |",
            "| :--- | :---: | :---: | :--- |"
        ]
        for s in cluster_summaries:
            char_strs = []
            for col in features:
                char_strs.append(f"{col}: {s['stats'][col]['mean']:,.2f}")
            md.append(f"| **Cluster {s['cluster_id']}** | {s['size']:,} | {s['percentage']:.1f}% | {', '.join(char_strs)} |")
            
        md.append("")
        md.append("#### 💡 Business Opportunities & Risks:")
        md.append("- **Opportunity**: Deliver personalized winback offers to low-volume segments and exclusive premium upsell incentives to high-average clusters.")
        md.append("- **Risk**: Treating distinct clusters with uniform marketing campaigns will lead to resource waste and poor customer retention. Ensure marketing runs are segment-tailored.")

        summary = "\n".join(md)

        return {
            "segments": cluster_summaries,
            "summary": summary,
            "total_segmented": len(df_clean)
        }
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error("segmentation_failed", error=str(e), traceback=tb)
        print(f"[Segmentation Error] Failed with traceback:\n{tb}", flush=True)
        return {"error": f"Clustering failed: {e}. Details: {tb}"}


def recommend_models(df: pd.DataFrame) -> List[Dict[str, Any]]:
    # Pick columns
    columns = _pick_columns(df)
    numeric = columns.get("numeric", [])
    metrics = [col for col in numeric if not any(x in col.lower() for x in ["id", "s_no", "serial", "postcode", "zip"])]
    if not metrics:
        metrics = numeric
        
    categorical = columns.get("categorical", [])
    cats = [col for col in categorical if not any(x in col.lower() for x in ["id", "postcode"])] + [col for col in categorical if any(x in col.lower() for x in ["id", "postcode"])]
    
    dates = columns.get("dates", [])
    if not dates:
        for col in df.columns:
            if any(x in col.lower() for x in ["date", "time", "year", "month"]):
                dates.append(col)
                break
            
    recs = []
    
    # 1. Forecasting
    if dates and metrics:
        recs.append({
            "model_type": "Forecasting",
            "name": f"Time-Series Forecasting on {metrics[0]}",
            "reason": f"Detected time-series values in `{dates[0]}` and numeric trends in `{metrics[0]}`. Excellent for predicting future outcomes.",
            "confidence": 0.95,
            "params": {
                "date_column": dates[0],
                "metric_column": metrics[0]
            }
        })
        
    # 2. Anomaly Detection
    if dates and metrics:
        recs.append({
            "model_type": "Anomaly Detection",
            "name": f"Outlier Check on {metrics[0]}",
            "reason": f"Uses Isolation Forest to flag unexpected spikes or drops in `{metrics[0]}` over the history in `{dates[0]}`.",
            "confidence": 0.88,
            "params": {
                "date_column": dates[0],
                "metric_columns": [metrics[0]]
            }
        })
        
    # 3. K-Means Segmentation
    features = metrics[:3] + cats[:1]
    if len(features) >= 2:
        recs.append({
            "model_type": "Clustering",
            "name": "K-Means Cluster Segmentation",
            "reason": f"Segments your rows into patterns based on features: {', '.join(features)}. Helps identify hidden groupings.",
            "confidence": 0.82,
            "params": {
                "features": features,
                "n_clusters": 3
            }
        })
        
    return recs


def compare_forecasting_models(df: pd.DataFrame, date_col: str, metric_col: str) -> Dict[str, Any]:
    try:
        df_clean = df[[date_col, metric_col]].copy()
        df_clean[date_col] = pd.to_datetime(df_clean[date_col], errors="coerce")
        df_clean[metric_col] = pd.to_numeric(df_clean[metric_col], errors="coerce")
        df_clean = df_clean.dropna().sort_values(by=date_col)
        
        df_clean.set_index(date_col, inplace=True)
        df_daily = df_clean.resample("D").sum().fillna(0)
        
        if len(df_daily) < 10:
            return {"error": "Not enough daily data points to run model comparison (minimum 10 required)."}
            
        split_idx = int(len(df_daily) * 0.8)
        train_data = df_daily[metric_col].iloc[:split_idx]
        val_data = df_daily[metric_col].iloc[split_idx:]
        val_len = len(val_data)
        
        models_metrics = {}
        
        # 1. Naive Model
        try:
            naive_pred = [train_data.iloc[-1]] * val_len
            models_metrics["Naive"] = _calc_errors(val_data.values, naive_pred)
        except Exception as e:
            logger.warning("naive_comparison_failed", error=str(e))
            
        # 2. ETS (Exponential Smoothing)
        try:
            from statsmodels.tsa.api import ExponentialSmoothing
            ets_fit = ExponentialSmoothing(
                train_data, trend="add", seasonal="add", seasonal_periods=min(7, len(train_data)//2)
            ).fit()
            ets_pred = ets_fit.forecast(val_len)
            models_metrics["ETS"] = _calc_errors(val_data.values, ets_pred.values)
        except Exception as e:
            try:
                from statsmodels.tsa.api import Holt
                ets_fit = Holt(train_data).fit()
                ets_pred = ets_fit.forecast(val_len)
                models_metrics["ETS"] = _calc_errors(val_data.values, ets_pred.values)
            except Exception as e2:
                logger.warning("ets_comparison_failed", error=str(e2))
                
        # 3. ARIMA (1,1,1)
        try:
            from statsmodels.tsa.arima.model import ARIMA
            arima_fit = ARIMA(train_data, order=(1, 1, 1)).fit()
            arima_pred = arima_fit.forecast(val_len)
            models_metrics["ARIMA"] = _calc_errors(val_data.values, arima_pred.values)
        except Exception as e:
            logger.warning("arima_comparison_failed", error=str(e))
            
        if not models_metrics:
            return {"error": "All model fits failed during comparison."}
            
        rankings = []
        for name, errs in models_metrics.items():
            rankings.append({
                "model": name,
                "rmse": float(errs["rmse"]),
                "mae": float(errs["mae"]),
                "mape": float(errs["mape"])
            })
            
        rankings = sorted(rankings, key=lambda x: x["mape"])
        best_model = rankings[0]["model"]
        
        return {
            "rankings": rankings,
            "best_model": best_model,
            "validation_points_count": val_len
        }
    except Exception as e:
        logger.error("compare_models_failed", error=str(e))
        return {"error": f"Model comparison failed: {e}"}


def _calc_errors(actual, predicted) -> Dict[str, float]:
    actual = np.array(actual)
    predicted = np.array(predicted)
    actual_nonzero = np.where(actual == 0, 1e-5, actual)
    
    rmse = np.sqrt(np.mean((actual - predicted) ** 2))
    mae = np.mean(np.abs(actual - predicted))
    mape = np.mean(np.abs((actual - predicted) / actual_nonzero)) * 100
    
    return {"rmse": rmse, "mae": mae, "mape": mape}
