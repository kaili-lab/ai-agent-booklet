import 'dotenv/config';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { ChatOpenAI } from '@langchain/openai';
import chalk from 'chalk';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
/*
流程分析
┌─────────────────────────────────────────────────────────────┐
│ 初始化阶段                                                   │
├─────────────────────────────────────────────────────────────┤
│ 1. 创建 ChatOpenAI 模型（连接到 Qwen API）                 │
│ 2. 创建 MultiServerMCPClient（管理 MCP 连接）              │
│ 3. 从 MCP Server 获取 tools（工具列表）                    │
│ 4. 从 MCP Server 读取 resources（背景文档）               │
│ 5. model.bindTools(tools) → 创建支持工具的模型             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Agent 循环（runAgentWithTools）                             │
├─────────────────────────────────────────────────────────────┤
│ 第1轮：                                                      │
│  • 消息 = [系统消息（资源内容）+ 用户查询]                 │
│  • 调用 model.invoke()                                      │
│  • LLM 返回：选择调用哪个工具 + 工具参数                  │
│  • 执行工具 → 获得结果                                      │
│  • 新消息 = 旧消息 + LLM回复 + ToolMessage(结果)          │
│                                                             │
│ 第2轮：                                                      │
│  • 新消息传入 model.invoke()                               │
│  • LLM 基于工具结果重新思考                                │
│  • 若无工具调用 → 返回最终回复，循环结束                  │
│  • 若有工具调用 → 重复执行...                             │
└─────────────────────────────────────────────────────────────┘
*/

const model = new ChatOpenAI({ 
    modelName: "qwen-plus",
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 使用的是 MultiServerMCPClient 默认的无状态模式
// 每次工具调用时，会创建一个临时的 MCP ClientSession，工具执行完后，自动清理连接，不需要手动 close()
const mcpClient = new MultiServerMCPClient({
    mcpServers: {
        'my-mcp-server': {
            command: "node",
            args: [
                "/Users/guang/code/tool-test/src/my-mcp-server.mjs"
            ]
        }
    }
    // 有状态模式，需要添加状态配置，还需要显式调用 mcpClient.connect()，以及mcpClient.close()
    // connectOptions: { /* 有状态配置 */ }
});

const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);

const res = await mcpClient.listResources();

let resourceContent = '';
for (const [serverName, resources] of Object.entries(res)) {
    for (const resource of resources) {
        const content = await mcpClient.readResource(serverName, resource.uri);
        resourceContent += content[0].text;
    }
}

async function runAgentWithTools(query, maxIterations = 30) {
    const messages = [
        new SystemMessage(resourceContent),
        new HumanMessage(query)
    ];

    for (let i = 0; i < maxIterations; i++) {
        console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));
        const response = await modelWithTools.invoke(messages);
        messages.push(response);

        // 检查是否有工具调用
        if (!response.tool_calls || response.tool_calls.length === 0) {
            console.log(`\n✨ AI 最终回复:\n${response.content}\n`);
            return response.content;
        }

        console.log(chalk.bgBlue(`🔍 检测到 ${response.tool_calls.length} 个工具调用`));
        console.log(chalk.bgBlue(`🔍 工具调用: ${response.tool_calls.map(t => t.name).join(', ')}`));
        // 执行工具调用
        for (const toolCall of response.tool_calls) {
            const foundTool = tools.find(t => t.name === toolCall.name);
            if (foundTool) {
                const toolResult = await foundTool.invoke(toolCall.args);
                messages.push(new ToolMessage({
                    content: toolResult,
                    tool_call_id: toolCall.id,
                }));
            }
        }
    }

    return messages[messages.length - 1].content;
}


await runAgentWithTools("查一下用户 002 的信息");
// await runAgentWithTools("MCP Server 的使用指南是什么");

// 不总是需要，但强烈建议在生产环境中调用
await mcpClient.close();

/*
MCP客户端有状态和无状态两种模式：
使用无状态模式，如果：
  ✅ 工具调用相互独立
  ✅ 不需要跨调用上下文
  ✅ 流量不是特别高
  ✅ 追求简单性

迁移到有状态模式 如果：
  ✅ 需要数据库事务
  ✅ 需要保持 HTTP 认证
  ✅ 工具之间有数据依赖关系
  ✅ 高频工具调用（需要性能优化）
  ✅ 构建长工作流
*/