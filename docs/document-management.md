# Document Management System

This document describes the complete document management system including upload, embedding generation, deletion, and RAG query flows.

## Table of Contents

1. [Overview](#overview)
2. [Upload Flow](#upload-flow)
3. [Embedding Pipeline](#embedding-pipeline)
4. [Delete Flow](#delete-flow)
5. [RAG Query Flow](#rag-query-flow)
6. [Architecture Diagram](#architecture-diagram)
7. [Configuration](#configuration)
8. [GDPR Compliance & Vertex AI Migration](#gdpr-compliance--vertex-ai-migration)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The document management system enables:

- **PDF Upload** - Users upload PDF documents to projects or as global documents
- **Automatic Embedding** - Asynchronous text extraction and vector embedding generation
- **Semantic Search** - RAG-based retrieval for chat context enrichment
- **Status Tracking** - Real-time visibility into processing state

### Document Lifecycle

```
Upload → pending → processing → embedded
                            ↘ error
```

| Status | Description |
|--------|-------------|
| `pending` | Document uploaded, waiting for processing |
| `processing` | Edge Function is extracting text and generating embeddings |
| `embedded` | Ready for RAG queries |
| `error` | Processing failed (check Edge Function logs) |

---

## Upload Flow

### Sequence Diagram

```
┌─────────┐    ┌────────────────┐    ┌─────────────────────┐    ┌─────────┐    ┌──────────┐
│ Browser │    │ DocumentManager│    │ uploadDocumentAction│    │ Storage │    │ Database │
└────┬────┘    └───────┬────────┘    └──────────┬──────────┘    └────┬────┘    └────┬─────┘
     │                 │                        │                    │              │
     │ Select PDF      │                        │                    │              │
     │────────────────>│                        │                    │              │
     │                 │                        │                    │              │
     │                 │ FormData + projectId   │                    │              │
     │                 │───────────────────────>│                    │              │
     │                 │                        │                    │              │
     │                 │                        │ Upload file        │              │
     │                 │                        │───────────────────>│              │
     │                 │                        │                    │              │
     │                 │                        │ INSERT document    │              │
     │                 │                        │────────────────────│─────────────>│
     │                 │                        │                    │              │
     │                 │                        │    status='pending'│              │
     │                 │     { success: true }  │<───────────────────│──────────────│
     │                 │<───────────────────────│                    │              │
     │                 │                        │                    │              │
     │ Toast: "Processing started"              │                    │              │
     │<────────────────│                        │                    │              │
```

### Components

#### 1. Frontend - DocumentManager

**File:** `apps/api/components/DocumentManager.tsx`

```tsx
// User selects file and submits
const handleUpload = async (e: FormEvent<HTMLFormElement>) => {
  const formData = new FormData(e.currentTarget);
  if (projectId) {
    formData.append('projectId', projectId);
  }

  const result = await uploadDocumentAction(formData);

  if (result.success) {
    toast.success('Document uploaded. Processing started in background.');
    router.refresh();
  }
};
```

#### 2. Server Action - uploadDocumentAction

**File:** `apps/api/app/actions/documents.ts`

```typescript
export async function uploadDocumentAction(formData: FormData) {
  // 1. Authenticate user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // 2. Extract file and projectId
  const file = formData.get('file') as File;
  const projectId = formData.get('projectId') as string | null;

  // 3. Upload via service
  const result = await uploadDocumentService(supabase, file, projectId || undefined);

  // 4. Revalidate UI
  revalidatePath('/documents');
  revalidatePath(`/projects/${projectId}`);

  return result;
}
```

#### 3. Upload Service - uploadDocumentService

**File:** `apps/api/utils/documents.ts`

```typescript
export async function uploadDocumentService(
  supabase: SupabaseClient,
  file: File,
  projectId?: string
) {
  const fileName = `${Date.now()}-${file.name}`;
  const folder = projectId || 'global';
  const storagePath = `${folder}/${fileName}`;

  // Step 1: Upload to Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('project-files')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: true
    });

  if (uploadError) {
    return { error: uploadError.message };
  }

  // Step 2: Create database record
  const { data: document, error: dbError } = await supabase
    .from('documents')
    .insert({
      project_id: projectId || null,
      filename: file.name,
      mime_type: file.type,
      storage_path: storagePath,
      storage_object_id: uploadData.id,
      status: 'pending'  // Triggers embedding pipeline
    })
    .select()
    .single();

  if (dbError) {
    // Cleanup: Delete uploaded file on DB error
    await supabase.storage.from('project-files').remove([storagePath]);
    return { error: dbError.message };
  }

  return { success: true, document };
}
```

### Storage Path Structure

```
project-files/
├── global/                          # Global documents (no projectId)
│   ├── 1705123456789-report.pdf
│   └── 1705123456790-guide.pdf
│
└── {project-uuid}/                  # Project-specific documents
    ├── 1705123456791-manual.pdf
    └── 1705123456792-faq.pdf
```

---

## Embedding Pipeline

The embedding pipeline runs **asynchronously** after document upload.

### Trigger Mechanism

**File:** `apps/api/migrations/20260116000000_setup_embedding_webhook.sql`

```sql
-- Trigger fires on INSERT when status = 'pending'
CREATE TRIGGER on_document_created_process_embeddings
  AFTER INSERT ON documents
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION trigger_process_embeddings();

-- Function sends HTTP POST to Edge Function
CREATE OR REPLACE FUNCTION trigger_process_embeddings()
RETURNS trigger AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/process-embeddings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || <service_role_key>
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'documents',
      'record', row_to_json(NEW)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Edge Function - process-embeddings

**File:** `supabase/functions/process-embeddings/index.ts`

#### Step-by-Step Process

```typescript
Deno.serve(async (req: Request) => {
  const { record: document } = await req.json();

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Update status to 'processing'
  // ═══════════════════════════════════════════════════════════
  await supabase
    .from('documents')
    .update({ status: 'processing' })
    .eq('id', document.id);

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Download file from Storage
  // ═══════════════════════════════════════════════════════════
  const { data: fileBlob } = await supabase.storage
    .from('project-files')
    .download(document.storage_path);

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Upload to Gemini File API (temporary)
  // ═══════════════════════════════════════════════════════════
  const uploadResult = await genAI.files.upload({
    file: new File([fileBlob], document.filename, { type: document.mime_type }),
    config: { mimeType: document.mime_type, displayName: document.filename }
  });

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Extract text using Gemini 2.5 Flash
  // ═══════════════════════════════════════════════════════════
  const extractionResult = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      parts: [
        { fileData: { mimeType: document.mime_type, fileUri: uploadResult.file.uri } },
        { text: 'Extract all text from this document. Return only the raw text, no markdown.' }
      ]
    }]
  });
  const extractedText = extractionResult.text;

  // ═══════════════════════════════════════════════════════════
  // STEP 5: Split into chunks
  // ═══════════════════════════════════════════════════════════
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ["\n\n", "\n", " ", ""]
  });
  const chunks = await splitter.splitText(extractedText);

  // ═══════════════════════════════════════════════════════════
  // STEP 6: Generate embeddings and insert chunks
  // ═══════════════════════════════════════════════════════════
  const BATCH_SIZE = 10;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const records = [];

    for (let j = 0; j < batch.length; j++) {
      const chunkText = batch[j];

      // Generate embedding
      const embedResult = await genAI.models.embedContent({
        model: 'text-embedding-004',
        contents: chunkText
      });

      records.push({
        document_id: document.id,
        chunk_index: i + j,
        content: chunkText,
        embedding: embedResult.embeddings[0].values,  // 768-dimensional vector
        token_count: Math.ceil(chunkText.length / 4)
      });
    }

    // Batch insert
    await supabase.from('document_chunks').insert(records);
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 7: Cleanup and update status
  // ═══════════════════════════════════════════════════════════
  await genAI.files.delete(uploadResult.file.name);  // Delete from Gemini

  await supabase
    .from('documents')
    .update({ status: 'embedded' })
    .eq('id', document.id);

  return new Response(JSON.stringify({ success: true }));
});
```

### Chunking Strategy

The system uses **Recursive Character Text Splitting**:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `chunkSize` | 1000 | Target characters per chunk |
| `chunkOverlap` | 200 | Characters shared between chunks for context |
| `separators` | `["\n\n", "\n", " ", ""]` | Priority order for splitting |

**How it works:**
1. Try to split on `\n\n` (paragraphs)
2. If chunk too big, split on `\n` (lines)
3. If still too big, split on ` ` (words)
4. Last resort: split on characters

### Embedding Model

| Property | Value |
|----------|-------|
| Model | `text-embedding-004` |
| Dimensions | 768 |
| Provider | Google Gemini |
| Index Type | HNSW (Hierarchical Navigable Small World) |
| Similarity Metric | Cosine |

---

## Delete Flow

### Sequence Diagram

```
┌─────────┐    ┌────────────────┐    ┌─────────────────────┐    ┌─────────┐    ┌──────────┐
│ Browser │    │ DocumentManager│    │ deleteDocumentAction│    │ Storage │    │ Database │
└────┬────┘    └───────┬────────┘    └──────────┬──────────┘    └────┬────┘    └────┬─────┘
     │                 │                        │                    │              │
     │ Click Delete    │                        │                    │              │
     │────────────────>│                        │                    │              │
     │                 │                        │                    │              │
     │                 │ Confirm Dialog         │                    │              │
     │<────────────────│                        │                    │              │
     │                 │                        │                    │              │
     │ Confirm         │                        │                    │              │
     │────────────────>│                        │                    │              │
     │                 │                        │                    │              │
     │                 │ deleteDocumentAction   │                    │              │
     │                 │───────────────────────>│                    │              │
     │                 │                        │                    │              │
     │                 │                        │ SELECT document    │              │
     │                 │                        │────────────────────│─────────────>│
     │                 │                        │                    │              │
     │                 │                        │ Remove file        │              │
     │                 │                        │───────────────────>│              │
     │                 │                        │                    │              │
     │                 │                        │ DELETE document    │              │
     │                 │                        │────────────────────│─────────────>│
     │                 │                        │                    │   CASCADE    │
     │                 │                        │                    │   deletes    │
     │                 │                        │                    │   chunks     │
     │                 │     { success: true }  │                    │              │
     │                 │<───────────────────────│                    │              │
     │                 │                        │                    │              │
     │ Toast: "Deleted"│                        │                    │              │
     │<────────────────│                        │                    │              │
```

### Delete Service

**File:** `apps/api/utils/documents.ts`

```typescript
export async function deleteDocumentService(
  supabase: SupabaseClient,
  documentId: string
) {
  // Step 1: Fetch document (RLS ensures access)
  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (fetchError || !document) {
    return { error: 'Document not found or access denied' };
  }

  // Step 2: Delete from Storage
  if (document.storage_path) {
    const { error: storageError } = await supabase.storage
      .from('project-files')
      .remove([document.storage_path]);

    if (storageError) {
      console.error('Storage deletion failed:', storageError);
      // Continue with DB deletion anyway
    }
  }

  // Step 3: Delete from Database (cascades to document_chunks)
  const { error: deleteError, count } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (deleteError || count === 0) {
    return { error: 'Failed to delete document' };
  }

  return { success: true };
}
```

### Cascade Behavior

When a document is deleted:
1. **Storage file** is explicitly removed
2. **documents row** is deleted
3. **document_chunks** are **automatically deleted** via `ON DELETE CASCADE`

---

## RAG Query Flow

### Integration in Chat

**File:** `apps/api/app/api/chat/route.ts`

When the user asks a question (intent = `'question'`), the system enriches the prompt with relevant document context:

```typescript
if (userIntent === 'question') {
  // Query vectorstore for relevant context
  const relevantContext = await vectorstore.query(
    userMessage,
    projectId,
    3  // top-k results
  );

  // Build prompt with context
  const prompt = `
    User question: ${userMessage}

    Relevant information from documents:
    ${relevantContext}

    Current form state: ${JSON.stringify(formState)}

    Please answer the user's question using the provided context.
  `;

  // Generate response with Gemini
  const response = await gemini.generateContent(prompt);
}
```

### VectorstoreService Query

**File:** `apps/api/lib/vectorstore/VectorstoreService.ts`

```typescript
async query(question: string, projectId: string, topK = 3): Promise<string> {
  // 1. Check cache (24-hour TTL)
  const cacheKey = `${projectId}:${question}`;
  const cached = this.cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 86400000) {
    return cached.answer;
  }

  // 2. Generate embedding for question
  const embedding = await this.generateEmbedding(question);

  // 3. Semantic search via RPC
  const { data: results } = await this.supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_threshold: 0.7,        // 70% minimum similarity
    match_count: topK,
    filter_project_id: projectId
  });

  // 4. Combine results
  if (!results || results.length === 0) {
    return "Ich habe dazu keine spezifischen Informationen in meinen Dokumenten.";
  }

  const answer = results.map(r => r.content).join('\n\n---\n\n');

  // 5. Cache result
  this.cache.set(cacheKey, { answer, timestamp: Date.now() });

  return answer;
}
```

### SQL RPC Function - match_documents

**File:** `apps/api/migrations/20260115120000_init_rag_pipeline.sql`

```sql
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_project_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  document_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_chunks.id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity,
    document_chunks.document_id
  FROM document_chunks
  JOIN documents ON documents.id = document_chunks.document_id
  WHERE
    -- Similarity threshold
    1 - (document_chunks.embedding <=> query_embedding) > match_threshold
    -- Project filter (includes global docs where project_id IS NULL)
    AND (documents.project_id = filter_project_id OR documents.project_id IS NULL)
  ORDER BY document_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### Similarity Calculation

