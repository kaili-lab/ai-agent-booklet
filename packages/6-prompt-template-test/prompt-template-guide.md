# Prompt Template 管理指南

## 知识定位
本文档在 AI 应用开发体系中的位置：
- **上层**：AI 应用工程化、Prompt Engineering
- **本文**：Prompt 模板化与复用策略
- **依赖**：LLM 基础、字符串模板、变量替换
- **相关**：Chain（链式调用）、Agent（智能体）

---

## 前言：为什么需要 Prompt Template？

### 核心问题：硬编码 Prompt 的困境

当你开发 AI 应用时，会遇到 Prompt 管理的根本性问题：

```
硬编码 Prompt                   现实的困境
const prompt = "请帮我总结这篇文章：XXX"
  ↓                              ↓
想要修改风格 → 改代码            修改成本高
想要换个场景 → 复制粘贴整段       代码重复
想要批量生成 → 手动拼接字符串     容易出错
  ↓                              ↓
代码混乱、难以维护                无法复用


模板化 Prompt                   解决方案
const template = "请帮我总结这篇文章：{article}"
  ↓                              ↓
修改风格 → 改模板参数             灵活配置
换场景 → 复用同一模板             DRY 原则
批量生成 → template.format({...}) 自动化
  ↓                              ↓
结构清晰、易于维护                高效复用
```

**核心差异：**
```javascript
// ❌ 硬编码：每个场景都写一遍完整 Prompt
const prompt1 = "你是周报助手。公司：星航科技，团队：AI 组...";
const prompt2 = "你是周报助手。公司：极光云，团队：订单组...";

// ✅ 模板化：定义一次，复用无数次
const template = PromptTemplate.fromTemplate(
  "你是周报助手。公司：{company}，团队：{team}..."
);
const prompt1 = await template.format({ company: "星航科技", team: "AI 组" });
const prompt2 = await template.format({ company: "极光云", team: "订单组" });
```

**这就是 Prompt Template 要解决的核心问题：让 Prompt 可复用、可配置、易维护。**

---

### 本项目的答案：从简单到复杂的模板方案

本项目展示了 6 种方案，从最常用到高级场景：

```
方案 1：PromptTemplate（基础字符串模板）⭐ 主流
└─ 问题：如何复用相同结构的 Prompt？
└─ 答案：定义模板 + 变量替换
└─ 本质：字符串插值（{变量}）
└─ 应用：周报、翻译、摘要等单一 Prompt 场景
└─ 占比：60%

      ↓ 如果需要区分角色（system/user）？

方案 2：ChatPromptTemplate（聊天消息模板）⭐ 主流
└─ 问题：对话应用需要区分 system、user、ai 角色
└─ 答案：多角色消息模板
└─ 本质：结构化消息列表
└─ 应用：对话应用、角色扮演、客服系统
└─ 占比：20%

      ↓ 如果需要提供示例引导 LLM？

方案 3：FewShotPromptTemplate（Few-shot 学习）
└─ 问题：LLM 需要看示例才能理解输出格式
└─ 答案：在 Prompt 中嵌入示例（input → output）
└─ 本质：示例驱动的 Prompt 构建
└─ 应用：格式化输出、风格模仿
└─ 占比：10%

      ↓ 如果示例太多超出 Token 限制？

方案 4：ExampleSelector（智能示例选择）
└─ 问题：有 20 个示例，但只能放 3 个
└─ 答案：基于长度/相似度自动选择合适示例
└─ 本质：动态示例过滤
└─ 应用：Token 限制下的示例优化
└─ 占比：3%

      ↓ 如果 Prompt 很复杂需要模块化？

方案 5：PipelinePromptTemplate（模块化组合）
└─ 问题：Prompt 太长，如何拆分和复用？
└─ 答案：拆分为模块（人设、背景、任务），组合使用
└─ 本质：Prompt 的组件化
└─ 应用：大型项目、多场景复用
└─ 占比：5%

方案 6：Partial（部分预填充）
└─ 问题：某些变量固定不变（如公司名）
└─ 答案：预填充固定变量，创建"半成品"模板
└─ 本质：参数固化
└─ 应用：配合 Pipeline 使用，减少重复传参
└─ 占比：2%
```

