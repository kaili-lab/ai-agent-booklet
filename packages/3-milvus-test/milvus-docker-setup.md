# Milvus + Attu Docker 安装启动指南

## 知识定位
本文档在 Milvus 学习体系中的位置：
- **上层**：RAG 系统开发实战
- **本文**：Milvus 本地开发环境搭建
- **下层**：Milvus CRUD 操作（milvus-crud-guide.md）
- **依赖**：需要已安装 Docker Desktop

---

## 一、核心概念理解

### 1.1 为什么使用 Docker Compose？

**单容器 vs Docker Compose**

```
方式1：单容器（嵌入式脚本）
└── milvus (all-in-one)

方式2：Docker Compose（生产推荐）✅
├── milvus-standalone    (Milvus 核心服务)
├── milvus-etcd          (元数据存储)
└── milvus-minio         (对象存储)
```

**为什么选 Docker Compose？**
- ✅ **符合生产架构**：与生产环境架构一致（服务分离）
- ✅ **便于定制配置**：可以独立调整每个组件的资源
- ✅ **更好的可维护性**：可以独立升级、重启某个服务
- ✅ **便于集成其他服务**：如添加 Attu 管理界面

**对比其他安装方式：**
- 嵌入式脚本：适合快速测试，但不便于定制
- Kubernetes：适合生产集群，但本地开发过于复杂

---

### 1.2 为什么需要 3 个容器？

**Milvus 的分层架构**

```
用户应用
    ↓
milvus-standalone (核心服务，端口 19530)
    ├→ milvus-etcd (元数据管理)
    │   └─ 存储：集合 Schema、索引信息、分区信息
    └→ milvus-minio (对象存储)
        └─ 存储：向量数据、日志文件
```

**为什么分离存储？**
- **etcd**：专门存储"描述性数据"（这个集合有哪些字段？）
- **minio**：专门存储"实际数据"（具体的向量值）
- **分离的好处**：可以独立扩容、备份、优化

**启动方式：**
⭐ **一条命令启动所有 3 个容器**：`docker compose up -d`

Docker Compose 会自动：
1. 按依赖顺序启动（先 etcd/minio，再 milvus）
2. 配置容器间网络通信
3. 管理数据持久化卷

---

### 1.3 Milvus 内置 WebUI vs Attu 的区别

| 特性 | 内置 WebUI | Attu |
|------|-----------|------|
| **安装方式** | Milvus 自带 | 需要单独运行容器 |
| **访问地址** | http://127.0.0.1:9091/webui/ | http://localhost:8000 |
| **功能定位** | 基础监控和简单操作 | 专业数据库管理工具 |
| **类比** | MySQL 命令行自带的简单界面 | MySQL Workbench |
| **适用场景** | 快速查看状态 | 日常开发管理 |

**推荐：** 使用 Attu 进行日常开发，它提供可视化 Schema 设计、数据查看、查询执行等专业功能。

---

## 二、前置准备

### 2.1 系统要求

- ✅ **Docker Desktop 已安装**（您已完成）
- ✅ **可用内存**：建议至少 4GB
- ✅ **可用磁盘**：建议至少 10GB

### 2.2 验证 Docker 版本

```bash
docker --version
docker compose version  # 注意：使用 V2 版本（docker compose，不是 docker-compose）
```

**重要**：确保使用 Docker Compose V2（命令是 `docker compose`，不是旧版的 `docker-compose`）

---

## 三、安装 Milvus（Docker Compose 方式）

### 3.1 下载官方配置文件

```bash
# 下载 Milvus 官方 docker-compose.yml（v2.6.8）
wget https://github.com/milvus-io/milvus/releases/download/v2.6.8/milvus-standalone-docker-compose.yml -O docker-compose.yml
```

**配置文件说明：**
这个文件定义了 3 个容器：
1. **milvus-etcd** - 元数据存储（端口 2379）
2. **milvus-minio** - 对象存储（端口 9001）
3. **milvus-standalone** - Milvus 核心服务（端口 19530, 9091）

### 3.2 启动 Milvus（一键启动 3 个容器）

```bash
# 在 docker-compose.yml 所在目录执行
docker compose up -d
```

