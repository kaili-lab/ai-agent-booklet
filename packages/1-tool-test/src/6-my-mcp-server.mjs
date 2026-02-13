import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 模拟数据库
const database = {
  users: {
    "001": {
      id: "001",
      name: "张三",
      email: "zhangsan@example.com",
      role: "admin",
    },
    "002": { id: "002", name: "李四", email: "lisi@example.com", role: "user" },
    "003": {
      id: "003",
      name: "王五",
      email: "wangwu@example.com",
      role: "user",
    },
  },
};

const server = new McpServer({
  name: "my-mcp-server",
  version: "1.0.0",
});

// 注册工具：查询用户信息
// 第1个参数：tool 的唯一标识符
// 第2个参数：tool 的元信息，包括描述和输入参数的 schema
// 第3个参数：tool 的实现函数，接收输入参数，返回输出结果
server.registerTool(
  "query_user",
  {
    description:
      "查询数据库中的用户信息。输入用户 ID，返回该用户的详细信息（姓名、邮箱、角色）。",
    inputSchema: {
      userId: z.string().describe("用户 ID，例如: 001, 002, 003"),
    },
  },
  async ({ userId }) => {
    const user = database.users[userId];

    if (!user) {
      return {
        // content、type、text 都是 固定的属性名，这是 MCP 规范定义的
        content: [
          {
            type: "text",
            text: `用户 ID ${userId} 不存在。可用的 ID: 001, 002, 003`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `用户信息：\n- ID: ${user.id}\n- 姓名: ${user.name}\n- 邮箱: ${user.email}\n- 角色: ${user.role}`,
        },
      ],
    };
  },
);

// 注册资源：使用指南文档
// 第1个参数：资源的名称
// 第2个参数：资源的唯一 URI
// 第3个参数：资源的元信息，包括描述和 MIME 类型
// 第4个参数：资源的实现函数，返回资源内容
server.registerResource(
  "使用指南",
  "docs://guide",
  {
    description: "MCP Server 使用文档",
    mimeType: "text/plain",
  },
  async () => {
    return {
      // contents、uri、mimeType 都是 固定的属性名，这是 MCP 规范定义的
      contents: [
        {
          uri: "docs://guide",
          mimeType: "text/plain",
          text: `MCP Server 使用指南
                  功能：提供用户查询等工具。
                  使用：在 Cursor 等 MCP Client 中通过自然语言对话，Cursor 会自动调用相应工具。`,
        },
      ],
    };
  },
);

// transport 是通信协议，这里用的是STDIO，其他还有HTTP
// 它负责在 MCP Server 和 MCP Client 之间传递 JSON-RPC 消息
const transport = new StdioServerTransport();
// 这个MCP是作为子进程运行的，被运行时，这行代码会建立 MCP Server 与客户端的通信通道
await server.connect(transport);