---

### 方案关系

**不是替代关系，而是场景选择：**

| 场景 | 推荐方案 | 占比 |
|------|---------|------|
| **内容生成（周报、摘要、翻译）** | PromptTemplate | 60% ⭐ |
| **对话应用（聊天、客服）** | ChatPromptTemplate | 20% ⭐ |
| **格式化输出（需要示例）** | FewShotPromptTemplate | 10% |
| **示例优化（Token 限制）** | ExampleSelector | 3% |
| **大型项目（模块化）** | PipelinePromptTemplate | 5% |
| **固定参数场景** | Partial | 2% |

**关键洞察：** 80% 的场景只需要 PromptTemplate 或 ChatPromptTemplate，这是中小企业的主流需求。

**本项目的价值：**
重点讲解最常用的基础模板（方案 1、2），简单介绍高级场景（方案 3-6）。

**阅读建议：**
- 如果你在做内容生成应用 → 重点看"一、PromptTemplate"
- 如果你在做对话应用 → 重点看"二、ChatPromptTemplate"
- 如果你需要 Few-shot → 看"三、Few-shot 与示例选择"
- 如果你想理解全貌 → 按顺序阅读

---

## 一、PromptTemplate：基础字符串模板（主流方案）⭐

### 本质

定义带有 `{变量}` 占位符的 Prompt 模板，通过 `format()` 替换变量，生成最终 Prompt。

### LangChain 类

**`PromptTemplate`** (`@langchain/core/prompts`)

- **作用**：将 Prompt 字符串模板化，支持变量替换
- **创建方式**：
  - `PromptTemplate.fromTemplate(template)` - 从模板字符串创建
- **关键方法**：
  - `format({ 变量名: 值 })` - 替换变量，返回最终 Prompt 字符串

### 核心代码

```javascript
import { PromptTemplate } from '@langchain/core/prompts';

// 1. 定义模板（只定义一次）
const template = PromptTemplate.fromTemplate(`
你是周报助手。
公司：{company_name}
团队：{team_name}
本周目标：{team_goal}
活动数据：{dev_activities}

请生成周报。
`);

// 2. 复用模板（批量生成不同场景的 Prompt）
const prompt1 = await template.format({
  company_name: "星航科技",
  team_name: "AI 组",
  team_goal: "上线用户画像服务",
  dev_activities: "提交 27 次，完成 DATA-321"
});

const prompt2 = await template.format({
  company_name: "极光云",
  team_name: "订单组",
  team_goal: "修复线上 Bug",
  dev_activities: "修复 7 个 Bug，优化性能"
});

// 3. 发送给 LLM
const response = await model.invoke(prompt1);
```

### 核心优势

**对比硬编码：**

| 维度 | 硬编码 | PromptTemplate |
|------|--------|----------------|
| **复用性** | ❌ 每次复制粘贴 | ✅ 定义一次，复用无数次 |
| **维护成本** | ❌ 修改需要找到所有地方 | ✅ 只改模板，自动生效 |
| **可读性** | ❌ Prompt 和数据混在一起 | ✅ 结构清晰，变量明确 |
| **批量生成** | ❌ 手动拼接字符串 | ✅ 循环调用 format() |
| **测试性** | ❌ 难以测试不同参数组合 | ✅ 轻松测试多种场景 |

---

### 实战场景

#### 场景 1：批量生成周报

```javascript
const teams = [
  { name: "AI 组", goal: "上线画像服务", activities: "..." },
  { name: "订单组", goal: "修复 Bug", activities: "..." },
  { name: "数据组", goal: "优化 ETL", activities: "..." }
];

for (const team of teams) {
  const prompt = await template.format({
    company_name: "星航科技",
    team_name: team.name,
    team_goal: team.goal,
    dev_activities: team.activities
  });

  const report = await model.invoke(prompt);
  console.log(`${team.name} 周报：`, report.content);
}
```