| Operator | Meaning |
|----------|---------|
| `<=>` | Cosine distance (0 = identical, 2 = opposite) |
| `1 - distance` | Cosine similarity (1 = identical, -1 = opposite) |
| Threshold `0.7` | 70% similarity minimum for relevant results |

---

## Architecture Diagram

```
                              ┌───────────────────────────────────────┐
                              │            UPLOAD FLOW                │
                              └───────────────────────────────────────┘
                                              │
                ┌─────────────────────────────┼─────────────────────────────┐
                │                             │                             │
                ▼                             ▼                             ▼
        ┌───────────────┐           ┌─────────────────┐           ┌───────────────┐
        │   Frontend    │           │  Server Action  │           │   Services    │
        │               │──────────▶│                 │──────────▶│               │
        │ DocumentMgr   │           │ uploadDocument  │           │ uploadService │
        └───────────────┘           └─────────────────┘           └───────┬───────┘
                                                                          │
                              ┌───────────────────────────────────────────┤
                              │                                           │
                              ▼                                           ▼
                    ┌─────────────────┐                         ┌─────────────────┐
                    │ Supabase Storage│                         │ Supabase DB     │
                    │                 │                         │                 │
                    │ project-files/  │                         │ documents       │
                    │ └── {id}/file   │                         │ status='pending'│
                    └─────────────────┘                         └────────┬────────┘
                                                                         │
                              ┌──────────────────────────────────────────┘
                              │                TRIGGER
                              ▼
                    ┌───────────────────────────────────────┐
                    │        EMBEDDING PIPELINE             │
                    └───────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────────────────────┐
                    │              Edge Function                          │
                    │                                                     │
                    │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐ │
                    │  │Download │─▶│ Extract │─▶│  Chunk  │─▶│ Embed  │ │
                    │  │ Storage │  │  Text   │  │  Text   │  │Vectors │ │
                    │  └─────────┘  └─────────┘  └─────────┘  └────────┘ │
                    │       │            │            │            │      │
                    │       │       Gemini 2.5   Recursive    Gemini     │
                    │       │         Flash      Splitter   text-embed   │
                    │       │                                   004      │
                    └───────│────────────────────────────────────│───────┘
                            │                                    │
                            │                                    ▼
                            │                          ┌─────────────────┐
                            │                          │ document_chunks │
                            │                          │                 │
                            │                          │ embedding[768]  │
                            │                          │ content         │
                            │                          │ chunk_index     │
                            │                          └─────────────────┘
                            │
                            │
                    ┌───────────────────────────────────────┐
                    │           QUERY FLOW (RAG)            │
                    └───────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────────────────────┐
                    │                Chat Endpoint                        │
                    │                                                     │
                    │  ┌──────────┐   ┌───────────────┐   ┌────────────┐ │
                    │  │ Analyze  │──▶│ VectorStore   │──▶│  Generate  │ │
                    │  │  Intent  │   │    Query      │   │  Response  │ │
                    │  └──────────┘   └───────────────┘   └────────────┘ │
                    │                        │                           │
                    │                        ▼                           │
                    │               ┌─────────────────┐                  │
                    │               │ match_documents │                  │
                    │               │ (RPC Function)  │                  │
                    │               │                 │                  │
                    │               │ Cosine Sim ≥0.7 │                  │
                    │               │ Top-K = 3       │                  │
                    │               └─────────────────┘                  │
                    └─────────────────────────────────────────────────────┘
```

