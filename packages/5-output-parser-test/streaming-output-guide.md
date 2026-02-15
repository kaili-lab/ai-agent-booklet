# LLM 流式输出指南

## 知识定位
本文档在 AI 应用开发体系中的位置：
- **上层**：AI 对话应用开发、用户体验优化
- **本文**：LLM 流式输出实现策略
- **依赖**：LLM 基础、异步编程、Stream API
- **相关**：结构化输出（output-parser-guide.md）

---

## 前言：为什么需要流式输出？

### 核心问题：用户等待的焦虑

当 LLM 生成长文本时，用户体验会遇到一个根本性的问题：

```
非流式输出                     用户感受
用户提问："详细介绍 XXX"        提交问题
  ↓                              ↓
后台生成中... (5-15秒)          黑屏等待（焦虑）
  ↓                            "AI 死了吗？"
一次性返回完整答案              "怎么这么慢？"
  ↓                              ↓
显示 2000 字内容                突然出现一大段文字


流式输出                       用户感受
用户提问："详细介绍 XXX"        提交问题
  ↓                              ↓
立即开始返回                    0.5秒内看到第一个字
  ↓                              ↓
逐字显示（打字机效果）          "AI 在工作"（安心）
  ↓                              ↓
持续显示 5-15秒                 实时看到进度
  ↓                              ↓
完整答案                        体验流畅
```

**核心差异：**
- 非流式：总时间 10秒，但感知等待时间 = 10秒（全程焦虑）
- 流式：总时间 10秒，但感知等待时间 < 1秒（快速响应）

**这就是流式输出要解决的核心问题：消除用户的等待焦虑，让 AI 响应"感觉更快"。**

---

### 本项目的答案：从简单到复杂的流式方案

本项目展示了 3 种流式输出方案，从最常用到高级场景：

```
方案 1：纯文本流式输出 ⭐ 主流方案
└─ 问题：如何实现打字机效果？
└─ 答案：model.stream() 逐块接收文本
└─ 本质：SSE (Server-Sent Events) 流式传输
└─ 应用：ChatGPT、Claude、几乎所有对话应用

      ↓ 如果需要结构化输出 + 流式显示？

方案 2：流式收集 + 最后解析
└─ 问题：想要打字机效果，但最终需要结构化数据
└─ 答案：流式显示文本 → 收集完整 → 解析为对象
└─ 本质：流式体验 + 非流式解析
└─ 应用：需要提取结构化信息的对话应用

      ↓ 如果需要流式返回结构化对象？

方案 3：流式结构化输出
└─ 问题：需要逐步接收结构化数据（非文本）
└─ 答案：withStructuredOutput().stream() 或工具调用流式解析
└─ 本质：流式返回部分填充的对象
└─ 应用：实时数据提取、表单填充、高级 Agent
```

---

### 方案关系

**不是替代关系，而是场景选择：**

| 场景 | 推荐方案 | 占比 |
|------|---------|------|
| **对话应用（聊天机器人、客服）** | 纯文本流式 | 90% ⭐ |
| **内容生成（文章、报告）** | 纯文本流式 | 90% |
| **信息提取 + 显示过程** | 流式收集 + 最后解析 | 8% |
| **实时数据填充（表单、仪表盘）** | 流式结构化 | 2% |

**关键洞察：** 90% 的应用只需要纯文本流式输出（打字机效果），这是中小企业的主流需求。

**本项目的价值：**
重点讲解最常用的纯文本流式（方案 1），简单介绍高级场景（方案 2、3）。

**阅读建议：**
- 如果你在做对话应用 → 重点看"一、纯文本流式输出"
- 如果你需要结构化输出 → 看"二、流式 + 结构化"
- 如果你想理解全貌 → 按顺序阅读

---

## 一、纯文本流式输出（主流方案）⭐

### 本质

LLM 生成文本时，不等待完整响应，而是逐块（chunk）接收并立即显示，形成"打字机效果"。

### LangChain 类