#### 场景 2：多语言翻译

```javascript
const translateTemplate = PromptTemplate.fromTemplate(
  "请将以下文本翻译成 {target_language}：\n{text}"
);

const languages = ["英语", "日语", "法语"];
for (const lang of languages) {
  const prompt = await translateTemplate.format({
    target_language: lang,
    text: "人工智能正在改变世界"
  });

  const translation = await model.invoke(prompt);
  console.log(`${lang}：`, translation.content);
}
```

---

### 适用场景

- ✅ **内容生成**（周报、总结、翻译）
- ✅ **格式化任务**（相同结构，不同数据）
- ✅ **批量处理**（循环生成 Prompt）
- ❌ **对话应用**（需要区分角色）→ 用 ChatPromptTemplate
- ❌ **复杂结构**（多模块组合）→ 用 PipelinePromptTemplate

---

## 二、ChatPromptTemplate：聊天消息模板（对话应用）⭐

### 本质

定义多角色消息模板（system、human、ai），生成结构化消息列表（而非单一字符串）。

### LangChain 类

**`ChatPromptTemplate`** (`@langchain/core/prompts`)

- **作用**：创建多角色消息模板，区分 system（系统指令）、human（用户）、ai（助手）
- **创建方式**：
  - `ChatPromptTemplate.fromMessages([...])` - 从消息数组创建
- **关键方法**：
  - `formatMessages({ 变量名: 值 })` - 返回消息对象数组（而非字符串）

### 核心代码

```javascript
import { ChatPromptTemplate } from '@langchain/core/prompts';

// 1. 定义多角色消息模板
const chatTemplate = ChatPromptTemplate.fromMessages([
  [
    'system',
    `你是周报助手，写作风格：{tone}。
     请根据用户提供的信息生成周报。`
  ],
  [
    'human',
    `公司：{company_name}
     团队：{team_name}
     目标：{team_goal}
     数据：{dev_activities}

     请生成周报。`
  ]
]);

// 2. 生成消息对象数组
const messages = await chatTemplate.formatMessages({
  tone: "专业、清晰",
  company_name: "星航科技",
  team_name: "AI 组",
  team_goal: "上线画像服务",
  dev_activities: "提交 27 次"
});

// messages = [
//   SystemMessage { content: "你是周报助手，写作风格：专业、清晰..." },
//   HumanMessage { content: "公司：星航科技..." }
// ]

// 3. 发送给 LLM
const response = await model.invoke(messages);
```

---

### 核心差异

**PromptTemplate vs ChatPromptTemplate：**

| 特性 | PromptTemplate | ChatPromptTemplate |
|------|---------------|-------------------|
| **输出** | 单一字符串 | 消息对象数组 |
| **角色** | 无角色区分 | system/human/ai |
| **适用** | 内容生成 | 对话应用 |
| **方法** | `format()` | `formatMessages()` |

**为什么需要角色区分？**
- **system**：设定 AI 的角色和行为（如"你是周报助手"）
- **human**：用户的输入或问题
- **ai**：AI 的历史回复（用于多轮对话）

---

### 实战场景

#### 场景 1：客服对话

```javascript
const customerServiceTemplate = ChatPromptTemplate.fromMessages([
  [
    'system',
    `你是 {company_name} 的智能客服，风格：{tone}。
     请帮助用户解决问题，保持专业和耐心。`
  ],
  [
    'human',
    '{user_question}'
  ]
]);

const messages = await customerServiceTemplate.formatMessages({
  company_name: "星航科技",
  tone: "友好、专业",
  user_question: "我的订单为什么还没发货？"
});

const response = await model.invoke(messages);
```

#### 场景 2：多轮对话（带历史）

