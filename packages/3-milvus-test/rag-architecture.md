# RAG系统架构：数据存储设计

## 核心问题

1. Document是否需要同时存储在关系型数据库（MySQL）和向量数据库（Milvus）？
2. Milvus中的字段是否要和MySQL保持一致？

---

## 一、两种存储架构

### 架构1：单存储（只用Milvus）

**适用场景**：简单RAG系统、个人知识库、不需要复杂查询

**数据结构**：
```javascript
// Milvus中存储所有内容
{
  id: 'doc_001',
  vector: [0.23, -0.45, ...],    // 向量
  content: '完整的文档内容',      // 原始文本
  title: '文档标题',
  author: '作者',
  created_at: '2026-01-10',
  tags: ['AI', '技术']
}
```

**特点**：
- ✅ 架构简单，只维护一个数据库
- ✅ 查询后直接返回所有字段
- ❌ 不擅长复杂查询（join、聚合统计）
- ❌ 数据更新需要重新生成向量

**insert.mjs demo就是这种架构**

---

### 架构2：双存储（MySQL + Milvus）

**适用场景**：企业级系统、需要事务管理、有复杂业务逻辑

**数据分布**：

```javascript
// MySQL存储（主数据）
documents表:
  id, title, content, author, created_at, updated_at,
  status, category_id, views, download_count...

// Milvus存储（向量索引）
{
  id: 'doc_001',              // 与MySQL的id一致
  vector: [0.23, -0.45, ...],
  title: '文档标题',           // 冗余字段（用于预览）
  snippet: '内容摘要',         // 不是全文
  created_at: '2026-01-10'    // 用于过滤
}
```

**查询流程**：
```
1. 用户搜索 → Milvus向量搜索 → 返回 top 10 的 id
2. 用这些id → MySQL查询 → 返回完整文档信息
```

**特点**：
- ✅ 职责分离：MySQL管理主数据，Milvus专注搜索
- ✅ 支持复杂业务查询和事务
- ❌ 架构复杂，需维护两个数据库
- ❌ 数据一致性需要额外处理

---

### 架构选型参考

| 场景 | 推荐架构 |
|------|---------|
| 个人知识库、AI对话记录 | 单存储（Milvus） |
| 企业文档系统、电商商品搜索 | 双存储（MySQL + Milvus） |

---

## 二、Milvus字段设计原则

### 核心原则：按需冗余，不需要完全一致

**Milvus只存储：搜索需要的字段 + 展示需要的字段**

### 字段选择规则

```
① id（必须）
   └─ 和MySQL主键一致，用于关联查询

② vector（必须）
   └─ 向量数据，搜索核心

③ 过滤字段（按需）
   └─ 用于构建查询条件
   └─ 示例：created_at, department_id, is_public

④ 预览字段（按需）
   └─ 用于搜索结果列表展示
   └─ 示例：title, snippet（摘要）

⑤ 不需要的字段
   └─ views, download_count, updated_at...
   └─ 这些直接从MySQL查询
```

---

## 三、实际案例

### 场景：企业文档搜索系统（双存储架构）

**MySQL完整数据**：
```sql
CREATE TABLE documents (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(200),
  content TEXT,
  author_id INT,
  department_id VARCHAR(50),
  created_at DATETIME,
  updated_at DATETIME,
  file_size BIGINT,
  download_count INT,
  is_public BOOLEAN,
  is_deleted BOOLEAN,
  version INT
);
```

**Milvus搜索索引**：
```javascript
{
  id: 'doc_001',                  // 关联MySQL
  vector: [...],                  // 搜索核心
  title: '2026年度技术总结',       // 预览字段
  snippet: '本文介绍了...',        // 内容摘要
  department_id: 'tech',          // 过滤条件
  created_at: '2026-01-10',       // 过滤条件
  is_public: true                 // 过滤条件
}
```

### 查询示例

**需求**："搜索最近3个月技术部的AI相关文档"

**步骤1：Milvus向量搜索 + 过滤**
```javascript
const results = await milvus.search({
  vector: await embedQuery('AI技术'),
  filter: `
    department_id == 'tech' AND
    created_at > '2025-11-01' AND
    is_public == true
  `,
  limit: 10
});
// 返回 → [
//   { id: 'doc_001', title: '...', snippet: '...' },
//   { id: 'doc_023', title: '...', snippet: '...' }
// ]
```

**步骤2：MySQL查询完整信息**
```javascript
const ids = results.map(r => r.id);
const documents = await mysql.query(`
  SELECT * FROM documents
  WHERE id IN (?)
`, [ids]);
// 返回完整文档：author, content, download_count, version...
```

---

## 四、不同冗余策略对比

### 策略1：最小冗余（推荐）
```javascript
// Milvus
{ id, vector, title, created_at }

// 查询流程
Milvus搜索 → 返回id + title预览
→ 用户点击 → MySQL查完整信息
```
- **优点**：节省Milvus存储空间，减少同步压力
- **场景**：大多数业务场景

### 策略2：只存id和vector（极简）
```javascript
// Milvus
{ id, vector }

// 查询流程
Milvus搜索 → 返回id列表
→ 全部去MySQL查 → 返回完整信息
```
- **优点**：数据一致性最好，Milvus只负责"找相关id"
- **场景**：搜索结果需要展示大量MySQL字段

### 策略3：完全冗余（不推荐）
```javascript
// Milvus存储MySQL所有字段
{ id, vector, title, content, author, created_at,
  updated_at, status, views, category_id... }
```
- **缺点**：浪费空间，数据一致性难维护
- **场景**：几乎不推荐

---

## 五、核心认知总结

### Milvus的定位
```
Milvus = 向量搜索引擎（不是主数据库）
```

### 架构设计思路
```
简单场景：
  Milvus是主数据库 → 存所有数据（向量+标量）

复杂场景：
  MySQL = 主数据（业务逻辑、事务、复杂查询）
  Milvus = 搜索索引（向量搜索 + 必要的过滤/预览字段）
```

### 字段冗余原则
```
Milvus中冗余的字段 =
  id（关联）+
  vector（搜索）+
  过滤条件字段 +
  预览展示字段
```

---

## 常见问题

**Q：MySQL数据更新后，如何同步到Milvus？**

**方案1：主动同步**
```javascript
// 更新MySQL后立即更新Milvus
await mysql.update(documentId, newData);
await milvus.update({
  id: documentId,
  vector: await embedQuery(newData.content),
  title: newData.title
});
```

**方案2：异步队列**
```javascript
// MySQL更新后发送消息到队列
await mysql.update(documentId, newData);
await queue.publish('document.updated', documentId);

// 后台worker消费队列
worker.on('document.updated', async (docId) => {
  const doc = await mysql.get(docId);
  await milvus.update({
    id: docId,
    vector: await embedQuery(doc.content)
  });
});
```

**Q：如何保证数据一致性？**
- 以MySQL为准（主数据）
- Milvus允许短暂不一致（最终一致性）
- 定期全量同步校验