**`model.stream()`** (ChatOpenAI 方法)

- **作用**：将 LLM 响应转换为异步可迭代流（Async Iterable Stream）
- **返回**：每次迭代返回一个 `chunk` 对象，包含部分文本内容
- **关键属性**：`chunk.content` - 当前块的文本内容

### 核心代码

```javascript
const model = new ChatOpenAI({...});
const stream = await model.stream("详细介绍莫扎特");

for await (const chunk of stream) {
    process.stdout.write(chunk.content);  // 实时输出每个文本片段
}
```

### 工作原理

**对比非流式：**
```
非流式 (invoke):
LLM 生成 → 等待完整响应 → 一次性返回
response.content = "莫扎特是一位伟大的作曲家..."（完整 2000 字）

流式 (stream):
LLM 生成 → 每生成几个字就发送一个 chunk → 持续发送直到完成
chunk[0].content = "莫"
chunk[1].content = "扎特"
chunk[2].content = "是一位"
chunk[3].content = "伟大的"
...
chunk[n].content = "..."
```

**关键差异：**
- `invoke()` 返回单个完整响应
- `stream()` 返回异步迭代器，需要用 `for await...of` 循环接收

---

### 实现打字机效果的关键点

#### 1. 使用异步迭代器

```javascript
// ❌ 错误：无法使用普通 for 循环
for (const chunk of stream) { ... }  // 报错

// ✅ 正确：使用 for await...of
for await (const chunk of stream) {
    console.log(chunk.content);
}
```

#### 2. 实时输出（不换行）

```javascript
// ❌ 错误：每个 chunk 换行（破坏打字机效果）
console.log(chunk.content);

// ✅ 正确：使用 process.stdout.write（不换行）
process.stdout.write(chunk.content);
```

#### 3. 收集完整内容（可选）

```javascript
let fullContent = '';
for await (const chunk of stream) {
    const text = chunk.content;
    fullContent += text;              // 拼接完整内容
    process.stdout.write(text);       // 实时显示
}

console.log('\n完整内容:', fullContent);  // 最后可以获取完整文本
```

---

### 前端实现（Web 应用）

**后端（Node.js + Express）：**
```javascript
app.post('/api/chat', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await model.stream(req.body.question);

    for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
    }

    res.end();
});
```

**前端（JavaScript）：**
```javascript
const eventSource = new EventSource('/api/chat');

eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    document.getElementById('output').textContent += data.content;  // 逐步显示
};
```

**技术栈：** SSE (Server-Sent Events) - 单向流式传输协议。

---

### 核心优势

**对比非流式输出：**

| 维度 | 非流式 | 流式 |
|------|--------|------|
| **首字响应时间** | 5-15秒 | 0.3-0.8秒 |
| **用户感知** | 漫长等待 | 立即响应 |
| **体验** | 焦虑（不知道 AI 在不在工作） | 流畅（看到实时进度） |
| **实现复杂度** | 简单（invoke） | 稍复杂（stream + 异步迭代） |
| **应用场景** | 短文本生成 | 长文本生成、对话应用 |

**关键洞察：** 流式输出不是为了"更快完成"，而是为了"更快开始"，消除等待焦虑。

---

### 适用场景

- ✅ **对话应用**（聊天机器人、客服系统、AI 助手）
- ✅ **内容生成**（文章、报告、代码生成）
- ✅ **长文本回答**（教学、解释、storytelling）
- ❌ **短文本**（< 50 字）- 非流式即可
- ❌ **需要完整响应后处理**（如解析 JSON）- 用 invoke()

---

### 常见问题

**Q1: 流式输出会更快吗？**
A: 总时间相同，但"感知速度"更快（首字响应 < 1秒 vs 等待 10秒）。

**Q2: 如何在流式过程中取消？**
A: 使用 AbortController（需要模型支持）。

**Q3: 流式输出是否消耗更多资源？**
A: 几乎相同，只是传输方式不同（分块 vs 一次性）。

---