```javascript
const chatTemplate = ChatPromptTemplate.fromMessages([
  ['system', '你是 AI 助手，风格：{tone}'],
  ['human', '我叫张三'],
  ['ai', '你好张三，很高兴认识你！'],
  ['human', '{current_question}']
]);

const messages = await chatTemplate.formatMessages({
  tone: "友好",
  current_question: "我的名字是什么？"
});

// AI 可以回答"张三"，因为历史对话在 Prompt 中
```

---

### 适用场景

- ✅ **对话应用**（聊天机器人、客服系统）
- ✅ **角色扮演**（设定 AI 人设）
- ✅ **多轮对话**（包含历史消息）
- ❌ **简单内容生成**（无需角色区分）→ 用 PromptTemplate

---

## 三、Few-shot 与示例选择（高级场景）

### 3.1 FewShotPromptTemplate：示例驱动

**本质：** 在 Prompt 中嵌入示例（input → output），让 LLM 模仿。

**LangChain 类：**
- `FewShotPromptTemplate` - 管理多个示例，自动拼接到 Prompt

**核心代码：**
```javascript
import { FewShotPromptTemplate, PromptTemplate } from '@langchain/core/prompts';

// 1. 定义单条示例的格式
const examplePrompt = PromptTemplate.fromTemplate(
  `用户需求：{user_requirement}
   周报片段：{report_snippet}
   ---`
);

// 2. 准备示例数据
const examples = [
  {
    user_requirement: "突出风险控制",
    report_snippet: "处理 P1 故障 1 起，P2 故障 2 起..."
  },
  {
    user_requirement: "展示成果",
    report_snippet: "上线实时看板，支持业务查看转化漏斗..."
  }
];

// 3. 创建 Few-shot 模板
const fewShotTemplate = new FewShotPromptTemplate({
  examples,
  examplePrompt,
  prefix: "以下是一些周报示例：\n",
  suffix: "\n现在请为我生成周报。",
  inputVariables: []
});

const prompt = await fewShotTemplate.format({});
// 自动拼接：prefix + 所有示例 + suffix
```

**权衡：**
- ✅ LLM 通过示例理解输出格式和风格
- ⚠️ 示例占用 Token（可能超出窗口）

**适用场景：** 格式化输出、风格模仿、复杂结构生成。

---

### 3.2 ExampleSelector：智能示例选择

**本质：** 有 20 个示例，但根据长度/相似度只选择合适的 3 个。

**LangChain 类：**
- `LengthBasedExampleSelector` - 根据长度限制选择示例

**核心代码：**
```javascript
import { LengthBasedExampleSelector } from '@langchain/core/example_selectors';

// 1. 创建 Selector（根据长度过滤）
const selector = await LengthBasedExampleSelector.fromExamples(examples, {
  examplePrompt,
  maxLength: 700,  // 最多 700 字符
  getTextLength: (text) => text.length
});

// 2. 配合 Few-shot 使用
const fewShotTemplate = new FewShotPromptTemplate({
  examplePrompt,
  exampleSelector: selector,  // 使用 selector 而非固定 examples
  prefix: "以下是示例：\n",
  suffix: "\n现在请生成周报。",
  inputVariables: []
});

// Selector 会根据长度限制自动选择合适的示例
```

**权衡：**
- ✅ 自动优化示例数量，避免超出 Token 限制
- ⚠️ 可能选不到最相关的示例（只考虑长度）

**适用场景：** Token 受限但有大量示例的场景。

---

## 四、模块化与预填充（大型项目）

### 4.1 PipelinePromptTemplate：模块化组合

**本质：** 将复杂 Prompt 拆分为多个模块（人设、背景、任务），组合使用。

**LangChain 类：**
- `PipelinePromptTemplate` - 管道式组合多个子模板

