# MCP 工具详解

## 一、MCP Server 概述

MCP (Model Context Protocol) 是一种让 AI 模型能够调用外部工具的协议。在实际应用中：
- `MultiServerMCPClient` 负责管理多个 MCP Server
- 每个 MCP Server 提供一组特定的工具（tools）
- AI 可以根据需求调用这些工具来完成复杂任务

## 二、MCP Server 启动方式对比

| MCP Server | 启动方式 | 位置 | 用途 |
|-----------|---------|------|------|
| `filesystem` | npx | 本地进程 | 文件读写 |
| `chrome-devtools` | npx | 本地进程 | 浏览器控制 |
| `amap-maps` | HTTP URL | 远程服务 | 地图数据 |
| `my-mcp-server` | node | 本地进程 | 自定义功能 |

### 2.1 npx 启动方式详解

**npx 的两大功能：**
1. **下载**：如果本地没有缓存，自动从 npm 下载包
2. **执行**：直接运行包中的可执行文件

**工作流程：**
```
代码启动 MCP Server
    ↓
npx 查找本地缓存（~/.npm/_npx/）
    ↓
    ├─ 有缓存 → 直接执行 ✅
    └─ 无缓存 → 下载到缓存 → 执行
```

**关键特性：**
- **首次运行**：下载 + 缓存 + 执行
- **后续运行**：直接使用缓存执行（不会重复下载）
- **`-y` 参数**：自动确认，跳过安装提示
- **缓存位置**：`~/.npm/_npx/` 或 `~/.npm/_cacache/`（取决于 npm 版本）

**何时会重新下载？**
- 包版本更新（如 `chrome-devtools-mcp@latest` 有新版本）
- 手动清理了 npm 缓存（`npm cache clean --force`）
- 缓存文件损坏

**性能优势：**
- 无需全局安装，节省磁盘空间
- 每个项目无需在 `node_modules` 中安装 MCP Server 包
- 多个项目共享缓存，只下载一次

## 三、filesystem MCP

### 3.1 基本信息
- **官方包**：`@modelcontextprotocol/server-filesystem`
- **启动方式**：通过 npx 自动下载并启动
- **作用**：让 AI 能够读写本地文件系统

### 3.2 配置示例
```javascript
"filesystem": {
    "command": "npx",
    "args": [
        "-y",  // 自动确认安装
        "@modelcontextprotocol/server-filesystem",
        ...(process.env.ALLOWED_PATHS.split(',') || [])  // 允许访问的路径
    ]
}
```

### 3.3 提供的工具
- `read_file` - 读取文件
- `write_file` - 写入文件
- `list_directory` - 列出目录
- `create_directory` - 创建目录
- `move_file` - 移动文件
- `delete_file` - 删除文件
- `search_files` - 搜索文件

### 3.4 为什么用官方 filesystem？

**优势：**
1. **开箱即用**：功能完整，无需自己实现所有文件操作
2. **安全性好**：通过 `ALLOWED_PATHS` 限制访问范围，防止误删系统文件
3. **标准化**：MCP 生态的标准实现，易于维护

**何时需要自定义？**
- 需要加密后再保存文件
- 需要上传到云存储（OSS、S3）
- 需要特殊的文件格式处理

## 四、chrome-devtools MCP

### 4.1 基本信息
- **第三方包**：`chrome-devtools-mcp`
- **启动方式**：通过 npx 启动最新版本
- **作用**：让 AI 能够控制 Chrome 浏览器

### 4.2 配置示例
```javascript
"chrome-devtools": {
    "command": "npx",
    "args": [
        "-y",
        "chrome-devtools-mcp@latest"  // 总是使用最新版本
    ]
}
```

### 4.3 提供的能力
- 打开浏览器标签页
- 修改页面 DOM（如修改标题）
- 页面截图
- 执行 JavaScript 代码
- 浏览器自动化操作

### 4.4 使用场景示例
```javascript
// 需求：打开浏览器，展示每个酒店的图片，每个 tab 一个 url，
// 并且把页面标题改为酒店名
await runAgentWithTools(
    "北京南站附近的酒店，最近的 3 个酒店，拿到酒店图片，" +
    "打开浏览器，展示每个酒店的图片，每个 tab 一个 url 展示，" +
    "并且在把那个页面标题改为酒店名"
);
```

## 五、amap-maps-streamableHTTP MCP

### 5.1 基本信息
- **提供方**：高德地图官方
- **启动方式**：通过 HTTP URL 连接远程服务（不是本地进程）
- **作用**：提供地图搜索、路线规划等功能

### 5.2 配置示例
```javascript
"amap-maps-streamableHTTP": {
    "url": "https://mcp.amap.com/mcp?key=" + process.env.AMAP_MAPS_API_KEY
}
```

### 5.3 特殊之处：远程 MCP Server

**与本地 MCP 的区别：**
- 本地 MCP（`filesystem`、`chrome-devtools`）：通过 `command` 启动本地进程
- 远程 MCP（`amap-maps`）：通过 `url` 连接远程服务 ✨

### 5.4 提供的功能
1. **POI 搜索**：搜索附近的酒店、餐厅、景点
2. **路线规划**：计算从 A 到 B 的路线
3. **获取详情**：酒店图片、地址、电话等

### 5.5 streamableHTTP 含义
- **HTTP**：通过 HTTP 协议通信
- **streamable**：支持流式返回数据，适合大数据量场景

### 5.6 工作流程示例

```
用户输入：
"北京南站附近的5个酒店，以及去的路线"

↓

AI 调用 amap MCP 工具：
- search_nearby → 搜索北京南站附近的酒店
- route_plan → 规划到每个酒店的路线

↓

高德地图服务器返回结果：
{
  "hotels": [...],
  "routes": [...]
}

↓

AI 整理后回复用户
```

### 5.7 为什么用远程 MCP？

**优势：**
- 无需在本地部署地图服务
- 高德维护服务器，保证数据实时更新
- 多个项目可以共享同一个服务
- 节省本地磁盘空间（无需下载地图数据库）

## 六、总结

### 6.1 MCP 的价值
MCP 让 AI 从"只能说话"变成"能动手做事"，通过标准化的协议接入各种工具：
- 文件操作（filesystem）
- 浏览器控制（chrome-devtools）
- 地图服务（amap-maps）
- 自定义工具（my-mcp-server）

### 6.2 选择建议
- **标准功能**：优先使用官方或成熟的第三方 MCP（如 filesystem）
- **特殊需求**：自定义 MCP Server
- **远程服务**：对于需要大量数据或复杂计算的功能（如地图），使用远程 MCP 更合适

### 6.3 安全性考虑
- filesystem：通过 `ALLOWED_PATHS` 限制访问范围
- 自定义 MCP：需要自己实现权限控制
- 远程 MCP：需要 API Key 认证

---