---

## Configuration

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for Edge Function | Yes |
| `GEMINI_API_KEY` | Google Gemini API key | Yes |

### Chunking Parameters

Located in `supabase/functions/process-embeddings/index.ts`:

```typescript
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,      // Characters per chunk
  chunkOverlap: 200,    // Overlap between chunks
});
```

### Query Parameters

Located in `apps/api/lib/vectorstore/VectorstoreService.ts`:

```typescript
const DEFAULTS = {
  matchThreshold: 0.7,  // Minimum cosine similarity
  matchCount: 3,        // Number of results to return
  cacheTTL: 86400000,   // 24 hours in milliseconds
};
```

---

## GDPR Compliance & Vertex AI Migration

> **⚠️ Current Status: NOT GDPR-Compliant**
>
> The current implementation uses **Google AI Studio** (consumer API) via the `@google/genai` SDK. This is **not recommended for processing personal data** under GDPR.

### Current Implementation (Google AI Studio)

| Component | SDK | API | GDPR Status |
|-----------|-----|-----|-------------|
| Text Extraction | `@google/genai` | Gemini 2.5 Flash | ❌ Not compliant |
| Embeddings | `@google/genai` | text-embedding-004 | ❌ Not compliant |
| Chat/Reasoning | `@google/genai` | Gemini 2.0 Flash | ❌ Not compliant |

