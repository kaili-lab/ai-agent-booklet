import "dotenv/config";
import "cheerio";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// CheerioWebBaseLoader:专门为静态网页内容抓取与标准化提供的组件，本质是将"网页 → Document"这个转换过程抽象出来
// Cheerio 是一个独立的 Node.js 库，诞生于"服务端需要 jQuery 语法"的需求。它实现了 jQuery 的核心子集，移除了浏览器兼容性负担，专门用于解析和操作 HTML/XML
const cheerioLoader = new CheerioWebBaseLoader(
  "https://juejin.cn/post/7233327509919547452",
  {
    selector: '.main-area p'
  }
);

const documents = await cheerioLoader.load();

// RecursiveCharacterTextSplitter 是最常用的Splitter，官方文档明确推荐它作为通用文本的首选起点
// 原因在于它的递归优先级机制：
// 默认分隔符优先级（从大到小）
// separators: ["\n\n", "\n", " ", ""]
// 它的逻辑是：优先尝试用段落分隔，段落太大就用句子，再大就用词，最后才用字符硬切。这种"从结构到字符"的降级策略，能最大程度保持语义连贯
const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 400,  // 控制单块大小是为了适配模型上下文与检索粒度的平衡
    chunkOverlap: 50,  // 适度重叠是为了保留跨句子的语义连续性
    // separators: ["。","！","？"],  
    // 但需要注意：如果某个句子超过 chunkSize，Splitter 会因为没有更低优先级的分隔符而被迫硬切。建议追加一个兜底分隔符
    separators: ["。\n", "！\n", "？\n", "\n", " ", ""]  // 更完整的降级链条
});

const splitDocuments = await textSplitter.splitDocuments(documents);

// console.log(documents);
console.log(splitDocuments);
/*
为什么需要 Loader？
它把“获取 + 解析 + 标准化为 Document”做成统一入口，
这样后续组件不需要关心数据来源的差异。
社区里有很多 Loader（community 目录），可处理纯文本、JSON、Markdown 等。

为什么还要 Splitter？
1）嵌入模型有上下文长度限制，不切分可能超限；
2）检索需要可控粒度，太大不好匹配；
3）重叠能让跨句子信息保持连续，减少语义断裂。

清洗 / 去重 / 元数据增强一般在 Loader 之后做，
但具体在切分前还是后，要看类型：
- 去 HTML 标签、特殊字符：更适合切分前；
- 过滤空块/短块：更适合切分后；
- 添加 metadata：便于检索过滤、来源追踪、重排序。
*/
