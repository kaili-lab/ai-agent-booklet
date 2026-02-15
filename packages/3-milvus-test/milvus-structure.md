# Milvus 向量数据库结构学习笔记

## 一、Milvus vs 关系型数据库结构对比

### 层级结构
```
MySQL/PostgreSQL:              Milvus:
├── Database                   ├── Database
│   ├── Table                  │   ├── Collection (集合)
│   │   ├── Column             │   │   ├── Field (字段)
│   │   │   └── Row            │   │   │   ├── Scalar Field (标量字段)
│   │                          │   │   │   └── Vector Field (向量字段)
│   │                          │   │   ├── Entity (实体/记录)
│   │                          │   │   └── Partition (分区，可选)
```

### 核心对应关系
| MySQL | Milvus | 说明 |
|-------|--------|------|
| Database | Database | 多数据库隔离 |
| Table | Collection | 存储容器 |
| Column | Field | 数据字段 |
| Row | Entity | 一条记录 |
| Index (B-Tree/Hash) | Index (IVF/HNSW) | 向量专用索引 |

### 设计差异原因
- **Collection vs Table**：向量数据是非结构化数据转换来的，"集合"更贴切
- **Vector Field是一等公民**：关系型DB所有列平等，Milvus中向量是核心，标量字段是附属元数据
- **必须有Primary Key**：和MySQL一样，唯一标识记录
- **索引专为向量优化**：IVF_FLAT、HNSW等算法专门处理高维向量相似度搜索

---

## 二、Schema设计详解

### 示例Schema
```javascript
fields: [
  { name: 'id', data_type: VarChar, is_primary_key: true },        // 主键（必须）
  { name: 'vector', data_type: FloatVector, dim: 1024 },           // 向量（核心）
  { name: 'content', data_type: VarChar, max_length: 5000 },       // 原始文本
  { name: 'date', data_type: VarChar, max_length: 50 },            // 元数据
  { name: 'mood', data_type: VarChar, max_length: 50 },            // 元数据
  { name: 'tags', data_type: Array, element_type: VarChar }        // 元数据
]
```

### 向量类型
Milvus 支持多种向量数据类型，它们在存储效率、精度、适用场景上有明显区别 12：

| 类型 | 存储 | 特点 | 适用场景 |  
|------|------|------|----------|  
| `FLOAT_VECTOR` | 32位浮点 | 高精度，最常用 | 通用语义搜索、推荐系统 |  
| `FLOAT16_VECTOR` | 16位半精度 | 节省存储，精度稍低 | GPU计算、推荐系统粗排 |  
| `BFLOAT16_VECTOR` | 16位Brain Float | 保持数值范围，降低精度 | 大规模图像检索 |  
| `INT8_VECTOR` | 8位整数 | 极致压缩 | 量化模型推理（仅支持HNSW索引）|  
| `BINARY_VECTOR` | 二进制 | 最小存储占用 | 图像指纹、哈希匹配 |  
| `SPARSE_FLOAT_VECTOR` | 稀疏向量 | 大部分维度为零 | 关键词搜索、BM25 |  

选择建议：你的场景（RAG日记系统）使用 FLOAT_VECTOR 是合理的，因为它提供了足够的语义表达精度。如果数据量极大，可以考虑 FLOAT16 或 BFLOAT16 来节省存储。

### 字段用途说明
| 字段 | 类型 | 用途 |
|------|------|------|
| `id` | Scalar | 唯一标识，Milvus强制要求 |
| `vector` | Vector | 存储向量，用于相似度搜索 |
| `content` | Scalar | 原始文本，搜索后返回给用户 |
| `date/mood/tags` | Scalar | 过滤条件（如：date='2026-01' AND mood='happy'） |

### 查询流程示例
```
用户问："我心情好的时候去散步的日记"
↓
1. 用 vector 字段做语义搜索 → 找到"散步"相关记录
2. 用 mood='happy' 过滤
3. 返回 content 字段给用户
```

### 字段命名规则
- **完全自定义**，只需满足两点：
  1. 必须有一个 `is_primary_key: true` 的字段
  2. 至少有一个 `FloatVector` 或 `BinaryVector` 字段

---

## 三、标量数据 vs 向量数据

