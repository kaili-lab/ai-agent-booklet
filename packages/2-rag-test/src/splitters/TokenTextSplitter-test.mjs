import "dotenv/config";
import "cheerio";
import {  TokenTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { getEncoding } from "js-tiktoken"; 

const logDocument = new Document({
    pageContent: `[2024-01-15 10:00:00] INFO: Application started
[2024-01-15 10:00:05] DEBUG: Loading configuration file
[2024-01-15 10:00:10] INFO: Database connection established
[2024-01-15 10:00:15] WARNING: Rate limit approaching
[2024-01-15 10:00:20] ERROR: Failed to process request
[2024-01-15 10:00:25] INFO: Retrying operation
[2024-01-15 10:00:30] SUCCESS: Operation completed`
});
/*
RecursiveCharacterTextSplitter 按字符数估算块大小，但 LLM 的上下文限制是Token 数，对于需要精准控制 token 数量的场景就不大合适了

TokenTextSplitter 直接按 Token 计数，保证 chunkSize: 50 就是 50 个 Token，与模型输入限制精确对应 
代价是可能牺牲部分语义完整性
*/
const logTextSplitter = new TokenTextSplitter({
    chunkSize: 50,        // 每个块最多 50 个 Token
    chunkOverlap: 10,    // 块之间重叠 10 个 Token
    encodingName: 'cl100k_base',  // OpenAI 使用的编码方式
  });

const splitDocuments = await logTextSplitter.splitDocuments([logDocument]);

// console.log(splitDocuments);

const enc = getEncoding("cl100k_base");
splitDocuments.forEach(document => {
    console.log(document);
    console.log('charater length:',document.pageContent.length);
    console.log('token length:',enc.encode(document.pageContent).length);
});

