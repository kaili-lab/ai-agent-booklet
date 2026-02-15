# Milvus CRUD 快速指南

## 知识定位
本文档在 Milvus 学习体系中的位置：
- **上层**：RAG 系统架构设计（rag-architecture.md）
- **同层**：Milvus 结构设计（milvus-structure.md）
- **本文**：Milvus CRUD 操作实战指南
- **依赖**：需要先理解 Collection、Field、Vector、Scalar 等概念

---

## 一、客户端连接

### 核心步骤
```javascript
import { MilvusClient } from '@zilliz/milvus2-sdk-node';

const client = new MilvusClient({
  address: 'localhost:19530'  // Milvus 服务器地址
});

await client.connectPromise;  // 等待连接建立
```

### 关键参数
- **address**: Milvus 服务地址，默认端口 19530
- **connectPromise**: 返回连接状态的 Promise

### 为什么这样做？
原生 Milvus SDK 采用异步连接，需要等待 `connectPromise` 完成才能执行后续操作，避免连接未建立就发送请求。

---

## 二、准备工作（Create）

### 2.1 创建集合（Collection）

**作用**：定义数据结构（Schema），类似于关系型数据库的 CREATE TABLE。

```javascript
await client.createCollection({
  collection_name: 'ai_diary',
  fields: [
    {
      name: 'id',
      data_type: DataType.VarChar,
      max_length: 50,
      is_primary_key: true
    },
    {
      name: 'vector',
      data_type: DataType.FloatVector,
      dim: 1024  // 向量维度必须与 embedding 模型一致
    },
    {
      name: 'content',
      data_type: DataType.VarChar,
      max_length: 5000
    },
    {
      name: 'date',
      data_type: DataType.VarChar,
      max_length: 50
    },
    {
      name: 'mood',
      data_type: DataType.VarChar,
      max_length: 50
    },
    {
      name: 'tags',
      data_type: DataType.Array,
      element_type: DataType.VarChar,
      max_capacity: 10,
      max_length: 50
    }
  ]
});
```

**关键 API**: `createCollection()`

**必须包含**：
- 一个主键字段（`is_primary_key: true`）
- 至少一个向量字段（`FloatVector` 或 `BinaryVector`）

**为什么需要定义 Schema？**
Milvus 是强类型数据库，需要预先定义字段类型和约束，这样可以优化存储和查询性能。

---

### 2.2 创建索引（Index）

**作用**：为向量字段创建索引，加速相似度搜索。

```javascript
await client.createIndex({
  collection_name: 'ai_diary',
  field_name: 'vector',           // 为哪个字段创建索引
  index_type: IndexType.IVF_FLAT, // 索引类型
  metric_type: MetricType.COSINE, // 距离度量方式
  params: { nlist: 1024 }         // 索引参数
});
```

**关键 API**: `createIndex()`

**常用索引类型**：
- `IVF_FLAT`: 10万-100万数据，平衡速度和精度
- `HNSW`: 100万+ 数据，追求极速搜索
- `FLAT`: <10万数据，暴力搜索（精度 100%）

**常用距离度量**：
- `COSINE`: 余弦相似度（推荐用于文本 embedding）
- `L2`: 欧氏距离
- `IP`: 内积

**为什么这样做？**
向量搜索不同于传统数据库的 B-Tree 索引，需要专门的近似最近邻（ANN）算法。不同索引类型在速度、精度、内存占用上有不同权衡。

---

### 2.3 加载集合（Load Collection）

**作用**：将集合加载到内存，才能进行搜索操作。

```javascript
await client.loadCollection({
  collection_name: 'ai_diary'
});
```

**关键 API**: `loadCollection()`

**为什么需要这一步？**
Milvus 采用"按需加载"策略，只有加载到内存的集合才能被搜索。这样可以节省内存资源，支持管理大量集合。

---

## 三、Insert（插入数据）

### 核心流程

```javascript
// 1. 准备原始数据
const diaryContents = [
  {
    id: 'diary_001',
    content: '今天天气很好，去公园散步了...',
    date: '2026-01-10',
    mood: 'happy',
    tags: ['生活', '散步']
  }
];

// 2. 生成向量
const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-small',
  dimensions: 1024
});

const diaryData = await Promise.all(
  diaryContents.map(async (diary) => ({
    ...diary,
    vector: await embeddings.embedQuery(diary.content)
  }))
);

// 3. 插入数据
const result = await client.insert({
  collection_name: 'ai_diary',
  data: diaryData
});

console.log(`插入了 ${result.insert_cnt} 条记录`);
```

**关键 API**: `insert()`

**为什么需要两步（标量 + 向量）？**
- **标量数据**（content, date, mood）：给人类阅读和精确过滤
- **向量数据**（vector）：给机器做语义相似度搜索

---

## 四、Query（查询数据）

### 向量相似度搜索

```javascript
// 1. 将查询文本转为向量
const query = '我做饭或学习的日记';
const queryVector = await embeddings.embedQuery(query);

// 2. 向量搜索
const searchResult = await client.search({
  collection_name: 'ai_diary',
  vector: queryVector,              // 查询向量
  limit: 3,                         // 返回 top 3 结果
  metric_type: MetricType.COSINE,   // 必须与索引的 metric_type 一致
  output_fields: ['id', 'content', 'date', 'mood', 'tags']  // 返回哪些字段
});

// 3. 处理结果
searchResult.results.forEach((item, index) => {
  console.log(`相似度: ${item.score.toFixed(4)}`);  // 分数越高越相似（COSINE）
  console.log(`内容: ${item.content}`);
});
```

