-- HNSW indexes for fast approximate nearest-neighbor search on pgvector columns
CREATE INDEX IF NOT EXISTS "Target_embedding_hnsw" ON "Target" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "Person_embedding_hnsw" ON "Person" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "Cluster_embedding_hnsw" ON "Cluster" USING hnsw ("embedding" vector_cosine_ops);
