# MCP (Model Context Protocol) 学习笔记

## 一、MCP 架构概述

MCP 架构分为三层：

```
┌─────────────────────────────────────┐
│  应用层：LangChain Agent            │  ← 业务逻辑
├─────────────────────────────────────┤
│  客户端层：MultiServerMCPClient     │  ← 管理多个 Server 连接
├─────────────────────────────────────┤
│  传输层：STDIO / HTTP (SSE)         │  ← 通信协议
├─────────────────────────────────────┤
│  服务层：MCP Server                 │  ← 工具提供方
└─────────────────────────────────────┘
```

---

## 二、MultiServerMCPClient 参数详解

### 2.1 构造函数配置

```javascript
new MultiServerMCPClient({
    mcpServers: { /* ... */ },     // 必需参数
    connectOptions: { /* ... */ }  // 可选参数
})
```

### 2.2 参数 1：`mcpServers`（对象，必需）

定义要连接的 Server 列表，每个 Server 的配置：

| 属性 | 类型 | 说明 |
|------|------|------|
| `command` | string | 启动命令（如 `"node"`, `"python"`） |
| `args` | string[] | 命令参数（如文件路径） |
| `env` | object | 环境变量（可选） |

**示例**：
```javascript
mcpServers: {
    'user-service': {
        command: "node",
        args: ["/path/to/server.mjs"],
        env: { DEBUG: "true" }  // 可选
    }
}
```

### 2.3 参数 2：`connectOptions`（对象，可选）

控制连接模式：
- **不传** → 无状态模式（每次工具调用创建临时连接）
- **传入** → 有状态模式

```javascript
connectOptions: {
    timeout: 30000,      // 连接超时（毫秒）
    retries: 3,          // 重试次数
    // ... 其他高级配置
}
```

**设计目的**：无状态模式简单，有状态模式适合高频调用或需要保持上下文的场景。


---

## 三、MCP 传输层：STDIO vs HTTP

### 3.1 STDIO 传输

#### 原理
父进程（Client）启动子进程（Server），通过标准输入/输出传递 JSON-RPC 消息。

#### Server 端创建
```javascript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const transport = new StdioServerTransport();
await server.connect(transport);
```

**为什么这样用**：
- Server 作为子进程运行
- `StdioServerTransport` 监听 `process.stdin`，输出到 `process.stdout`
- 自动处理 JSON-RPC 消息的序列化/反序列化

#### Client 端使用
```javascript
new MultiServerMCPClient({
    mcpServers: {
        'my-mcp-server': {
            command: "node",  // 启动子进程
            args: ["/path/to/my-mcp-server.mjs"]
        }
    }
})
```

#### 工作流程
```
Client                     Server (子进程)
  │                              │
  ├──────── spawn node ─────────>│
  │                              │
  ├──── JSON-RPC (stdin) ───────>│ query_user({userId: "001"})
  │                              │
  │<──── JSON-RPC (stdout) ──────┤ { content: [...] }
  │                              │
```

#### 优缺点

**优点**：
- 简单：无需配置端口、认证
- 安全：进程隔离，不暴露网络端口
- 跨平台：标准输入输出在所有操作系统都支持

**缺点**：
- 仅限本地：Client 和 Server 必须在同一台机器
- 生命周期绑定：Server 必须由 Client 启动

---

### 3.2 HTTP (SSE) 传输

#### 原理
Server 作为 HTTP 服务运行，Client 通过网络请求连接。使用 SSE（Server-Sent Events）实现服务器推送。

#### 工作流程
```
Client                     Server (HTTP 服务)
  │                              │
  ├──── GET /sse ──────────────> │ 建立 SSE 连接
  │<───── SSE stream ────────────┤ (保持连接)
  │                              │
  ├──── POST /messages ─────────>│ query_user({userId: "001"})
  │                              │
  │<───── SSE event ─────────────┤ { content: [...] }
```

#### 优缺点

**优点**：
- 远程访问：Client 和 Server 可以在不同机器
- 独立部署：Server 独立运行，可被多个 Client 共享
- 灵活性：支持负载均衡、反向代理

**缺点**：
- 复杂：需要配置端口、处理网络问题
- 安全：需要考虑认证、授权、加密（HTTPS）
- 依赖网络：受网络延迟和稳定性影响

---

### 3.3 两种方式对比表