> **Note:** Chat/Reasoning will be migrated to **Gemini 2.5 Flash** as well for consistency.

**Issues with Google AI Studio:**
- No guaranteed EU data residency
- Data may be used for model training (unless opted out)
- No enterprise Data Processing Agreement (DPA)
- Consumer Terms of Service only

### Target Implementation (Vertex AI)

| Component | SDK | API | GDPR Status |
|-----------|-----|-----|-------------|
| Text Extraction | `@google/genai` | Gemini 2.5 Flash | ✅ Compliant |
| Embeddings | `@google/genai` | text-embedding-004 | ✅ Compliant |
| Chat/Reasoning | `@google/genai` | **Gemini 2.5 Flash** | ✅ Compliant |

> **Unified Model:** All generative tasks (text extraction, chat, reasoning, validation) will use **Gemini 2.5 Flash** for simplicity and consistency.
>
> **Same SDK!** The `@google/genai` SDK supports both Google AI Studio and Vertex AI - only the initialization changes.

**Benefits of Vertex AI:**
- Configurable EU data residency (e.g., `europe-west3` Frankfurt)
- Enterprise DPA/AVV available
- No training on customer data without permission
- EU AI Act Code of Practice signatory
- ISO 42001, SOC 1/2/3 certified

### Migration Plan

