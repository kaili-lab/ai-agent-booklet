import "dotenv/config";
import "cheerio";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const cheerioLoader = new CheerioWebBaseLoader(
  "https://juejin.cn/post/7233327509919547452",
  {
    selector: '.main-area p'
  }
);

const documents = await cheerioLoader.load();

const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 400,  // 控制单块大小是为了适配模型上下文与检索粒度的平衡
    chunkOverlap: 50,  // 适度重叠是为了保留跨句子的语义连续性
    separators: ["。","！","？"],  // 这里用句子级分隔符，避免把句子硬切断导致语义断裂
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
