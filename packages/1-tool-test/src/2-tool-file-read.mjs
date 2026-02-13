import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import fs from 'node:fs/promises';
import { z } from 'zod';

const model = new ChatOpenAI({ 
  modelName: process.env.MODEL_NAME || "qwen-coder-turbo",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
  },
});

const readFileTool = tool(
  async ({ filePath }) => {
    const content = await fs.readFile(filePath, 'utf-8');
    console.log(`  [工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`);
    return `文件内容:\n${content}`;
  },
  {
    name: 'read_file',
    description: '用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。',
    schema: z.object({
      filePath: z.string().describe('要读取的文件路径'),
    }),
  }
);

const tools = [
  readFileTool
];

const modelWithTools = model.bindTools(tools);

const messages = [
  new SystemMessage(`你是一个代码助手，可以使用工具读取文件并解释代码。

工作流程：
1. 用户要求读取文件时，立即调用 read_file 工具
2. 等待工具返回文件内容
3. 基于文件内容进行分析和解释

可用工具：
- read_file: 读取文件内容（使用此工具来获取文件内容）
`),
  new HumanMessage('请读取 ./src/tool-file-read.mjs 文件内容并解释代码')
];

/*
为什么要先调用一次LLM，拿到response之后再循环调用工具？
1. 因为模型只能根据输入进行推理，它无法执行工具；
2. 通过推理发现需要调用工具，那么会在输出中包含 需要调用的工具信息（tool_calls），然后由Agent来调用工具
*/
let response = await modelWithTools.invoke(messages);
// console.log(response);

messages.push(response);

while (response.tool_calls && response.tool_calls.length > 0) {
  
  console.log(`\n[检测到 ${response.tool_calls.length} 个工具调用]`);
  
  // 执行所有工具调用
  const toolResults = await Promise.all(
    response.tool_calls.map(async (toolCall) => {
      const tool = tools.find(t => t.name === toolCall.name);
      if (!tool) {
        return `错误: 找不到工具 ${toolCall.name}`;
      }
      
      console.log(`[执行工具] ${toolCall.name}(${JSON.stringify(toolCall.args)})`);
      try {
        const result = await tool.invoke(toolCall.args);
        return result;
      } catch (error) {
        return `错误: ${error.message}`;
      }
    })
  );
  
  // 将工具结果添加到消息历史
  // 1. 为什么使用 ToolMessage 来封装工具结果？因为这样可以明确区分这是工具的输出，而不是用户的输入，或模型的回复；
  // 2. 为什么要关联 tool_call_id？因为可能会有多个工具调用，这样模型可以知道这个结果是对应哪个工具调用的；
  response.tool_calls.forEach((toolCall, index) => {
    messages.push(
      new ToolMessage({
        content: toolResults[index],
        tool_call_id: toolCall.id,
      })
    );
  });
  // ToolMessage的其他常用属性：
  // status："success" | "error"，标记工具调用成功或失败
  // artifact：工具原始产物，不发给模型，给业务侧保留完整结果用
  // metadata：自定义结构化元数据（如耗时、traceId、数据来源）
  
  // 再次调用模型，传入工具结果
  response = await modelWithTools.invoke(messages);
}

console.log('\n[最终回复]');
console.log(response.content);
/*
模型调用response的结构：
  content：模型的自然语言内容（最终展示给用户的文本）。
  tool_calls：模型请求调用的工具列表
    id：本次工具调用的唯一标识
    name：要调用的工具名
    args：调用参数对象
  invalid_tool_calls：工具调用解析失败的项（有些模型会给，便于排错）。
  response_metadata：模型原始响应元信息（如 finish_reason、模型名、token 使用等）。    
  usage_metadata：LangChain 统一后的 token 统计信息（输入/输出/总 tokens）。
  id / additional_kwargs：消息 ID 和厂商原始附加字段（调试、追踪时常用）。
*/

