import { getEncoding, getEncodingNameForModel } from "js-tiktoken"; 

const modelName = "gpt-4"; 
const encodingName = getEncodingNameForModel(modelName);
console.log(encodingName);

const enc = getEncoding("cl100k_base");
console.log('apple', enc.encode("apple").length);
console.log('pineapple', enc.encode("pineapple").length);
console.log('苹果', enc.encode("苹果").length);
console.log('吃饭', enc.encode("吃饭").length);
console.log('一二三', enc.encode("一二三").length);

/*
为什么需要 TOKEN 化？
这是所有基于 Transformer 的模型的共性（包括向量模型和 LLM），因为模型无法直接处理字符串，
需要先将文本映射为数字序列（token ID）。这个过程在向量模型内部是自动处理的。

这里演示的目的是，虽然 token 化是自动处理的，但我们仍需要了解 token：
1. 成本预估：提前计算 token 数，估算 API 调用成本
2. 限制检查：避免超出模型 token 上限（如 text-embedding-ada-002 是 8191 token）
3. 分块优化：中英文 token 密度不同（从上面可以看到，"apple" 1 个 token，"苹果" 2 个 token）

注意：
- 向量模型的 token 限制是单次输入的上限，超出会报错（不同于 LLM 的 context window）
- 在实际使用中，大部分情况下通过 TextSplitter 控制分块大小即可，不需要显式使用 tiktoken
- TokenTextSplitter 内部已用 tiktoken 按 token 切分；RecursiveCharacterTextSplitter 默认按字符切分，
  如需精确控制 token 数可传入 lengthFunction: (text) => enc.encode(text).length
*/