**核心代码：**
```javascript
import { PipelinePromptTemplate, PromptTemplate } from '@langchain/core/prompts';

// 1. 定义子模块
const personaPrompt = PromptTemplate.fromTemplate(
  "你是周报助手，风格：{tone}。\n"
);

const contextPrompt = PromptTemplate.fromTemplate(
  "公司：{company_name}，团队：{team_name}\n"
);

const taskPrompt = PromptTemplate.fromTemplate(
  "活动：{dev_activities}\n请生成周报。"
);

// 2. 组合模块
const pipelinePrompt = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: 'persona_block', prompt: personaPrompt },
    { name: 'context_block', prompt: contextPrompt },
    { name: 'task_block', prompt: taskPrompt }
  ],
  finalPrompt: PromptTemplate.fromTemplate(
    "{persona_block}{context_block}{task_block}"
  )
});

const prompt = await pipelinePrompt.format({
  tone: "专业",
  company_name: "星航科技",
  team_name: "AI 组",
  dev_activities: "提交 27 次"
});
```

**权衡：**
- ✅ 模块可复用（personaPrompt 可用于其他场景）
- ✅ 结构清晰，易于维护
- ⚠️ 代码复杂度高

**适用场景：** 大型项目、多场景复用同一模块。

---

### 4.2 Partial：部分预填充

**本质：** 固定某些变量（如公司名），创建"半成品"模板。

**LangChain 类：**
- `template.partial({ 固定变量 })` - PromptTemplate 的方法

**核心代码：**
```javascript
// 1. 创建完整模板
const template = PromptTemplate.fromTemplate(
  "公司：{company_name}，团队：{team_name}，目标：{team_goal}"
);

// 2. 预填充固定参数（公司名固定）
const partialTemplate = await template.partial({
  company_name: "星航科技"
});

// 3. 复用预填充模板（只需传剩余变量）
const prompt1 = await partialTemplate.format({
  team_name: "AI 组",
  team_goal: "上线画像服务"
});

const prompt2 = await partialTemplate.format({
  team_name: "订单组",
  team_goal: "修复 Bug"
});
```

**权衡：**
- ✅ 减少重复传参（公司名只传一次）
- ⚠️ 需要两步操作（partial + format）

**适用场景：** 配合 Pipeline 使用，固定公司信息、风格等参数。

---

## 五、策略选择指南

### 5.1 核心对比

| 方案 | 本质 | 复杂度 | 占比 | 适用 |
|------|------|--------|------|------|
| **PromptTemplate** | 字符串模板 | 简单 | 60% | 内容生成、批量处理 |
| **ChatPromptTemplate** | 多角色消息 | 简单 | 20% | 对话应用、角色扮演 |
| **FewShotPromptTemplate** | 示例驱动 | 中等 | 10% | 格式化输出、风格模仿 |
| **ExampleSelector** | 智能示例选择 | 中等 | 3% | Token 优化 |
| **PipelinePromptTemplate** | 模块化组合 | 复杂 | 5% | 大型项目、多场景复用 |
| **Partial** | 预填充 | 简单 | 2% | 固定参数场景 |

---

### 5.2 决策树

```
问：是否需要区分角色（system/user）？
 ├─ 是 → 【ChatPromptTemplate】对话应用
 └─ 否 →
     └─ 问：是否需要提供示例？
         ├─ 是 →
         │   └─ 问：示例是否会超出 Token 限制？
         │       ├─ 是 → 【FewShotPromptTemplate + ExampleSelector】
         │       └─ 否 → 【FewShotPromptTemplate】
         └─ 否 →
             └─ 问：Prompt 是否很复杂需要模块化？
                 ├─ 是 → 【PipelinePromptTemplate + Partial】
                 └─ 否 → 【PromptTemplate】(⭐ 最常用)
```

---

### 5.3 中小企业最佳实践

**推荐方案：PromptTemplate（内容生成）或 ChatPromptTemplate（对话应用）**

**为什么？**
- ✅ **覆盖 80% 场景**
- ✅ **实现简单**（5 行代码）
- ✅ **维护成本低**
- ✅ **团队易理解**

**实现模板：**

**场景 1：内容生成（周报、摘要）**
```javascript
const template = PromptTemplate.fromTemplate(`
你是 {role}。
请根据以下信息生成 {output_type}：
{input_data}

要求：{requirements}
`);

const prompt = await template.format({
  role: "周报助手",
  output_type: "周报",
  input_data: "...",
  requirements: "专业、简洁"
});
```