**这条命令会：**
1. ✅ 拉取 3 个镜像（如果本地没有）
2. ✅ 创建网络和数据卷
3. ✅ **同时启动 3 个容器**（无需分别启动）
4. ✅ 后台运行（`-d` 参数）

### 3.3 验证启动成功

```bash
# 查看运行中的容器（应该看到 3 个）
docker compose ps
```

**预期输出：**
```
NAME                COMMAND                  SERVICE             STATUS
milvus-etcd         etcd ...                 etcd                running
milvus-minio        /usr/bin/docker-entry…   minio               running
milvus-standalone   /tini -- milvus run ...  standalone          running
```

**测试连接：**
```bash
# 访问内置 WebUI（可选）
# 在浏览器打开：http://127.0.0.1:9091/webui/
```

---

## 四、安装 Attu 管理界面

### 4.1 为什么需要修改 docker-compose.yml？

**原因：** 官方配置文件只包含 Milvus，我们需要添加 Attu 容器。

### 4.2 创建完整配置文件（Milvus + Attu）

**方式 1：修改现有文件**
在现有 `docker-compose.yml` 末尾添加 Attu 服务配置：

```yaml
# 在文件末尾添加（注意缩进）
  attu:
    container_name: milvus-attu
    image: zilliz/attu:v2.6
    environment:
      - MILVUS_URL=milvus-standalone:19530
    ports:
      - "8000:3000"
    depends_on:
      - standalone
    networks:
      - milvus
```

**方式 2：使用完整配置文件**
我已在项目中创建了完整的配置文件（见下一步）。

### 4.3 重新启动服务

```bash
# 停止现有服务
docker compose down

# 使用新配置启动（包含 Attu）
docker compose up -d
```

**现在应该有 4 个容器运行：**
- milvus-etcd
- milvus-minio
- milvus-standalone
- milvus-attu ← 新增

### 4.4 访问 Attu 管理界面

1. 打开浏览器，访问：**http://localhost:8000**

2. 首次访问会看到连接配置页面，填写：
   - **Milvus Address**: `milvus-standalone:19530`
   - **Connection Name**: `local-milvus`（自定义名称）

3. 点击 "Connect" 连接成功

**为什么地址是 `milvus-standalone:19530`？**
- Attu 容器和 Milvus 容器在同一个 Docker 网络中
- 使用容器名（milvus-standalone）而不是 localhost
- 端口是 Milvus 的内部端口 19530

---

## 五、完整启动流程（从零开始）

### 5.1 快速启动步骤（推荐使用项目提供的配置文件）

```bash
# 步骤 1: 进入项目目录
cd packages/3-milvus-test

# 步骤 2: 启动所有服务（Milvus + Attu）
docker compose up -d

# 步骤 3: 验证服务状态
docker compose ps

# 步骤 4: 查看启动日志（可选）
docker compose logs -f milvus-standalone

# 步骤 5: 访问 Attu 管理界面
# 浏览器打开：http://localhost:8000
# 连接地址：milvus-standalone:19530
```

**预期结果：**
- ✅ 4 个容器全部运行
- ✅ Attu 界面可以访问
- ✅ Attu 成功连接 Milvus

### 5.2 常用管理命令

```bash
# 启动服务
docker compose up -d

# 停止服务（保留数据）
docker compose stop

# 停止并删除容器（保留数据卷）
docker compose down

# 完全清理（包括数据）⚠️ 谨慎使用
docker compose down -v

# 重启服务
docker compose restart

# 查看日志
docker compose logs -f           # 所有服务
docker compose logs -f standalone # 只看 Milvus

# 查看资源占用
docker stats
```

---

## 六、开发 RAG 应用的准备工作

### 6.1 验证 Node.js 连接

创建测试文件 `test-connection.mjs`：

```javascript
import { MilvusClient } from '@zilliz/milvus2-sdk-node';

const client = new MilvusClient({
  address: 'localhost:19530'  // 注意：应用连接用 localhost
});

async function testConnection() {
  try {
    await client.connectPromise;
    console.log('✓ 成功连接到 Milvus!');

    const version = await client.getVersion();
    console.log('Milvus 版本:', version);
  } catch (error) {
    console.error('连接失败:', error.message);
  }
}

testConnection();
```