**关键 API**: `search()`

**重要参数**：
- **vector**: 查询向量（通过 embedding 模型生成）
- **limit**: 返回多少条结果（top K）
- **output_fields**: 需要返回的字段列表
- **filter**: 可选，标量字段过滤条件（如 `mood == "happy"`）

**为什么不能用 SQL WHERE 查询？**
向量搜索是"语义相似"，不是精确匹配。例如查询"做饭"能匹配到"烹饪"、"做菜"，这是传统数据库做不到的。

---

## 五、Update（更新数据）

### Upsert 方式更新

```javascript
const updateData = {
  id: 'diary_001',  // 主键相同则更新，不存在则插入
  content: '今天下雨了，心情不太好...',
  date: '2026-01-10',
  mood: 'sad',
  tags: ['生活', '天气'],
  vector: await embeddings.embedQuery('今天下雨了，心情不太好...')  // 必须重新生成
};

await client.upsert({
  collection_name: 'ai_diary',
  data: [updateData]
});
```

**关键 API**: `upsert()`

**为什么需要重新生成向量？**
如果 `content` 改变了，语义也变了，旧向量不再准确。必须用新文本重新生成 embedding。

**Upsert vs Update**：
Milvus 没有单独的 `update()` 方法，使用 `upsert()`（insert or update）实现更新逻辑：
- 如果主键存在 → 更新
- 如果主键不存在 → 插入

---

## 六、Delete（删除数据）

### 三种删除方式

#### 1. 单条删除（by ID）
```javascript
await client.delete({
  collection_name: 'ai_diary',
  filter: `id == "diary_005"`
});
```

#### 2. 批量删除（多个 ID）
```javascript
const deleteIds = ['diary_002', 'diary_003'];
const idsStr = deleteIds.map(id => `"${id}"`).join(', ');

await client.delete({
  collection_name: 'ai_diary',
  filter: `id in [${idsStr}]`
});
```

#### 3. 条件删除（by filter）
```javascript
await client.delete({
  collection_name: 'ai_diary',
  filter: `mood == "sad"`  // 删除所有 mood 为 sad 的记录
});
```

**关键 API**: `delete()`

**核心参数**: `filter` - 使用布尔表达式过滤

**为什么使用 filter 而不是直接传 ID？**
Milvus 的删除操作统一使用过滤表达式，提供更灵活的删除能力（支持复杂条件组合）。

**对比其他实现方式**：
- 关系型数据库：`DELETE FROM table WHERE id = 'xxx'`
- Milvus：统一使用 `filter` 表达式，支持 `==`, `in`, `AND`, `OR` 等操作符

---

## 七、完整流程示意

### 从零到 CRUD 的完整流程

```
【准备阶段】
1. 创建客户端 (MilvusClient)
   ↓
2. 创建集合 (createCollection)
   → 定义 Schema（字段类型、向量维度）
   ↓
3. 创建索引 (createIndex)
   → 选择索引类型（IVF_FLAT/HNSW）
   ↓
4. 加载集合 (loadCollection)
   → 将数据加载到内存

【CRUD 阶段】
5. Insert (插入数据)
   → 准备标量数据 → 生成向量 → 插入
   ↓
6. Query (查询数据)
   → 查询文本转向量 → 向量搜索 → 返回结果
   ↓
7. Update (更新数据)
   → 修改内容 → 重新生成向量 → Upsert
   ↓
8. Delete (删除数据)
   → 使用 filter 表达式删除
```

### 数据流转
```
原始文本 (content)
  ↓ embeddings.embedQuery()
向量 (vector: [0.23, -0.45, ...])
  ↓ client.insert()
存储到 Milvus
  ↓ client.search()
相似度搜索
  ↓ 返回
原始文本 + 元数据
```

---

## 核心认知总结

### Milvus 操作的三个阶段
1. **准备阶段**：创建集合 → 创建索引 → 加载集合（只需执行一次）
2. **写入阶段**：Insert / Upsert（需要生成 embedding）
3. **查询阶段**：Search（语义搜索）/ Delete（条件删除）

### 与关系型数据库的差异
| 操作 | 关系型数据库 | Milvus |
|------|------------|--------|
| 创建表 | CREATE TABLE | createCollection() |
| 插入 | INSERT | insert() |
| 查询 | SELECT WHERE | search() (向量相似度) |
| 更新 | UPDATE | upsert() (需重新生成向量) |
| 删除 | DELETE | delete() (使用 filter 表达式) |

### 关键要点
1. **向量维度一致性**：embedding 模型、Schema、实际数据必须一致
2. **索引是必须的**：没有索引无法进行高效搜索
3. **必须加载集合**：创建后需要 loadCollection() 才能搜索
4. **更新需要重新生成向量**：内容变化 → 语义变化 → 向量必须更新
5. **filter 表达式灵活但有限制**：支持基本运算符，但不如 SQL 强大