**场景 2：对话应用（客服、助手）**
```javascript
const chatTemplate = ChatPromptTemplate.fromMessages([
  ['system', '你是 {company} 的 {role}，风格：{tone}'],
  ['human', '{user_input}']
]);

const messages = await chatTemplate.formatMessages({
  company: "星航科技",
  role: "智能客服",
  tone: "友好、专业",
  user_input: "..."
});
```

**何时考虑高级方案？**
- 需要 Few-shot 示例引导 LLM（复杂格式）
- 大型项目需要模块化复用

---

## 六、核心认知总结

### Prompt Template 的本质

**Prompt Template 不是技术问题，而是"工程化"问题：**

```
软件工程原则                →        Prompt Template 方案
├─ DRY（Don't Repeat Yourself）→        模板复用
├─ 关注点分离                →        Pipeline 模块化
├─ 配置与代码分离            →        变量化
└─ 可测试性                  →        format() 可单测
```

**关键洞察：** Prompt Template 将 Prompt 工程化，让 AI 应用更像"软件项目"而非"脚本集合"。

---

### 没有完美的方案

**每种方案都是权衡：**

| 方案 | 牺牲了什么 | 换来了什么 |
|------|-----------|-----------|
| PromptTemplate | 无角色区分 | 简单、高效、易维护 |
| ChatPromptTemplate | 稍复杂（消息对象） | 结构化、角色清晰 |
| FewShotPromptTemplate | Token 消耗大 | LLM 理解更准确 |
| PipelinePromptTemplate | 代码复杂度高 | 模块复用、易扩展 |

**关键洞察：** 80% 的场景用基础模板即可，不要过度设计。

---

### 从方案到架构

**生产环境的演化路径：**

```
原型阶段 → 硬编码 Prompt（验证可行性）
         ↓
MVP 阶段 → PromptTemplate / ChatPromptTemplate（模板化）
         ↓
优化阶段 → 根据实际需求选择：
         ├─ 80% 场景：保持基础模板
         ├─ 15% 场景：引入 Few-shot
         └─ 5% 场景：Pipeline 模块化
```

---

### 与其他技术的关系

**Prompt Template 是 Chain 的基础：**

```
Prompt Template（本文）
         ↓
生成 Prompt 字符串/消息
         ↓
传给 LLM（model.invoke）
         ↓
获得响应
         ↓
Output Parser（解析响应）
         ↓
Chain（将上述步骤链式组合）
```

**核心洞察：** Prompt Template 只负责"生成 Prompt"，不负责调用 LLM 或解析响应。

---

## 参考资源

**LangChain 官方文档：**
- [Prompt Templates 概述](https://js.langchain.com/docs/modules/model_io/prompts/)
- [ChatPromptTemplate](https://js.langchain.com/docs/modules/model_io/prompts/quick_start#chatprompttemplate)
- [Few-shot Prompting](https://js.langchain.com/docs/modules/model_io/prompts/few_shot_examples)

**本项目代码文件：**
- `prompt-template1.mjs` - PromptTemplate 基础用法（⭐ 重点）
- `chat-prompt-template.mjs` - ChatPromptTemplate 演示（⭐ 重点）
- `chat-prompt-template2.mjs` - ChatPromptTemplate 变体
- `fewshot-prompt-template.mjs` - Few-shot 示例
- `fewshot-chat-prompt-template.mjs` - Few-shot + Chat 结合
- `example-selector1.mjs` - LengthBasedExampleSelector
- `example-selector2.mjs` - SemanticSimilarityExampleSelector
- `pipeline-prompt-template.mjs` - Pipeline 模块化（⭐ 重点）
- `partial.mjs` - Partial 预填充
- `messages-placeholder.mjs` - MessagesPlaceholder 演示
- `weekly-report-examples-writer-milvus.mjs` - 完整周报生成示例

**相关文档：**
- `output-parser-guide.md` - 输出解析指南
- `streaming-output-guide.md` - 流式输出指南
