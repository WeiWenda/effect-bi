# Effect BI · 数据工作台

面向分析型数据栈的一体化前端：**对话（LangGraph）**、**血缘（Neo4j）**、**Cube 语义层**、**可视化查询与看板**、**ETL / Airflow** 等，由 **React + Vite** 与 **`backend/node`（Express）** 承载主 API；**`backend/langgraph`** 为独立 FastAPI 子模块（Git submodule）。产品与技术说明见 **[docs/README.md](docs/README.md)**。

---

## Quick start

### 克隆与子模块

```bash
git clone --recurse-submodules <你的仓库 URL> effect-bi
cd effect-bi
# 若已克隆但未拉子模块：
git submodule update --init --recursive
```

### 本地开发（推荐）

```bash
npm install
npm run dev:all
```

默认会拉起 Vite、Node 与 LangGraph；LangGraph 环境见 `backend/langgraph/.env.example`。单独前端：`npm run dev`。停止：`npm run dev:stop`。

### Docker 全栈（`docker-compose.stack.yaml`）

```bash
cp docker/stack/env.example docker/stack/.env

bash docker/stack/trino/sync-plugin-from-dev.sh

docker compose --env-file docker/stack/.env -f docker-compose.stack.yaml build
docker compose --env-file docker/stack/.env -f docker-compose.stack.yaml up -d
```

Compose 在解析 YAML 里的 `${VAR:?…}` 时需要这份 env（`service.env_file` 只负责注入容器，不会自动参与变量替换）。若不想写 `--env-file`，也可把同名变量放进仓库根目录的 `.env`，或先在 shell 里 `export`。

默认入口：Web **http://localhost:3001**，LangGraph **8001**，Airflow **8080**，Trino **8088**；更多变量与说明见 **docker-compose.stack.yaml** 文件头注释与 **docker/stack/env.example**。

停止：`docker compose --env-file docker/stack/.env -f docker-compose.stack.yaml down`。

### 单独构建镜像（可选）

```bash
docker build --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim -t effect-bi:local .

docker build -f backend/langgraph/Dockerfile \
  --build-arg PYTHON_IMAGE=docker.m.daocloud.io/library/python:3.13-slim-bookworm \
  --build-arg APT_MIRROR_HOST=mirrors.aliyun.com \
  -t effect-bi-langgraph:latest backend/langgraph
```

---

## 更多文档


| 文档                                                                           | 说明                         |
| ---------------------------------------------------------------------------- | -------------------------- |
| `[docs/README.md](docs/README.md)`                                           | 项目定位、架构与专题设计索引             |
| `[docs/cube-dynamic-model-schema.md](docs/cube-dynamic-model-schema.md)`     | Cube 动态模型 JSON 与字段约定       |
| `[docs/archive-llm-product-prompts.md](docs/archive-llm-product-prompts.md)` | 历史需求 / LLM prompt 存档（非路线图） |


