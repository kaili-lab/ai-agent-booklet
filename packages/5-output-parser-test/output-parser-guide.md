# LLM 结构化输出解析指南

## 知识定位
本文档在 RAG 学习体系中的位置：
- **上层**：AI Agent 系统开发
- **本文**：LLM 结构化输出解析策略
- **依赖**：LLM 基础、JSON/XML 格式、Zod Schema 验证
- **相关**：Tool Calling、Function Calling

---

## 前言：为什么需要结构化输出？

### 核心矛盾

LLM 默认返回自然语言文本，但应用程序需要结构化数据：

```
LLM 的输出             vs              应用的需求
├─ 自然语言文本          ←→      ├─ JSON/XML 对象
├─ 格式不可控            ←→      ├─ 固定的字段结构
└─ 可能包含额外内容      ←→      └─ 可直接解析和使用
```

**举个例子：**
```javascript
// 你想要：
{
  "name": "爱因斯坦",
  "birth_year": 1879,
  "nationality": "德国"
}

// LLM 可能返回：
// ← 注意外层的 markdown 标记
```json  
{
  "name": "阿尔伯特·爱因斯坦",
  "birth_year": 1879,
  "nationality": "德国"
}
```  // ← 注意外层的 markdown 标记

或者返回：
"爱因斯坦是一位伟大的物理学家，出生于1879年..."  // ← 自然语言
```

**这就是 Output Parser 要解决的核心问题：如何让 LLM 可靠地返回结构化、可解析的数据？**

---

### 本项目的答案：从手动到自动的演化路径

本项目展示了 6 种方案，从简单到可靠的渐进演化：

```
方案 1：手动 Prompt + JSON.parse()
└─ 问题：提示词要求 JSON 格式
└─ 答案：手动解析 response.content
└─ 本质：完全依赖 LLM 遵守指令
└─ 代价：LLM 可能返回带 markdown 的 JSON，解析失败

      ↓ 能否自动处理 markdown 包裹的 JSON？

方案 2：JsonOutputParser
└─ 问题：LLM 返回 ```json...``` 格式
└─ 答案：JsonOutputParser 自动剥离 markdown
└─ 本质：自动清理格式
└─ 代价：仍无法约束输出结构

      ↓ 能否约束字段名称和类型？

方案 3：StructuredOutputParser
└─ 问题：需要定义明确的字段结构
└─ 答案：fromNamesAndDescriptions() 生成格式指令
└─ 本质：通过 Prompt 约束
└─ 代价：LLM 可能不遵守（Prompt 无强制性）

      ↓ 能否强制 LLM 遵守结构？

方案 4：withStructuredOutput (推荐)
└─ 问题：需要 100% 可靠的结构化输出
└─ 答案：利用模型原生能力（Function Calling）
└─ 本质：模型级约束
└─ 代价：依赖支持 Function Calling 的模型

      ↓ 其他实现方式？

方案 5：bindTools (Tool Calls)
└─ 问题：通过工具调用获取结构化数据
└─ 答案：bindTools() + tool_calls[0].args
└─ 本质：与 withStructuredOutput 类似
└─ 代价：代码稍复杂

方案 6：XMLOutputParser
└─ 问题：需要 XML 格式（如旧系统集成）
└─ 答案：XMLOutputParser 解析 XML
└─ 本质：格式转换
└─ 代价：XML 不如 JSON 常用
```

---

### 方案关系

**不是替代关系，而是场景选择：**

| 场景 | 推荐方案 |
|------|---------|
| **快速原型** | 手动 Prompt + JSON.parse() |
| **开发阶段** | JsonOutputParser |
| **生产环境** | withStructuredOutput（强制约束） |
| **旧系统集成** | XMLOutputParser |
| **需要流式输出** | structuredModel.stream() |

**本项目的价值：**
通过代码演示每种方案的实现方式、可靠性、适用场景，让你根据需求选择正确的方案。

**阅读建议：**
- 如果你在做快速 demo → 看"手动方式"和"JsonOutputParser"
- 如果你在做生产项目 → 重点看"withStructuredOutput"
- 如果你想理解全貌 → 按顺序阅读，理解演化逻辑

---

## 一、手动方式：Prompt + JSON.parse()

### 本质

在 Prompt 中要求 LLM 返回 JSON 格式，手动调用 `JSON.parse()` 解析。

### LangChain 类

**无需特殊类**，直接使用 `ChatOpenAI.invoke()`。

### 核心代码

```javascript
const question = "请介绍一下爱因斯坦。请以 JSON 格式返回...";
const response = await model.invoke(question);
const jsonResult = JSON.parse(response.content);  // 手动解析
```

### 核心缺陷

