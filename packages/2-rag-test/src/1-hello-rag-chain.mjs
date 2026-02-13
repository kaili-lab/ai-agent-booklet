/*
文件说明：1-hello-rag-chain.mjs - RAG 链式封装方式

这个文件展示的是 LangChain 的"链式"实现方式，使用框架提供的高级抽象。

核心组件：
1. ChatPromptTemplate（第 105-108 行）：结构化 prompt 模板
   - 区分 system 消息和 user 消息，符合 Chat API 规范
   - 使用变量占位符 {context} 和 {input}，避免手动拼接

2. createStuffDocumentsChain（第 111-114 行）：文档组合链
   - "stuff" 意思是"把所有文档塞进一个 prompt"
   - 自动格式化检索到的文档并填充到模板的 {context} 中
   - 适合文档少（< 5 个）且文档短（每个 < 500 字）的场景

3. createRetrievalChain（第 117-120 行）：检索链
   - 整合检索器和文档组合链
   - 一键调用完成：检索 → 格式化 → 生成答案

链式方式的优势：
- 自动化流程管理：一行代码完成多个步骤
- 内置错误处理：自动重试、日志记录
- 标准化输入输出：便于测试和团队协作

链式方式的劣势：
- 黑盒化：不知道内部细节
- 灵活性受限：自定义逻辑需要重写链
- 学习成本：需要理解不同链的适用场景

适用场景：
- 生产环境
- 标准化的 RAG 流程
- 需要快速迭代
- 团队协作

对比文件：1-hello-rag.mjs 展示了手动实现方式
*/

import "dotenv/config";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";

// ⭐ 差异点 1：链式方式引入了三个额外的组件
// - createRetrievalChain: 封装"检索 + 生成"的完整流程
// - createStuffDocumentsChain: 封装"把文档塞入 prompt"的逻辑
// - ChatPromptTemplate: 结构化 prompt 模板
// 👉 对比：手动方式（1-hello-rag.mjs）不需要这些，直接用 retriever.invoke() 和 model.invoke()

const documents = [
  new Document({
    pageContent: `光光是一个活泼开朗的小男孩，他有一双明亮的大眼睛，总是带着灿烂的笑容。光光最喜欢的事情就是和朋友们一起玩耍，他特别擅长踢足球，每次在球场上奔跑时，就像一道阳光一样充满活力。`,
    metadata: { 
      chapter: 1, 
      character: "光光", 
      type: "角色介绍", 
      mood: "活泼" 
    },
  }),
  new Document({
    pageContent: `东东是光光最好的朋友，他是一个安静而聪明的男孩。东东喜欢读书和画画，他的画总是充满了想象力。虽然性格不同，但东东和光光从幼儿园就认识了，他们一起度过了无数个快乐的时光。`,
    metadata: { 
      chapter: 2, 
      character: "东东", 
      type: "角色介绍", 
      mood: "温馨" 
    },
  }),
  new Document({
    pageContent: `有一天，学校要举办一场足球比赛，光光非常兴奋，他邀请东东一起参加。但是东东从来没有踢过足球，他担心自己会拖累光光。光光看出了东东的担忧，他拍着东东的肩膀说："没关系，我们一起练习，我相信你一定能行的！"`,
    metadata: {
      chapter: 3,
      character: "光光和东东",
      type: "友情情节",
      mood: "鼓励",
    },
  }),
  new Document({
    pageContent: `接下来的日子里，光光每天放学后都会教东东踢足球。光光耐心地教东东如何控球、传球和射门，而东东虽然一开始总是踢不好，但他从不放弃。东东也用自己的方式回报光光，他画了一幅画送给光光，画上是两个小男孩在球场上一起踢球的场景。`,
    metadata: {
      chapter: 4,
      character: "光光和东东",
      type: "友情情节",
      mood: "互助",
    },
  }),
  new Document({
    pageContent: `比赛那天终于到了，光光和东东一起站在球场上。虽然东东的技术还不够熟练，但他非常努力，而且他用自己的观察力帮助光光找到了对手的弱点。在关键时刻，东东传出了一个漂亮的球，光光接球后射门得分！他们赢得了比赛，更重要的是，他们的友谊变得更加深厚了。`,
    metadata: {
      chapter: 5,
      character: "光光和东东",
      type: "高潮转折",
      mood: "激动",
    },
  }),
  new Document({
    pageContent: `从那以后，光光和东东成为了学校里最要好的朋友。光光教东东运动，东东教光光画画，他们互相学习，共同成长。每当有人问起他们的友谊，他们总是笑着说："真正的朋友就是互相帮助，一起变得更好的人！"`,
    metadata: {
      chapter: 6,
      character: "光光和东东",
      type: "结局",
      mood: "欢乐",
    },
  }),
  new Document({
    pageContent: `多年后，光光成为了一名职业足球运动员，而东东成为了一名优秀的插画师。虽然他们走上了不同的道路，但他们的友谊从未改变。东东为光光设计了球衣上的图案，光光在每场比赛后都会给东东打电话分享喜悦。他们证明了，真正的友情可以跨越时间和距离，永远闪闪发光。`,
    metadata: {
      chapter: 7,
      character: "光光和东东",
      type: "尾声",
      mood: "温馨",
    },
  }),
];

