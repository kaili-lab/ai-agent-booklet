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
这是向量模型内部实现的，因为向量模型无法直接处理文本，它们只能处理 token。

这里演示的目的是，虽然 token 化是自动处理的，但是我们需要知道，一成本预估，提前计算 token 数。二限制检查，避免超出 8191 token 上限。三分块优化，中英文 token 密度不同。

这里的 token 限制指的是向量模型单次处理的 token 数量限制，不同于 LLM 的 context window，向量模型超出它的 token 限制会报错。而且它指的是输入上限。
*/