#### Phase 1: Environment Setup

1. **Create Google Cloud Project** in EU region
2. **Enable Vertex AI API**
3. **Set up Service Account** with appropriate IAM roles:
   - `roles/aiplatform.user` (Vertex AI User)
4. **Download Service Account JSON key**

```bash
# Set default region
gcloud config set compute/region europe-west3

# Enable Vertex AI
gcloud services enable aiplatform.googleapis.com

# Create Service Account
gcloud iam service-accounts create vertex-ai-client \
  --display-name="Vertex AI Client"

# Grant permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:vertex-ai-client@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Download key (for Supabase Edge Functions)
gcloud iam service-accounts keys create vertex-ai-key.json \
  --iam-account=vertex-ai-client@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

#### Phase 2: SDK Migration

> **Good News:** No SDK change required! The `@google/genai` package supports both backends.

**Current (Google AI Studio):**
```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});
```

**Target (Vertex AI) - Same SDK, different config:**
```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: 'europe-west3'  // Frankfurt - EU data residency
});
```

**All API calls remain identical:**
```typescript
// Text extraction - unchanged
const result = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [...]
});

// Chat/Reasoning - unchanged
const chatResult = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [{ role: 'user', parts: [{ text: userMessage }] }],
  systemInstruction: { parts: [{ text: systemPrompt }] }
});