## 二、流式 + 结构化（高级场景）

### 核心矛盾

```
流式输出               vs              结构化输出
├─ 逐字返回文本片段      ←→      ├─ 需要完整 JSON 才能解析
├─ 即时显示             ←→      ├─ 等待完整对象
└─ 用户体验好           ←→      └─ 程序易用性好
```

**问题：** 如果既想要流式体验，又需要最终得到结构化数据（JSON 对象）怎么办？

---

### 解决方案 1：流式收集 + 最后解析

**本质：** 流式显示文本（打字机效果）→ 同时收集完整内容 → 流结束后解析为对象。

**LangChain 类：**
- `model.stream()` - 流式接收
- `StructuredOutputParser.parse()` - 最后解析

**核心代码：**
```javascript
const parser = StructuredOutputParser.fromZodSchema(schema);
const stream = await model.stream(prompt);

let fullContent = '';
for await (const chunk of stream) {
    fullContent += chunk.content;
    process.stdout.write(chunk.content);  // 实时显示
}

const result = await parser.parse(fullContent);  // 流结束后解析
console.log(result);  // { name: "...", birth_year: ... }
```

**权衡：**
- ✅ 用户看到打字机效果
- ✅ 程序最终得到结构化对象
- ⚠️ 解析仍在最后（无法提前获取部分字段）

**适用场景：** 需要展示生成过程 + 最终提取结构化信息（如"生成报告并提取关键数据"）。

---

### 解决方案 2：流式结构化输出

**本质：** 模型级流式返回结构化对象（不是文本）。

**LangChain 类：**
- `model.withStructuredOutput(schema).stream()` - 流式返回部分填充的对象

**核心代码：**
```javascript
const structuredModel = model.withStructuredOutput(schema);
const stream = await structuredModel.stream(prompt);

for await (const chunk of stream) {
    console.log(chunk);  // 每个 chunk 是部分填充的对象
    // chunk = { name: "莫扎特", birth_year: undefined, ... }
    // chunk = { name: "莫扎特", birth_year: 1756, ... }
}
```

**权衡：**
- ✅ 可以逐步获取字段（如先获取 name，再获取 birth_year）
- ❌ 无法显示打字机效果（返回的是对象，不是文本）
- ❌ 依赖支持 Function Calling 的模型

**适用场景：** 实时填充表单、仪表盘数据更新（非对话场景）。

---

### 解决方案 3：工具调用流式解析

**本质：** 通过工具调用流式返回结构化参数。

**LangChain 类：**
- `model.bindTools()` + `JsonOutputToolsParser` - 解析工具调用流

**核心代码：**
```javascript
const modelWithTool = model.bindTools([{ name: "...", schema }]);
const parser = new JsonOutputToolsParser();
const chain = modelWithTool.pipe(parser);

const stream = await chain.stream(prompt);
for await (const chunk of stream) {
    console.log(chunk[0].args);  // 逐步更新的参数对象
}
```

**权衡：**
- ✅ 可以访问工具调用的原始流式数据
- ❌ 代码复杂度高
- ❌ 主要用于 Agent 系统

**适用场景：** Agent 需要流式监控工具调用参数的场景。

---

## 三、策略选择指南

### 3.1 核心对比

| 方案 | 输出类型 | 用户体验 | 程序获取 | 复杂度 | 占比 |
|------|---------|---------|---------|--------|------|
| **纯文本流式** | 文本片段 | 打字机效果 ✅ | 文本 | 简单 | **90%** |
| **流式收集 + 解析** | 文本片段 | 打字机效果 ✅ | 最后得到对象 | 中等 | 8% |
| **流式结构化** | 对象片段 | 无打字机 ❌ | 逐步得到对象 | 复杂 | 2% |

---

### 3.2 决策树

