/*
文件说明：pgvector-crud.mjs - PostgreSQL + pgvector CRUD 操作示例

知识定位：
- 本文件在向量数据库学习体系中的位置：对比 Milvus 的另一种向量存储方案
- 上层概念：RAG 系统的数据存储架构
- 对比文件：insert.mjs, query.mjs, update.mjs, delete.mjs (Milvus 实现)

为什么需要这个文件？
- PostgreSQL + pgvector 是另一种流行的向量存储方案
- 对比 Milvus 和 PostgreSQL 的 CRUD 操作差异
- Milvus 是专用向量数据库，PostgreSQL 是关系型数据库 + 向量扩展

核心差异：
1. Milvus 使用原生 SDK (@zilliz/milvus2-sdk-node)
   PostgreSQL 使用 LangChain 的 PGVectorStore 封装
2. Milvus 需要手动创建集合、索引、加载
   PGVectorStore 自动创建表和索引
3. Milvus 支持更复杂的向量索引（IVF_FLAT, HNSW）
   PostgreSQL 使用 pgvector 的 IVFFLAT 或 HNSW 索引
*/

import "dotenv/config";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";

// ========== 配置部分 ==========

const VECTOR_DIM = 1024;

// PostgreSQL 连接配置
// 为什么需要这些配置？PostgreSQL 是独立的数据库服务器，需要认证信息
const postgresConfig = {
  postgresConnectionOptions: {
    host: process.env.PGVECTOR_HOST || 'localhost',
    port: parseInt(process.env.PGVECTOR_PORT || '5432'),
    user: process.env.PGVECTOR_USER || 'postgres',
    password: process.env.PGVECTOR_PASSWORD || 'postgres',
    database: process.env.PGVECTOR_DATABASE || 'vector_db'
  },
  tableName: 'ai_diary',  // 对应 Milvus 的 collection_name
  // 列名映射：LangChain 的 Document 结构 → PostgreSQL 表结构
  columns: {
    idColumnName: 'id',
    vectorColumnName: 'vector',
    contentColumnName: 'content',
    metadataColumnName: 'metadata'  // metadata 存储 date, mood, tags
  }
};

// Embedding 模型配置（与 Milvus 示例保持一致）
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
  dimensions: VECTOR_DIM
});

// ========== 数据准备 ==========

// 与 Milvus insert.mjs 中相同的日记数据
// 为什么使用 Document 格式？LangChain 的 PGVectorStore 接受 Document 对象
const diaryDocuments = [
  new Document({
    pageContent: '今天天气很好，去公园散步了，心情愉快。看到了很多花开了，春天真美好。',
    metadata: {
      id: 'diary_001',
      date: '2026-01-10',
      mood: 'happy',
      tags: ['生活', '散步']
    }
  }),
  new Document({
    pageContent: '今天工作很忙，完成了一个重要的项目里程碑。团队合作很愉快，感觉很有成就感。',
    metadata: {
      id: 'diary_002',
      date: '2026-01-11',
      mood: 'excited',
      tags: ['工作', '成就']
    }
  })
];

// ========== CRUD 操作函数 ==========

/**
 * Create + Insert: 初始化表并插入数据
 *
 * 为什么这样做？
 * - PGVectorStore.fromDocuments() 会自动创建表（如果不存在）
 * - 自动生成向量并插入数据
 * - 对比 Milvus：需要手动 createCollection() → createIndex() → loadCollection() → insert()
 */
async function createAndInsert() {
  console.log('\n========== CREATE + INSERT ==========');
  console.log('初始化 PostgreSQL 向量存储并插入数据...\n');

  // fromDocuments 会自动：
  // 1. 创建表（包含 id, vector, content, metadata 列）
  // 2. 为每个 Document 生成 embedding
  // 3. 插入数据
  const vectorStore = await PGVectorStore.fromDocuments(
    diaryDocuments,
    embeddings,
    postgresConfig
  );

  console.log(`✓ 成功插入 ${diaryDocuments.length} 条日记记录`);
  console.log('表名:', postgresConfig.tableName);
  console.log('向量维度:', VECTOR_DIM);

  return vectorStore;
}

/**
 * Query: 向量相似度搜索
 *
 * 为什么使用 similaritySearchWithScore？
 * - 不仅返回匹配的文档，还返回相似度分数
 * - 对比 Milvus：client.search() 也返回 score
 */
async function query() {
  console.log('\n========== QUERY (向量搜索) ==========');

  const vectorStore = await PGVectorStore.fromExistingIndex(
    embeddings,
    postgresConfig
  );

  const queryText = '我做饭或学习的日记';
  console.log(`查询: "${queryText}"\n`);

  // similaritySearchWithScore 返回 [Document, score] 数组
  // score 是距离分数，具体含义取决于距离度量方式（默认是余弦距离）
  const results = await vectorStore.similaritySearchWithScore(queryText, 3);

  console.log(`找到 ${results.length} 条相似结果:\n`);
  results.forEach(([doc, score], index) => {
    console.log(`${index + 1}. [相似度分数: ${score.toFixed(4)}]`);
    console.log(`   ID: ${doc.metadata.id}`);
    console.log(`   日期: ${doc.metadata.date}`);
    console.log(`   心情: ${doc.metadata.mood}`);
    console.log(`   标签: ${doc.metadata.tags.join(', ')}`);
    console.log(`   内容: ${doc.pageContent}\n`);
  });
}

