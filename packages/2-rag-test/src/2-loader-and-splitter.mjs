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
    chunkSize: 400,  // 每个分块的字符数
    chunkOverlap: 50,  // 分块之间的重叠字符数
    separators: ["。","！","？"],  // 分割符，优先使用段落分隔
});

const splitDocuments = await textSplitter.splitDocuments(documents);

// console.log(documents);
console.log(splitDocuments);
/*
Loader 的说明
为什么需要 loader？
它可以自动化：获取、解析、转换为 Document 的流程。
Launch 社区提供了很多 loader，都在 community 目录下，可以加载纯文本文件、JSON 文件、Markdown 文件等等

Loader 加 splitter 协作是LangChain中数据向量化的标准流程
为什么需要 splitter ?
因为 Loader 返回的 Document 通常很大

除了 Loader，splitter，其他还有：数据清洗、去重
他们一般都在 Loader 之后，可以在分割前或者分割后，都可以

数据清洗一般清洗什么？
移除 HTML 标签、移除特殊字符、过滤空块、添加 metadata
*/