// Embeddings - unchanged
const embedding = await ai.models.embedContent({
  model: 'text-embedding-004',
  contents: text
});
```

#### Phase 2b: Supabase Edge Function Authentication

For Supabase Edge Functions, authentication requires a Service Account JSON:

```typescript
// supabase/functions/process-embeddings/index.ts
import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';

// Load Service Account from Supabase Secret
const serviceAccountKey = JSON.parse(
  Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') ?? '{}'
);

// Create auth client manually
const auth = new GoogleAuth({
  credentials: serviceAccountKey,
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

// Initialize with Vertex AI
const ai = new GoogleGenAI({
  vertexai: true,
  project: serviceAccountKey.project_id,
  location: 'europe-west3',
  googleAuthOptions: {
    authClient: await auth.getClient()
  }
});

// All API calls work exactly the same as before
const embedding = await ai.models.embedContent({
  model: 'text-embedding-004',
  contents: chunkText
});
```

**Set the Supabase Secret:**
```bash
# Add Service Account JSON as secret
supabase secrets set GOOGLE_SERVICE_ACCOUNT_KEY="$(cat vertex-ai-key.json)"
```

#### Phase 3: Files to Modify

Since we use the same SDK, changes are minimal - only initialization code needs updating:

| File | Changes Required |
|------|------------------|
| `apps/api/lib/gemini.ts` | Change init from `apiKey` to `vertexai: true` |
| `supabase/functions/process-embeddings/index.ts` | Add Service Account auth |

**No changes needed for:**
- `apps/api/lib/vectorstore/VectorstoreService.ts` - API calls unchanged
- `apps/api/utils/agent/GeminiAgent.ts` - API calls unchanged
- `apps/api/utils/agent/ConversationAnalyzer.ts` - API calls unchanged
- `apps/api/utils/agent/ResponseValidator.ts` - API calls unchanged

#### Phase 4: Environment Variables

**Current:**
```env
GEMINI_API_KEY=AIza...
```

**Target (Next.js API):**
```env
# Option A: Environment variables (for local dev / Vercel)
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=my-project-id
GOOGLE_CLOUD_LOCATION=europe-west3

# Option B: Service Account file (for local dev)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/vertex-ai-key.json
```

**Target (Supabase Edge Functions):**
```bash
# Set as Supabase secret
supabase secrets set GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"..."}'
```

#### Phase 5: Verification

1. **Test EU data residency:**
   ```bash
   # Verify API endpoint uses EU region
   curl -v https://europe-west3-aiplatform.googleapis.com/...
   ```

2. **Review audit logs:**
   - Google Cloud Console → Logging → Vertex AI requests
   - Verify all requests route through EU region

3. **Update privacy documentation:**
   - Update privacy policy to reflect Vertex AI usage
   - Document data processing locations
   - Update DPA with Google Cloud terms

### Cost Comparison

| Service | Google AI Studio | Vertex AI |
|---------|------------------|-----------|
| Gemini 2.5 Flash (input) | Free tier available | ~$0.075/1M tokens |
| Gemini 2.5 Flash (output) | Free tier available | ~$0.30/1M tokens |
| text-embedding-004 | Free tier available | ~$0.025/1M tokens |
| SLA | None | 99.9% uptime |
| Support | Community only | Enterprise support |

> **Cost Optimization:** Using Gemini 2.5 Flash for all generative tasks (instead of mixing 2.0 and 2.5) simplifies billing and ensures consistent performance across the application.

### Timeline Recommendation

| Phase | Duration | Priority |
|-------|----------|----------|
| Environment Setup (GCP Project, Service Account) | 1 day | High |
| SDK Initialization Change | 1-2 hours | High |
| Edge Function Auth Update | 2-4 hours | High |
| Testing | 1 day | High |
| Documentation Update | 1 day | Medium |
| **Total** | **2-3 days** | |

> **Significantly Faster:** Since the `@google/genai` SDK supports both backends, we only need to change initialization code - not every API call.

### References

- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Vertex AI Data Residency](https://cloud.google.com/vertex-ai/docs/general/data-residency)
- [Google Cloud GDPR Compliance](https://cloud.google.com/privacy/gdpr)
- [Google Cloud EU AI Act Support](https://cloud.google.com/blog/products/identity-security/google-clouds-commitment-to-eu-ai-act-support)

---

## Troubleshooting

### Document stuck in "pending"

1. **Check Edge Function logs**
   - Supabase Dashboard → Functions → process-embeddings → Logs

2. **Verify trigger exists**
   ```sql
   SELECT * FROM pg_trigger WHERE tgname LIKE '%embedding%';
   ```

3. **Check pg_net extension**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_net';
   ```

4. **Manual reprocess**
   - Use "Reprocess" button in DocumentManager
   - Or: `UPDATE documents SET status = 'pending' WHERE id = '<id>'`

### Document stuck in "processing"

1. **Check for Edge Function errors**
2. **Verify Gemini API key is valid**
3. **Check file size** (max 52MB)
4. **Reset status manually:**
   ```sql
   UPDATE documents SET status = 'pending' WHERE status = 'processing';
   ```

### No results from RAG query

1. **Check if chunks exist**
   ```sql
   SELECT COUNT(*) FROM document_chunks
   WHERE document_id = '<document-id>';
   ```

2. **Verify project_id filter**
   - Global docs have `project_id = NULL`
   - Query includes both project-specific and global docs

3. **Lower similarity threshold** (temporarily)
   ```typescript
   match_threshold: 0.5  // Instead of 0.7
   ```

4. **Check embedding model consistency**
   - Same model (`text-embedding-004`) must be used for indexing and querying

### Storage upload fails

1. **Check RLS policies**
   - User must be `admin` or `editor` for project docs
   - User must be `global admin` for global docs

2. **Verify bucket exists**
   ```sql
   SELECT * FROM storage.buckets WHERE id = 'project-files';
   ```

3. **Check file type** (only PDF allowed)

### Delete fails silently

1. **Check RLS policies** (see `docs/database-schema.md`)
2. **Verify user has admin/editor role**
3. **Check for "global" path UUID cast error** (fixed in migration 20260121000000)

---

## Related Documentation

- [Database Schema & RLS](./database-schema.md) - Complete schema and policies
- [CLAUDE.md](../CLAUDE.md) - Project overview