**LLM 可能返回带 markdown 标记的 JSON：**

---

## 二、JsonOutputParser：自动处理 Markdown

### 本质

自动剥离 JSON 外层的 markdown 标记（如 ```json...```），返回纯 JavaScript 对象。

### LangChain 类

**`JsonOutputParser`** (`@langchain/core/output_parsers`)

- **作用**：解析 LLM 返回的 JSON 字符串（自动处理 markdown 包裹）
- **方法**：
  - `getFormatInstructions()`：返回格式指令（插入 Prompt 中）
  - `parse(content)`：解析内容为 JavaScript 对象

### 核心代码

```javascript
import { JsonOutputParser } from '@langchain/core/output_parsers';

const parser = new JsonOutputParser();
const question = `请介绍一下爱因斯坦。${parser.getFormatInstructions()}`;

const response = await model.invoke(question);
const result = await parser.parse(response.content);  // 自动解析
```

### 核心优势

**对比手动方式：**
```
手动方式：LLM 返回 ```json...``` → JSON.parse() 失败 ❌
JsonOutputParser：LLM 返回 ```json...``` → 自动剥离 markdown → 解析成功 ✅
```

### 核心缺陷

**仍无法约束输出结构：**
- LLM 可能返回任意字段（如 `full_name` 而不是你想要的 `name`）
- 无法保证字段类型（如 `birth_year` 返回字符串 "1879" 而不是数字 1879）

### 适用场景

- 开发阶段（容忍一定的输出不稳定性）
- 输出结构简单且 LLM 遵守率高

→ **引出问题：** 能否约束字段名称和类型？

---

## 三、StructuredOutputParser：定义字段结构

### 本质

通过定义字段名称和描述，生成格式指令插入 Prompt，引导 LLM 返回指定结构。

### LangChain 类

**`StructuredOutputParser`** (`@langchain/core/output_parsers`)

- **作用**：定义结构化输出的字段和描述，生成格式指令
- **方法**：
  - `fromNamesAndDescriptions({ field: "描述" })`：定义字段
  - `getFormatInstructions()`：生成格式指令（插入 Prompt）
  - `parse(content)`：解析为对象

### 核心代码

```javascript
import { StructuredOutputParser } from '@langchain/core/output_parsers';

const parser = StructuredOutputParser.fromNamesAndDescriptions({
    name: "姓名",
    birth_year: "出生年份",
    nationality: "国籍"
});

const question = `请介绍一下爱因斯坦。${parser.getFormatInstructions()}`;
const response = await model.invoke(question);
const result = await parser.parse(response.content);
```

### 核心优势

**对比 JsonOutputParser：**
```
JsonOutputParser：无字段约束 → LLM 可能返回任意字段
StructuredOutputParser：定义字段 → 生成格式指令 → LLM 倾向遵守
```

### 核心缺陷

**仍依赖 Prompt，无法强制约束：**
- LLM 可能忽略格式指令（Prompt 无强制性）
- 仍可能返回错误的字段类型

### 适用场景

- 需要定义字段结构但不需要 100% 可靠性
- 模型不支持 Function Calling

→ **引出问题：** 能否强制 LLM 遵守结构？

---

## 四、withStructuredOutput：模型级强制约束（推荐）

### 本质

利用模型原生能力（如 GPT-4 的 Function Calling），强制 LLM 返回符合 Schema 的结构化数据。

### LangChain 类

**`model.withStructuredOutput(schema)`** (ChatOpenAI 方法) + **`z`** (Zod)

- **作用**：将模型绑定到 Zod Schema，利用 Function Calling 强制输出结构
- **依赖**：
  - `z` (Zod)：定义 Schema（字段名、类型、描述）
  - `model.withStructuredOutput()`：返回结构化模型实例
- **返回**：直接返回符合 Schema 的 JavaScript 对象（无需手动解析）

### 核心代码

```javascript
import { z } from 'zod';

const scientistSchema = z.object({
    name: z.string().describe("科学家的全名"),
    birth_year: z.number().describe("出生年份"),
    nationality: z.string().describe("国籍"),
    fields: z.array(z.string()).describe("研究领域列表")
});

const structuredModel = model.withStructuredOutput(scientistSchema);
const result = await structuredModel.invoke("介绍一下爱因斯坦");
// result 已经是结构化对象，无需 parse()
```

### 核心优势

**对比 StructuredOutputParser：**
```
StructuredOutputParser：通过 Prompt 引导 → LLM 可能不遵守 ⚠️
withStructuredOutput：模型级约束（Function Calling）→ 100% 遵守结构 ✅
```

**关键差异：**
- StructuredOutputParser 是"建议"（Prompt）
- withStructuredOutput 是"强制"（Function Calling）