### 定义对比
| 特性 | 标量数据 (Scalar) | 向量数据 (Vector) |
|------|------------------|------------------|
| 形式 | 单个值 | 多维数组（如1024个浮点数） |
| 可读性 | 人类可读 | 人类不可读 |
| 示例 | `'今天天气很好'`, `'2026-01-10'` | `[0.23, -0.45, ..., 0.89]` |
| 用途 | 过滤、展示、业务逻辑 | 相似度搜索 |
| 匹配方式 | 精确匹配 | 模糊/语义搜索 |
| 类比 | 身份证号、姓名、年龄 | 指纹、DNA |

### 生成方式
```javascript
// 标量：原始数据本身
content: '今天天气很好'

// 向量：通过Embedding模型转换
vector: await embeddings.embedQuery('今天天气很好')
// → [0.23, -0.45, 0.12, ..., 0.89]  (1024维)
```

### 为什么需要同时存储？
- **向量**：让机器理解语义并搜索
- **标量**：让人类阅读结果 + 精确过滤

---

## 四、VECTOR_DIM（向量维度）

### 核心原则
**向量维度由Embedding模型决定，三处必须一致：**
1. Embedding模型配置的 `dimensions`
2. Schema中的 `dim`
3. 实际插入的向量长度

### 常见模型维度
| Embedding模型 | 默认维度 | 是否可调 |
|--------------|---------|---------|
| text-embedding-3-small | 1536 | ✅ 可调整 |
| text-embedding-3-large | 3072 | ✅ 可调到1024 |
| text-embedding-ada-002 | 1536 | ❌ 固定 |

### 为什么选1024？
```javascript
const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-large',
  dimensions: 1024  // 降维到1024
});
```
- **优点**：维度低 → 存储小 + 搜索快
- **代价**：略微损失精度（但1024对日记场景足够）

### 如何修改维度？
```javascript
// ✅ 正确：三处保持一致
const VECTOR_DIM = 512;

const embeddings = new OpenAIEmbeddings({
  dimensions: 512  // ① 模型配置
});

fields: [
  { name: 'vector', dim: 512 }  // ② Schema定义
]

// ③ 实际插入的向量也是512维
```

---

## 五、索引选择：IVF_FLAT vs HNSW

### 索引是否必须
对于向量字段，索引在实际应用中是必须的 

### 索引类型对比
| 索引 | 搜索速度 | 精度 | 内存占用 | 适用场景 |
|------|---------|------|---------|---------|
| **FLAT** | 慢 | 100% | 小 | <10万，暴力搜索 |
| **IVF_FLAT** | 中 | 99%+ | 中 | 10万-100万，平衡之选 |
| **HNSW** | 快 | 高 | **很大** | >100万，追求极速 |
| **IVF_SQ8** | 快 | 中 | 小 | >1000万，可接受精度损失 |

### Demo中为什么用IVF_FLAT？
```javascript
// 数据量仅5条
const diaryContents = [ /* 5条记录 */ ];

// 使用IVF_FLAT
await client.createIndex({
  index_type: IndexType.IVF_FLAT,
  params: { nlist: 1024 }
});
```
**原因**：
- 数据量极小（5条），任何索引都够用
- IVF_FLAT是经典索引，适合演示理解
- HNSW占用内存大，杀鸡用牛刀

### 生产环境选型建议
```
数据量 < 10万      → FLAT (暴力搜索)
数据量 10万-100万  → IVF_FLAT (本案例)
数据量 > 100万     → HNSW (高速搜索)
数据量 > 1000万    → IVF_SQ8 (牺牲精度换空间)
```

### HNSW示例
```javascript
await client.createIndex({
  index_type: IndexType.HNSW,
  params: {
    M: 16,              // 每个节点连接数
    efConstruction: 200 // 构建时搜索范围
  }
});
```
- **优势**：构建"高速公路网"，时间复杂度接近 O(log n)
- **代价**：内存占用是IVF_FLAT的3-5倍

---

## 六、核心认知总结

### Milvus的Schema设计公式
```
Schema = 业务需求(标量字段) + 语义搜索(向量字段)
```

### 三个关键决策
1. **标量字段**：完全自定义，根据业务过滤需求设计
2. **向量维度**：由Embedding模型决定，三处一致
3. **索引选择**：根据数据规模和性能要求

### 数据流转
```
原始文本(content)
  ↓ Embedding模型
向量(vector)
  ↓ 存入Milvus
相似度搜索
  ↓ 返回
原始文本(content)
```
