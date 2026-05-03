"""
FastAPI service: generates Airflow DAG Python source in Task SDK–friendly layout.
Run from repo root: cd services/etl-dag-service && uvicorn app.main:app --host 127.0.0.1 --port 8790
Node backend: ETL_DAG_PY_SERVICE_URL=http://127.0.0.1:8790
"""
from __future__ import annotations

import json
import re
from datetime import timedelta
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="ETL DAG Generator", version="0.1.0")


class DagGenerateRequest(BaseModel):
    versionId: int
    logicalName: str
    sqlMain: str = ""
    airflowOptions: dict[str, Any] = Field(default_factory=dict)
    qualityRules: list[Any] = Field(default_factory=list)
    graphJson: Any = None


def _slug(name: str, version_id: int) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_]+", "_", name).strip("_") or "task"
    return f"etl_{safe}_{version_id}"


def _sql_as_comments(sql: str) -> str:
    if not sql.strip():
        return "# (empty SQL)"
    return "\n".join(f"# {line}" for line in sql.replace("\r\n", "\n").split("\n"))


def _render_dag_py(req: DagGenerateRequest, dag_id: str) -> str:
    opts = req.airflowOptions or {}
    retries = int(opts.get("retries", 1))
    retry_delay_minutes = int(opts.get("retryDelayMinutes", 5))
    email_on_failure = bool(opts.get("emailOnFailure", False))
    owner = str(opts.get("owner", "etl"))[:64]
    graph_obj: dict[str, Any] = req.graphJson if isinstance(req.graphJson, dict) else {}
    graph_literal = json.dumps(graph_obj, ensure_ascii=False)
    quality_literal = json.dumps(req.qualityRules or [], ensure_ascii=False)
    dag_id_lit = json.dumps(dag_id)
    owner_lit = json.dumps(owner)
    sql_comments = _sql_as_comments(req.sqlMain)
    fn_name = f"{dag_id}_workflow"

    return f'''"""ETL DAG — data dependency & quality monitoring (distinct from lineage dag_views).
Logical task: {req.logicalName}
Version id: {req.versionId}
"""
from __future__ import annotations

from datetime import datetime, timedelta

try:
    from airflow.sdk import dag, task
except ImportError:  # pragma: no cover
    from airflow.decorators import dag, task  # type: ignore

GRAPH_JSON = {graph_literal}
QUALITY_RULES_JSON = {quality_literal}


@dag(
    dag_id={dag_id_lit},
    schedule=None,
    start_date=datetime(2024, 1, 1),
    catchup=False,
    default_args={{
        "owner": {owner_lit},
        "depends_on_past": False,
        "email_on_failure": {repr(email_on_failure)},
        "retries": {retries},
        "retry_delay": timedelta(minutes={retry_delay_minutes}),
    }},
    tags=["etl", "data_dependency", "quality", "generated"],
)
def {fn_name}():
    @task(task_id="data_dependency_gate")
    def data_dependency_gate() -> None:
        """Use GRAPH_JSON for upstream sensors / lineage checks (not dag_views)."""
        _ = GRAPH_JSON
        return None

    @task(task_id="quality_monitors")
    def quality_monitors() -> None:
        """Use QUALITY_RULES_JSON for SQL checks / metrics."""
        _ = QUALITY_RULES_JSON
        return None

    @task(task_id="main_transform_stub")
    def main_transform_stub() -> None:
        """Replace with TrinoOperator / SparkSubmitOperator wired to main SQL."""
{sql_comments}
        return None

    data_dependency_gate() >> quality_monitors() >> main_transform_stub()


dag_instance = {fn_name}()
'''


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/dag/generate")
def generate_dag(req: DagGenerateRequest) -> dict[str, str]:
    dag_id = _slug(req.logicalName, req.versionId)
    source = _render_dag_py(req, dag_id)
    return {"dagId": dag_id, "pythonSource": source, "format": "task_sdk_style"}