### 工作原理

利用 GPT-4 的 Function Calling 机制：
1. 将 Zod Schema 转换为函数参数定义
2. LLM 将输出"格式化"为函数调用参数
3. 自动提取参数并返回

### 核心代价

**依赖支持 Function Calling 的模型：**
- ✅ GPT-4, GPT-3.5-turbo
- ❌ 不支持 Function Calling 的模型（如某些开源模型）

### 适用场景

- **生产环境（强烈推荐）**
- 需要 100% 可靠的结构化输出
- 模型支持 Function Calling

---

## 五、bindTools：通过工具调用实现结构化

### 本质

将 Schema 定义为"工具"，LLM 通过工具调用返回结构化数据。

### LangChain 类

**`model.bindTools([tool])`** (ChatOpenAI 方法) + **`z`** (Zod)

- **作用**：将工具绑定到模型，LLM 通过 `tool_calls` 返回结构化参数
- **方法**：
  - `model.bindTools([{ name, description, schema }])`：绑定工具
  - `response.tool_calls[0].args`：获取结构化结果

### 核心代码

```javascript
import { z } from 'zod';

const scientistSchema = z.object({
    name: z.string().describe("科学家的全名"),
    birth_year: z.number().describe("出生年份")
});

const modelWithTool = model.bindTools([
    {
        name: "extract_scientist_info",
        description: "提取和结构化科学家的详细信息",
        schema: scientistSchema
    }
]);

const response = await modelWithTool.invoke("介绍一下爱因斯坦");
const result = response.tool_calls[0].args;  // 获取结构化参数
```

### 核心差异

**bindTools vs withStructuredOutput：**

| 特性 | bindTools | withStructuredOutput |
|------|----------|---------------------|
| **本质** | 工具调用 | 结构化输出（内部也是工具调用） |
| **代码复杂度** | 需手动获取 `tool_calls[0].args` | 直接返回对象 |
| **灵活性** | 可定义多个工具 | 单一结构化输出 |
| **推荐度** | 用于 Agent 场景 | 用于单纯结构化输出 |

### 适用场景

- Agent 系统（需要多个工具）
- 需要工具调用的上下文信息（如工具名称）

---

## 六、XMLOutputParser：处理 XML 格式

### 本质

解析 LLM 返回的 XML 格式数据。

### LangChain 类

**`XMLOutputParser`** (`@langchain/core/output_parsers`)

- **作用**：解析 XML 字符串为 JavaScript 对象
- **方法**：
  - `getFormatInstructions()`：生成 XML 格式指令
  - `parse(content)`：解析 XML

### 核心代码

```javascript
import { XMLOutputParser } from '@langchain/core/output_parsers';

const parser = new XMLOutputParser();
const question = `请提取信息。${parser.getFormatInstructions()}`;

const response = await model.invoke(question);
const result = await parser.parse(response.content);
```

### 适用场景

- 需要与旧系统集成（旧系统使用 XML）
- 特定场景下 XML 比 JSON 更合适（如嵌套层次复杂）

**一般不推荐：** JSON 是现代 Web 应用的主流格式。

---

## 七、流式结构化输出

### 本质

以流式方式返回结构化数据（适用于长文本生成场景）。

### LangChain 类

**`structuredModel.stream()`** (withStructuredOutput 返回的模型实例)

- **作用**：流式返回结构化数据块
- **特点**：每个 chunk 都是部分填充的结构化对象

### 核心代码

```javascript
const structuredModel = model.withStructuredOutput(schema);
const stream = await structuredModel.stream(prompt);

for await (const chunk of stream) {
    console.log(chunk);  // 逐步接收结构化对象
}
```

### 核心差异

**普通流式 vs 结构化流式：**

| 特性 | model.stream() | structuredModel.stream() |
|------|---------------|------------------------|
| **输出** | 文本片段 | 部分结构化对象 |
| **解析** | 需等待完整输出后解析 | 每个 chunk 已是对象 |
| **适用** | 展示打字机效果 | 流式处理结构化数据 |

### 适用场景

- 长文本生成 + 结构化输出
- 需要实时展示部分结构化结果

---

## 八、策略选择指南

### 8.1 核心对比

| 方案 | 可靠性 | 复杂度 | 依赖 | 适用 |
|------|-------|--------|------|------|
| **手动 Prompt** | ❌ 低 | 简单 | 无 | 快速原型 |
| **JsonOutputParser** | ⚠️ 中 | 简单 | LangChain | 开发阶段 |
| **StructuredOutputParser** | ⚠️ 中 | 中等 | LangChain | 不支持 FC 的模型 |
| **withStructuredOutput** | ✅ 高 | 简单 | LangChain + Zod + FC 模型 | **生产环境（推荐）** |
| **bindTools** | ✅ 高 | 中等 | LangChain + Zod + FC 模型 | Agent 系统 |
| **XMLOutputParser** | ⚠️ 中 | 简单 | LangChain | 旧系统集成 |