const model = new ChatOpenAI({
  temperature: 0,
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 这是向量模型对象，并非是LLM模型，因为它只会输出向量数据；
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
});

// 遍历每个 Document 对象
// 使用 embeddings 将每个文档的 pageContent 转换为向量
// 同时将 ⭐向量和文档⭐ 一起存入内存向量数据库
const vectorStore = await MemoryVectorStore.fromDocuments(
  documents,
  embeddings,
);
// vectorStore是向量数据库实例

const retriever = vectorStore.asRetriever({ k: 3 });

// ⭐ 差异点 2：使用 ChatPromptTemplate 结构化 prompt
// 优势：区分 system 和 user 消息，符合 Chat API 规范
// 👉 对比：手动方式用字符串拼接 `你是老师。故事片段: ${context}...`
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "你是一个讲友情故事的老师。基于以下故事片段回答问题，用温暖生动的语言。如果故事中没有提到，就说这个故事里还没有提到这个细节。"],
  ["human", "故事片段:\n{context}\n\n问题: {input}\n\n老师的回答:"],
]);

// ⭐ 差异点 3：创建"文档组合链"
// 作用：自动把检索到的文档格式化并填充到 prompt 模板的 {context} 中
// 👉 对比：手动方式需要自己写 .map() 和 .join() 来格式化文档（见 1-hello-rag.mjs 第 133-135 行）
const combineDocsChain = await createStuffDocumentsChain({
  llm: model,
  prompt,
});

// ⭐ 差异点 4：创建"检索链"
// 作用：整合检索器 + 文档组合链，一键完成：检索 → 格式化 → 调用 LLM
// 👉 对比：手动方式需要分 3 步执行（检索、格式化、调用），见 1-hello-rag.mjs 第 112、133-137、141 行
const retrievalChain = await createRetrievalChain({
  retriever,
  combineDocsChain,
});

const questions = [
  "东东和光光是怎么成为朋友的？"
];

for (const question of questions) {
  console.log("=".repeat(80));
  console.log(`问题: ${question}`);
  console.log("=".repeat(80));

  // ⭐ 差异点 5：一行代码完成整个 RAG 流程
  // 链会自动：1) 检索文档  2) 格式化上下文  3) 调用 LLM  4) 返回结构化结果
  // 返回值包含 result.answer（答案）和 result.context（检索到的文档）
  // 👉 对比：手动方式需要手动执行每一步，见 1-hello-rag.mjs 第 112-142 行
  const result = await retrievalChain.invoke({ input: question });
  
  // 使用 similaritySearchWithScore 获取相似度评分
  const scoredResults = await vectorStore.similaritySearchWithScore(question, 3);
  
  // 打印用到的文档和相似度评分
  console.log("\n【检索到的文档及相似度评分】");
  result.context.forEach((doc, i) => {
    // 找到对应的评分
    const scoredResult = scoredResults.find(([scoredDoc]) => 
      scoredDoc.pageContent === doc.pageContent
    );
    const score = scoredResult ? scoredResult[1] : null;
    const similarity = score !== null ? (1 - score).toFixed(4) : "N/A";
    
    console.log(`\n[文档 ${i + 1}] 相似度: ${similarity}`);
    console.log(`内容: ${doc.pageContent}`);
    console.log(`元数据: 章节=${doc.metadata.chapter}, 角色=${doc.metadata.character}, 类型=${doc.metadata.type}, 心情=${doc.metadata.mood}`);
  });
  
  // 打印 AI 回答
  console.log("\n【AI 回答】");
  console.log(result.answer);
  console.log("\n");
}