```
问：是否需要结构化输出（JSON 对象）？
 ├─ 否 → 【纯文本流式】model.stream()
 └─ 是 →
     └─ 问：是否需要打字机效果？
         ├─ 是 → 【流式收集 + 最后解析】
         └─ 否 →
             └─ 问：是否需要逐步获取字段？
                 ├─ 否 → 【非流式】withStructuredOutput()
                 └─ 是 → 【流式结构化】withStructuredOutput().stream()
```

---

### 3.3 中小企业最佳实践

**推荐方案：纯文本流式输出（model.stream）**

**为什么？**
- ✅ **覆盖 90% 场景**（对话、内容生成）
- ✅ **实现简单**（10 行代码）
- ✅ **用户体验好**（打字机效果）
- ✅ **成本相同**（流式不增加 API 成本）

**实现模板：**
```javascript
// 后端
app.post('/api/chat', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    const stream = await model.stream(req.body.question);

    for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ text: chunk.content })}\n\n`);
    }
    res.end();
});

// 前端
const eventSource = new EventSource('/api/chat');
eventSource.onmessage = (e) => {
    outputElement.textContent += JSON.parse(e.data).text;
};
```

**何时考虑高级方案？**
- 需要实时提取结构化数据（如实时填充多个字段）
- Agent 系统需要监控工具调用

---

## 四、核心认知总结

### 流式输出的本质

**流式输出不是技术问题，而是"心理学"问题：**

```
用户心理                     →        技术方案
├─ 等待焦虑（看不到进度）     →        流式输出（立即反馈）
├─ 不确定性（AI 在工作吗？）  →        打字机效果（可见进度）
└─ 期待感（想快点看到结果）   →        首字 < 1秒（消除焦虑）
```

**关键洞察：** 流式输出的价值不是"更快完成"，而是"更快开始"。

---

### 没有完美的方案

**每种方案都是权衡：**

| 方案 | 牺牲了什么 | 换来了什么 |
|------|-----------|-----------|
| 纯文本流式 | 无法即时获取结构化数据 | 最佳用户体验 + 简单实现 |
| 流式收集 + 解析 | 需要等待流结束才能解析 | 打字机效果 + 最终得到对象 |
| 流式结构化 | 无打字机效果 + 复杂度高 | 逐步获取结构化字段 |

**关键洞察：** 90% 的场景只需要纯文本流式，不要过度设计。

---

### 从方案到架构

**生产环境的演化路径：**

```
原型阶段 → 非流式（invoke）验证可行性
         ↓
MVP 阶段 → 纯文本流式（打字机效果）
         ↓
优化阶段 → 根据实际需求选择：
         ├─ 90% 场景：保持纯文本流式
         ├─ 8% 场景：流式收集 + 解析
         └─ 2% 场景：流式结构化
```

---

### 技术栈选择

**流式传输协议：**

| 协议 | 特点 | 适用 |
|------|------|------|
| **SSE (Server-Sent Events)** | 单向、简单、浏览器原生支持 | 对话应用（推荐）|
| **WebSocket** | 双向、复杂、需要库支持 | 需要双向通信的场景 |
| **HTTP Streaming** | 简单、兼容性好 | 简单场景 |

**推荐：** 对话应用优先使用 SSE（EventSource API），实现简单且浏览器原生支持。

---

## 参考资源

**LangChain 官方文档：**
- [Streaming 概述](https://js.langchain.com/docs/expression_language/streaming)
- [ChatOpenAI Streaming](https://js.langchain.com/docs/integrations/chat/openai#streaming)

**相关技术：**
- [MDN - EventSource (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [Stream API (Node.js)](https://nodejs.org/api/stream.html)

**本项目代码文件：**
- `stream-normal.mjs` - 纯文本流式输出（⭐ 重点）
- `stream-structured-partial.mjs` - 流式收集 + 最后解析
- `stream-with-structured-output.mjs` - withStructuredOutput 流式
- `stream-tool-calls-parser.mjs` - 工具调用流式解析
- `stream-tool-calls-raw.mjs` - 原始工具调用流

**相关文档：**
- `output-parser-guide.md` - 结构化输出解析指南
