# Lineage Backend Service

Neo4j 血缘查询后端服务，提供实体搜索和上下游血缘查询接口。

## 安装依赖

```bash
pnpm install
```

## 配置

复制 `.env.example` 为 `.env` 并配置 Neo4j 连接信息：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```
PORT=3001
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
```

## 运行

开发模式（支持热重载）：

```bash
pnpm run dev
```

生产模式：

```bash
pnpm start
```

## API 接口

### 健康检查

```
GET /health
```

### 实体搜索

```
GET /api/lineage/search?q=keyword&limit=10
```

参数：
- `q`: 搜索关键词（必需）
- `limit`: 返回结果数量限制（默认 10）

### 上游血缘查询

```
GET /api/lineage/upstream?entityId=xxx&depth=3
```

参数：
- `entityId`: 实体 ID（必需）
- `depth`: 查询深度（默认 3）

### 下游血缘查询

```
GET /api/lineage/downstream?entityId=xxx&depth=3
```

参数：
- `entityId`: 实体 ID（必需）
- `depth`: 查询深度（默认 3）

### 完整血缘查询

```
GET /api/lineage/full?entityId=xxx&depth=3
```

参数：
- `entityId`: 实体 ID（必需）
- `depth`: 查询深度（默认 3）

## 项目结构

```
backend/
├── src/
│   ├── config/
│   │   └── neo4j.js       # Neo4j 连接配置
│   ├── routes/
│   │   └── lineage.js     # 血缘查询路由
│   └── server.js          # 主服务器文件
├── .env.example           # 环境变量示例
├── .gitignore
├── package.json
└── README.md
```