| 特性 | STDIO | HTTP (SSE) |
|------|-------|------------|
| **适用场景** | 本地工具、CLI 应用 | 远程服务、云部署、多客户端共享 |
| **启动方式** | Client 启动子进程 | Server 独立运行 |
| **通信方式** | 标准输入/输出 | HTTP + SSE |
| **网络需求** | ❌ 无需网络 | ✅ 需要网络 |
| **安全性** | 高（进程隔离） | 需额外配置（认证、HTTPS） |
| **复杂度** | 低 | 高 |
| **示例工具** | 文件操作、本地数据库 | API 网关、云服务集成 |

---

## 四、为什么使用 SSE（Server-Sent Events）？

### 4.1 MCP 的通信需求

MCP 基于 **JSON-RPC 2.0**，这是一个**双向通信**协议，有三种消息类型：

#### 1️⃣ Client → Server（请求）
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "query_user", "arguments": { "userId": "001" }}
}
```

#### 2️⃣ Server → Client（响应）
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "content": [...] }
}
```

#### 3️⃣ Server → Client（主动通知）⚠️ 关键点
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": { "progress": 50, "message": "正在查询数据库..." }
}
```

**问题**：普通 HTTP 只能处理 1️⃣ 和 2️⃣（一问一答），无法处理 3️⃣（Server 主动推送）。

---

### 4.2 SSE 解决的三个核心问题

#### 问题 1：Server 主动推送能力

**场景举例**（长时间任务）：

```javascript
// Client 调用工具
await client.callTool("analyze_large_file", { file: "10GB.log" });

// Server 需要主动推送进度：
// 10% 完成...
// 30% 完成...
// 60% 完成...
// 100% 完成 → 返回最终结果
```

**用普通 HTTP**：
- ❌ 无法推送进度，Client 只能傻等
- ❌ 或者 Client 需要轮询（polling），效率低下

**用 SSE**：
```javascript
// Server 通过 SSE 流推送：
res.write('data: {"method":"notifications/progress","params":{"progress":10}}\n\n');
res.write('data: {"method":"notifications/progress","params":{"progress":30}}\n\n');
// ... 最终结果也通过 SSE 推送
res.write('data: {"jsonrpc":"2.0","id":1,"result":{...}}\n\n');
```

---

#### 问题 2：流式响应（Streaming）

**场景举例**（LLM 工具返回流式文本）：

```javascript
// MCP Server 集成了 LLM，逐字返回
server.registerTool("ask_ai", {...}, async ({ question }) => {
    // 返回流式文本：
    // "根据"
    // "根据您的"
    // "根据您的问题"
    // ...
});
```

**用普通 HTTP**：
- ❌ 必须等 LLM 生成完整响应才能返回
- ❌ 用户体验差（长时间空白）

**用 SSE**：
- ✅ Server 可以逐块推送：`data: {"chunk":"根据"}\n\n`
- ✅ Client 实时显示，类似 ChatGPT 打字效果

---

#### 问题 3：保持长连接（避免重复建立连接）

**场景举例**（Agent 连续调用多个工具）：

```javascript
// Agent 执行一系列操作：
1. 调用 list_files
2. 调用 read_file (文件1)
3. 调用 read_file (文件2)
4. 调用 analyze_data
```

**用普通 HTTP**：
```
Client ──POST──> Server (list_files)    ← 连接1
Client <──响应─── Server
[连接关闭]

Client ──POST──> Server (read_file 1)   ← 连接2
Client <──响应─── Server
[连接关闭]
// ... 每次都重新建立连接
```
❌ 频繁建立/关闭连接，开销大（TCP 握手 + TLS 握手）

**用 SSE**：
```
Client ──GET /sse──> Server             ← 建立 SSE 连接（保持打开）
       ↓
Client ──POST──> Server (list_files)    ← 复用连接
Client <──SSE事件─ Server

Client ──POST──> Server (read_file 1)   ← 复用连接
Client <──SSE事件─ Server
// ... SSE 连接一直保持
```
✅ 建立一次连接，后续请求复用

---

### 4.3 为什么是 SSE，而不是 WebSocket？

| 特性 | SSE | WebSocket |
|------|-----|-----------|
| **协议** | 基于 HTTP | 独立协议（ws://） |
| **防火墙穿透** | ✅ 简单（HTTP） | ❌ 可能被阻止 |
| **自动重连** | ✅ 浏览器内置 | ❌ 需手动实现 |
| **通信方向** | Server → Client | 双向 |
| **MCP 需求** | ✅ 足够（结合 POST） | ⚠️ 过度设计 |
| **实现复杂度** | 低 | 高 |

**MCP 的设计选择**：
- MCP 主要通信是 Client → Server（调用工具）
- Server → Client 主要是响应和通知
- SSE（Server → Client）+ POST（Client → Server）= 简单的双向通信
- 比 WebSocket 更轻量，更符合 HTTP 生态

---