/**
 * Update: 更新数据
 *
 * 为什么采用"删除后插入"的方式？
 * - PGVectorStore 没有直接的 update 方法
 * - 更新文档内容意味着向量也要变化，所以需要重新生成 embedding
 * - 对比 Milvus：使用 upsert() 方法，根据主键自动判断是插入还是更新
 */
async function update() {
  console.log('\n========== UPDATE (更新数据) ==========');

  const vectorStore = await PGVectorStore.fromExistingIndex(
    embeddings,
    postgresConfig
  );

  const updateId = 'diary_001';
  console.log(`更新日记 ID: ${updateId}\n`);

  // 步骤1: 删除旧记录
  await vectorStore.delete({ ids: [updateId] });
  console.log('✓ 已删除旧记录');

  // 步骤2: 插入新记录（相同 ID，不同内容）
  const updatedDoc = new Document({
    pageContent: '今天下了一整天的雨，心情很糟糕。工作上遇到了很多困难，感觉压力很大。',
    metadata: {
      id: updateId,
      date: '2026-01-10',
      mood: 'sad',
      tags: ['生活', '天气', '工作']
    }
  });

  await vectorStore.addDocuments([updatedDoc]);
  console.log('✓ 已插入更新后的记录');
  console.log(`   新内容: ${updatedDoc.pageContent}`);
  console.log(`   新心情: ${updatedDoc.metadata.mood}`);
}

/**
 * Delete: 删除数据
 *
 * 为什么只能按 ID 删除？
 * - LangChain 的 PGVectorStore.delete() 主要支持按 ID 删除
 * - 如需条件删除（如 mood == 'sad'），需要直接使用 SQL 或先查询后删除
 * - 对比 Milvus：支持灵活的 filter 表达式（如 `mood == "sad"`）
 */
async function deleteDoc() {
  console.log('\n========== DELETE (删除数据) ==========');

  const vectorStore = await PGVectorStore.fromExistingIndex(
    embeddings,
    postgresConfig
  );

  // 单条删除
  const deleteId = 'diary_005';
  console.log(`删除日记 ID: ${deleteId}`);
  await vectorStore.delete({ ids: [deleteId] });
  console.log(`✓ 已删除 1 条记录\n`);

  // 批量删除
  const deleteIds = ['diary_002', 'diary_003'];
  console.log(`批量删除日记 IDs: ${deleteIds.join(', ')}`);
  await vectorStore.delete({ ids: deleteIds });
  console.log(`✓ 已删除 ${deleteIds.length} 条记录`);
}

// ========== 主函数 ==========

/**
 * 主函数：按顺序演示所有 CRUD 操作
 *
 * 执行流程：
 * 1. Create + Insert - 创建表并插入数据
 * 2. Query - 向量相似度搜索
 * 3. Update - 更新一条记录
 * 4. Query - 再次查询，验证更新效果
 * 5. Delete - 删除记录
 */
async function main() {
  try {
    console.log('==========================================');
    console.log('PostgreSQL + pgvector CRUD 操作演示');
    console.log('对比文件: Milvus CRUD (insert.mjs, query.mjs, update.mjs, delete.mjs)');
    console.log('==========================================');

    // 1. Create + Insert
    await createAndInsert();

    // 2. Query
    await query();

    // 3. Update
    await update();

    // 4. Query again (验证更新)
    console.log('\n===== 验证更新效果 =====');
    await query();

    // 5. Delete
    await deleteDoc();

    console.log('\n========== 操作完成 ==========');
    console.log('\n核心差异总结:');
    console.log('1. Milvus: 专用向量数据库，需手动创建集合/索引/加载');
    console.log('   PostgreSQL: 关系型数据库 + 扩展，PGVectorStore 自动管理');
    console.log('2. Milvus: 使用 upsert() 更新');
    console.log('   PostgreSQL: 使用删除后插入方式更新');
    console.log('3. Milvus: 支持灵活的 filter 表达式删除');
    console.log('   PostgreSQL: 主要支持按 ID 删除');

  } catch (error) {
    console.error('错误:', error.message);
    if (error.message.includes('connect')) {
      console.error('\n提示: 请确保 PostgreSQL 服务已启动，并安装了 pgvector 扩展');
      console.error('安装 pgvector: CREATE EXTENSION vector;');
    }
  } finally {
    process.exit(0);
  }
}

// 执行主函数
main();
