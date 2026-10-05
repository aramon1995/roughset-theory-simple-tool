"""FastAPI application exposing the rough-set analysis as a small web
service with a static HTML visualization layer.

Endpoints
---------
GET  /                      -> serves the static single-page UI
GET  /api/datasets          -> lists the bundled sample datasets
GET  /api/datasets/{key}    -> returns the CSV text + metadata for one
                                sample dataset
POST /api/upload            -> parses an uploaded CSV file and returns its
                                columns + a preview (no analysis yet)
POST /api/analyze           -> runs the rough-set analysis (lower/upper
                                approximation of every decision class) over
                                a CSV payload and returns a JSON result
                                ready to be rendered by the UI
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import datasets, rough_sets

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Rough Set Theory POC", version="0.1.0")


class AnalyzeRequest(BaseModel):
    csv_text: str
    decision_attribute: str
    condition_attributes: Optional[list[str]] = None
    bins: int = 4


def _dataframe_preview(df: pd.DataFrame, limit: int = 25) -> list[dict]:
    preview = df.head(limit).copy()
    return preview.astype(object).where(preview.notna(), None).to_dict(orient="records")


def _id_like_columns(df: pd.DataFrame) -> list[str]:
    """Columns whose values are unique per row (e.g. Patient/Day ids).

    These are poor condition attributes for rough-set analysis: if included
    they make IND(C) trivial (every equivalence class is a singleton, so
    the lower approximation always equals the target class exactly). The
    UI uses this to default them to *unchecked* instead of excluding them
    outright, so the user can still opt in.
    """
    if len(df) == 0:
        return []
    return [c for c in df.columns if df[c].nunique(dropna=False) == len(df)]


@app.get("/api/datasets")
def api_list_datasets():
    return {"datasets": datasets.list_datasets()}


@app.get("/api/datasets/{key}")
def api_get_dataset(key: str):
    try:
        ds = datasets.get_dataset(key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    df = datasets.read_csv_text(ds.csv_text)
    return {
        "key": ds.key,
        "name": ds.name,
        "description": ds.description,
        "decision_attribute": ds.decision_attribute,
        "suggested_bins": ds.suggested_bins,
        "csv_text": ds.csv_text,
        "columns": list(df.columns),
        "row_count": len(df),
        "preview": _dataframe_preview(df),
        "id_like_columns": _id_like_columns(df),
    }


@app.post("/api/upload")
async def api_upload(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
        df = pd.read_csv(io.StringIO(text))
    except Exception as exc:  # noqa: BLE001 - surfaced to the client as 400
        raise HTTPException(status_code=400, detail=f"CSV invalido: {exc}") from exc

    if df.empty or len(df.columns) < 2:
        raise HTTPException(
            status_code=400,
            detail="El CSV debe tener al menos 2 columnas (condiciones + decision) y 1 fila.",
        )

    return {
        "csv_text": text,
        "columns": list(df.columns),
        "row_count": len(df),
        "preview": _dataframe_preview(df),
        "decision_attribute": df.columns[-1],
        "id_like_columns": _id_like_columns(df),
    }


@app.post("/api/analyze")
def api_analyze(payload: AnalyzeRequest):
    try:
        df = datasets.read_csv_text(payload.csv_text)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"CSV invalido: {exc}") from exc

    if payload.decision_attribute not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Columna decision '{payload.decision_attribute}' no existe en el CSV.",
        )

    condition_attributes = payload.condition_attributes or [
        c for c in df.columns if c != payload.decision_attribute
    ]
    missing = [c for c in condition_attributes if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Columnas no encontradas: {missing}")
    if payload.bins < 2 or payload.bins > 20:
        raise HTTPException(status_code=400, detail="bins debe estar entre 2 y 20.")

    try:
        result = rough_sets.analyze(
            df,
            condition_attributes=condition_attributes,
            decision_attribute=payload.decision_attribute,
            bins=payload.bins,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Region classification (lower / boundary / negative) of every object,
    # per decision class value -- drives the colored-grid visualization.
    region_by_class: dict[int, dict[str, str]] = {i: {} for i in range(len(df))}
    for cls in result.classes:
        lower_set = set(cls.lower_approximation)
        upper_set = set(cls.upper_approximation)
        for obj_id in range(len(df)):
            if obj_id in lower_set:
                region = "lower"
            elif obj_id in upper_set:
                region = "boundary"
            else:
                region = "negative"
            region_by_class[obj_id][str(cls.value)] = region

    decision_values = df[payload.decision_attribute].astype(str).tolist()
    class_values = [cls.value for cls in result.classes]
    membership_map = rough_sets.compute_rough_membership(
        result.equivalence_classes, decision_values, class_values
    )

    rows = []
    raw_records = _dataframe_preview(df, limit=len(df))
    for obj_id, record in enumerate(raw_records):
        rows.append(
            {
                "id": obj_id,
                "values": record,
                "regions": region_by_class[obj_id],
                "membership": membership_map.get(obj_id, {}),
            }
        )

    overlap = rough_sets.compute_class_overlap(result.classes)
    n_classes = len(result.classes)
    if n_classes <= 1:
        overlap_mode = "single"
    elif n_classes == 2:
        overlap_mode = "venn2"
    elif n_classes == 3:
        overlap_mode = "venn3"
    else:
        overlap_mode = "upset"

    discernibility = rough_sets.compute_discernibility(
        result.condition_values, result.condition_attributes, decision_values
    )

    granules = []
    for eq in result.equivalence_classes:
        members = eq["objects"]
        counts: dict[str, int] = {}
        for obj_id in members:
            value = decision_values[obj_id]
            counts[value] = counts.get(value, 0) + 1
        granules.append(
            {
                "signature": eq["signature"],
                "objects": members,
                "size": len(members),
                "composition": counts,
            }
        )
    granules.sort(key=lambda g: -g["size"])

    return {
        "universe_size": result.universe_size,
        "condition_attributes": result.condition_attributes,
        "decision_attribute": result.decision_attribute,
        "discretization": result.discretization,
        "equivalence_class_count": result.equivalence_class_count,
        "equivalence_classes": result.equivalence_classes,
        "quality_of_classification": result.quality_of_classification,
        "positive_region_size": len(result.positive_region),
        "classes": [
            {
                "value": cls.value,
                "size": cls.size,
                "lower_size": len(cls.lower_approximation),
                "upper_size": len(cls.upper_approximation),
                "boundary_size": len(cls.boundary),
                "accuracy": cls.accuracy,
                "objects": cls.objects,
                "lower_approximation": cls.lower_approximation,
                "upper_approximation": cls.upper_approximation,
                "boundary": cls.boundary,
            }
            for cls in result.classes
        ],
        "rows": rows,
        "class_overlap": {
            "mode": overlap_mode,
            "class_values": overlap["class_values"],
            "regions": overlap["regions"],
        },
        "discernibility": discernibility,
        "granules": granules,
    }


@app.post("/api/reducts")
def api_reducts(payload: AnalyzeRequest):
    try:
        df = datasets.read_csv_text(payload.csv_text)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"CSV invalido: {exc}") from exc

    if payload.decision_attribute not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Columna decision '{payload.decision_attribute}' no existe en el CSV.",
        )

    condition_attributes = payload.condition_attributes or [
        c for c in df.columns if c != payload.decision_attribute
    ]
    missing = [c for c in condition_attributes if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Columnas no encontradas: {missing}")
    if payload.bins < 2 or payload.bins > 20:
        raise HTTPException(status_code=400, detail="bins debe estar entre 2 y 20.")

    try:
        exploration = rough_sets.explore_reducts(
            df,
            condition_attributes=condition_attributes,
            decision_attribute=payload.decision_attribute,
            bins=payload.bins,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return exploration



app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def index():
    return FileResponse(str(STATIC_DIR / "index.html"))