**运行测试：**
```bash
node test-connection.mjs
```

**预期输出：**
```
✓ 成功连接到 Milvus!
Milvus 版本: v2.6.x
```

### 6.2 在 Attu 中创建第一个集合

1. 在 Attu 界面点击 "Collections"
2. 点击 "Create Collection"
3. 填写：
   - Collection Name: `test_collection`
   - 添加字段：
     - `id` (VarChar, Primary Key)
     - `vector` (FloatVector, dim=1024)
     - `content` (VarChar)
4. 创建索引（选择 IVF_FLAT）
5. 加载集合（Load Collection）

### 6.3 下一步：开始开发

现在您已经拥有完整的 Milvus 开发环境：
- ✅ Milvus 向量数据库（localhost:19530）
- ✅ Attu 管理界面（http://localhost:8000）
- ✅ 测试连接成功

**后续步骤：**
1. 参考 `milvus-crud-guide.md` 学习 CRUD 操作
2. 参考 `insert.mjs`、`query.mjs` 等示例代码
3. 开始构建您的 RAG 应用

---

## 七、故障排查

### 7.1 端口被占用

**问题：** 启动时报错 "port is already allocated"

**解决方案：**
```bash
# 查看端口占用
netstat -ano | findstr :19530
netstat -ano | findstr :8000

# 修改 docker-compose.yml 中的端口映射
# 例如：将 8000:3000 改为 8001:3000
```

### 7.2 容器启动失败

**问题：** `docker compose ps` 显示容器状态不是 "running"

**解决方案：**
```bash
# 查看详细日志
docker compose logs standalone

# 常见原因：
# 1. 内存不足 → 增加 Docker Desktop 内存限制
# 2. 数据卷损坏 → docker compose down -v 清理后重新启动
```

### 7.3 Attu 无法连接 Milvus

**问题：** Attu 提示 "Connection failed"

**检查清单：**
1. ✅ Milvus 容器是否正在运行：`docker compose ps`
2. ✅ 地址是否正确：应该是 `milvus-standalone:19530`（不是 localhost）
3. ✅ 容器是否在同一网络：`docker network inspect milvus`

### 7.4 数据持久化

**问题：** 重启容器后数据丢失

**原因：** 使用了 `docker compose down -v`（删除了数据卷）

**解决方案：**
- 停止服务用 `docker compose stop` 而不是 `down -v`
- 备份重要数据：数据卷位置在 `./volumes/` 目录

---

## 八、核心认知总结

### 启动流程回顾

```
Docker Compose 启动流程：
docker compose up -d
    ↓
启动 3 个 Milvus 容器
    ├── milvus-etcd (元数据)
    ├── milvus-minio (对象存储)
    └── milvus-standalone (核心服务)
    ↓
启动 1 个 Attu 容器
    └── milvus-attu (管理界面)
    ↓
完成（4 个容器运行中）
```

### 访问地址速查

| 服务 | 地址 | 用途 |
|------|------|------|
| Milvus API | localhost:19530 | 应用程序连接 |
| 内置 WebUI | http://127.0.0.1:9091/webui/ | 简单监控 |
| Attu 管理界面 | http://localhost:8000 | 专业管理 |
| MinIO 控制台 | http://localhost:9001 | 对象存储管理（可选） |

### 关键要点

1. **一条命令启动所有服务**：`docker compose up -d` 会自动启动所有容器
2. **容器间使用容器名通信**：Attu 连接 Milvus 用 `milvus-standalone:19530`
3. **应用连接用 localhost**：Node.js 代码连接用 `localhost:19530`
4. **数据持久化**：数据存储在 `./volumes/` 目录，除非使用 `-v` 参数删除
5. **Attu 是首选管理工具**：提供完整的数据库管理功能

---

## 参考资源

- [Milvus 官方文档 - Docker Compose 安装](https://milvus.io/docs/install_standalone-docker-compose.md)
- [Attu 官方仓库](https://github.com/zilliztech/attu)
- [Attu 快速开始](https://milvus.io/docs/quickstart_with_attu.md)
- [Milvus Docker Hub](https://hub.docker.com/r/milvusdb/milvus)
