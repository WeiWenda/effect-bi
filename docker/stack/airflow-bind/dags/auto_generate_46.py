"""ETL DAG — runtime dependency polling + main + optional quality.
Logical task: 退货事实加载
Version id: 1
Registered via globals()[dag_id] so Airflow picks up the DAG at parse time.
"""
from __future__ import annotations

import json
import os
import random
import re
import time
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    from airflow.decorators import dag, task
except ImportError:  # pragma: no cover — Airflow 3 Task SDK
    from airflow.sdk import dag, task  # type: ignore

# start_date: use stdlib datetime only (Airflow 3 may remove airflow.utils.dates.days_ago)

RUNTIME_DEPS_JSON = json.loads("{\"runtimeDependencies\":[{\"table\":\"fact_orders\",\"catalog\":\"localpg\",\"database\":\"demo\",\"partition\":\"-1 day\",\"secondaryPartitions\":\"\"},{\"table\":\"fact_order_lines\",\"catalog\":\"localpg\",\"database\":\"demo\",\"partition\":\"-1 day\",\"secondaryPartitions\":\"\"}]}")
QUALITY_RULES_JSON = json.loads("{\"rules\":[],\"sqlQueries\":[]}")
CRON_EXPRESSION = "0 0 * * *"
ALERT_RULES_JSON = json.loads("[]")

ETL_BACKEND_URL = os.environ.get("ETL_BACKEND_URL", "http://host.docker.internal:3001")
ETL_TASK_VERSION_ID = 1

def _post_json(path: str, payload: dict) -> dict:
    url = ETL_BACKEND_URL.rstrip("/") + path
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))

def _patch_json(path: str, payload: dict) -> dict:
    url = ETL_BACKEND_URL.rstrip("/") + path
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="PATCH")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))

def _resolve_partition_key(partition_expr: str, logical_iso: str) -> str:
    expr = (partition_expr or "").strip()
    m = re.match(r"^-\s*(\d+)\s*day$", expr, re.I)
    if m:
        n = int(m.group(1))
        d = datetime.fromisoformat(logical_iso.replace("Z", "+00:00"))
        d = d.astimezone(timezone.utc) - timedelta(days=n)
        return d.strftime("%Y-%m-%d")
    if re.match(r"^\d{4}-\d{2}-\d{2}$", expr):
        return expr
    return expr

def _normalize_secondary(raw: str) -> str:
    parts = sorted({p.strip() for p in (raw or "").split(",") if p.strip()})
    return ",".join(parts)

def _poll_upstream_ready(dep: dict, logical_iso: str) -> None:
    body = {
        "database": (dep.get("database") or dep.get("schema") or ""),
        "table": dep.get("table") or "",
        "partition": dep.get("partition") or "",
        "secondaryPartitions": dep.get("secondaryPartitions") or "",
        "logicalDate": logical_iso,
    }
    catalog = dep.get("catalog")
    if isinstance(catalog, str) and catalog.strip():
        body["catalog"] = catalog.strip()
    path = "/api/etl/runtime-deps/check-ready"
    while True:
        data = _post_json(path, body)
        if data.get("ready") is True:
            return
        time.sleep(10)

@dag(
    dag_id="auto_generate_46",
    schedule="0 0 * * *",
    start_date=datetime(2026, 5, 6, tzinfo=timezone.utc),
    catchup=False,
    default_args={
        "owner": "etl",
        "depends_on_past": False,
        "email_on_failure": False,
        "retries": 1,
        "retry_delay": timedelta(minutes=1),
    },
    tags=["etl", "data_dependency", "quality", "generated", "task_sdk"],
)
def auto_generate_46_workflow():
    @task(task_id="check_dep_0_ready")
    def check_dep_0_ready(**ctx) -> None:
        dep = json.loads("{\"table\":\"fact_orders\",\"catalog\":\"localpg\",\"database\":\"demo\",\"partition\":\"-1 day\",\"secondaryPartitions\":\"\"}")
        logical_iso = ctx["data_interval_end"].isoformat()
        _poll_upstream_ready(dep, logical_iso)

    @task(task_id="check_dep_1_ready")
    def check_dep_1_ready(**ctx) -> None:
        dep = json.loads("{\"table\":\"fact_order_lines\",\"catalog\":\"localpg\",\"database\":\"demo\",\"partition\":\"-1 day\",\"secondaryPartitions\":\"\"}")
        logical_iso = ctx["data_interval_end"].isoformat()
        _poll_upstream_ready(dep, logical_iso)

    @task(task_id="main_transform")
    def main_transform(**ctx) -> None:
        logical_iso = ctx["data_interval_end"].isoformat()
        partition_date = ctx["data_interval_end"].strftime("%Y-%m-%d")
        out_expr = "-1 day"
        resolved_primary = _resolve_partition_key(out_expr, logical_iso)
        sec_raw = ""
        secondary_norm = _normalize_secondary(sec_raw)
        dr = ctx.get("dag_run")
        start_body = {
            "etlTaskVersionId": ETL_TASK_VERSION_ID,
            "partitionDate": partition_date,
            "airflowDagId": getattr(dr, "dag_id", "") if dr else "",
            "airflowRunId": ctx.get("run_id") or (getattr(dr, "run_id", "") if dr else ""),
            "airflowTaskId": "main_transform",
            "tryNumber": ctx.get("ti").try_number if ctx.get("ti") else 1,
            "logicalPartitionLabel": resolved_primary,
            "startedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        start = _post_json("/api/etl/task-runs/start", start_body)
        tid = start["taskInstanceId"]
        # ----- Simulated transform: random 1-3 min + 25% fail (Node PATCH complete failed, then retry) -----
        # Replace with real transform (Trino / Spark); SQL reference below
        # -- ETL 任务 SQL
        # SELECT 1
        # ---------------------------------------------------------------------
        sleep_sec = random.randint(60, 180)
        time.sleep(sleep_sec)
        if random.random() < 0.25:
            err = "Simulated main_transform failure (probability 0.25); DAG default_args retries apply."
            fail_body = {
                "status": "failed",
                "endedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "errorMessage": err,
            }
            _patch_json(f"/api/etl/task-runs/{tid}/complete", fail_body)
            raise RuntimeError(err)
        end_body = {
            "status": "success",
            "endedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "resolvedPrimaryPartitionKey": resolved_primary,
            "resolvedSecondaryPartitionKey": secondary_norm,
        }
        _patch_json(f"/api/etl/task-runs/{tid}/complete", end_body)

    t_chk_0 = check_dep_0_ready()
    t_chk_1 = check_dep_1_ready()
    t_main = main_transform()
    t_chk_0 >> t_main
    t_chk_1 >> t_main

globals()["auto_generate_46"] = auto_generate_46_workflow()