**FC = Function Calling**

---

### 8.2 决策树

```
问：是否需要 100% 可靠的结构化输出？
 ├─ 否 →
 │   └─ 问：是否在快速原型阶段？
 │       ├─ 是 → 【手动 Prompt】
 │       └─ 否 → 【JsonOutputParser】
 └─ 是 →
     └─ 问：模型是否支持 Function Calling？
         ├─ 否 → 【StructuredOutputParser】（接受不可靠性）
         └─ 是 →
             └─ 问：是否在 Agent 系统中使用？
                 ├─ 是 → 【bindTools】
                 └─ 否 → 【withStructuredOutput】（推荐）
```

---

### 8.3 生产环境最佳实践

**推荐方案：withStructuredOutput + Zod**

```javascript
import { z } from 'zod';

// 1. 定义严格的 Schema
const userSchema = z.object({
    name: z.string().min(1).describe("用户姓名"),
    age: z.number().int().positive().describe("用户年龄"),
    email: z.string().email().describe("用户邮箱")
});

// 2. 绑定到模型
const structuredModel = model.withStructuredOutput(userSchema);

// 3. 调用（自动验证和解析）
const result = await structuredModel.invoke("提取用户信息：张三，25岁，zhang@example.com");

// 4. result 保证符合 Schema，可直接使用
console.log(result.name, result.age, result.email);
```

**为什么推荐这个方案？**
- ✅ **可靠性**：利用 Function Calling 强制约束
- ✅ **类型安全**：Zod 提供运行时类型检查
- ✅ **代码简洁**：无需手动解析和验证
- ✅ **错误处理**：Zod 自动验证，抛出明确错误

---

## 九、核心认知总结

### Output Parser 的本质

**Output Parser 不是技术问题，而是"约束"的艺术：**

```
约束强度                     →        方案选择
├─ 无约束（Prompt 建议）      →        手动 Prompt
├─ 弱约束（格式清理）         →        JsonOutputParser
├─ 中约束（字段定义）         →        StructuredOutputParser
└─ 强约束（模型级强制）       →        withStructuredOutput / bindTools
```

---

### 没有完美的方案

**每种方案都是权衡：**

| 方案 | 牺牲了什么 | 换来了什么 |
|------|-----------|-----------|
| 手动 Prompt | 可靠性 | 简单性 + 无依赖 |
| JsonOutputParser | 结构约束 | 自动格式清理 |
| StructuredOutputParser | 可靠性 | 字段定义 + 兼容性 |
| withStructuredOutput | 模型兼容性 | 100% 可靠性 + 类型安全 |

**关键洞察：** 选择方案就是选择"可以接受多少不可靠性"。

---

### 从方案到架构

**生产环境的最佳实践：**

```
快速原型 → 手动 Prompt（验证可行性）
         ↓
开发阶段 → JsonOutputParser（快速迭代）
         ↓
生产环境 → withStructuredOutput + Zod（可靠性 + 类型安全）
         ↓
Agent 系统 → bindTools（多工具调用）
```

---

### 与 Function Calling 的关系

**withStructuredOutput 的底层原理：**

```
用户角度：
定义 Zod Schema → 调用 structuredModel.invoke() → 返回结构化对象

实际执行：
Zod Schema → 转换为 Function 定义 → LLM Function Calling → 提取参数 → 返回
```

**核心洞察：** withStructuredOutput 是 Function Calling 的高级封装，让结构化输出变得简单可靠。

---

## 参考资源

**LangChain 官方文档：**
- [Output Parsers 概述](https://js.langchain.com/docs/modules/model_io/output_parsers/)
- [Structured Output](https://js.langchain.com/docs/modules/model_io/output_parsers/types/structured)
- [withStructuredOutput](https://js.langchain.com/docs/integrations/chat/openai#withstructuredoutput)

**Zod 官方文档：**
- [Zod Schema 定义](https://zod.dev/)

**本项目代码文件：**
- `1-normal.mjs` - 手动 Prompt 方式
- `2-json-output-parser.mjs` - JsonOutputParser 演示
- `structured-output-parser.mjs` - StructuredOutputParser 演示
- `with-structured-output.mjs` - withStructuredOutput 演示（推荐）
- `tool-calls-args.mjs` - bindTools 演示
- `xml-output-parser.mjs` - XMLOutputParser 演示
- `stream-normal.mjs` - 普通流式输出
- `stream-with-structured-output.mjs` - 流式结构化输出
