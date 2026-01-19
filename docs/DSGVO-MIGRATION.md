# Migration zu DSGVO-konformer Architektur

## Übersicht

Dieses Dokument beschreibt die Migration von der Gemini Public API zu einer DSGVO-konformen Vertex AI Implementierung in Google Cloud Platform.

## Warum die Migration notwendig ist

### Aktuelle Situation (Nicht DSGVO-konform)

- ❌ Gemini Public API (`@google/genai`) → US-Server
- ❌ Google Files API → Keine Kontrolle über Datenverarbeitung
- ❌ Keine Data Processing Agreement (DPA) mit ausreichenden Garantien
- ❌ Daten könnten theoretisch für Training genutzt werden

### Ziel (DSGVO-konform)

- ✅ Vertex AI in Google Cloud (EU-Region: `europe-west3` Frankfurt)
- ✅ Cloud Storage in EU-Region
- ✅ Google Cloud DPA mit Standard Contractual Clauses (SCCs)
- ✅ Garantierte Nicht-Nutzung für ML-Training
- ✅ Audit Logs für Compliance-Nachweis

## Migrations-Schritte

### Phase 1: Infrastruktur (Terraform)

**Status:** ✅ Bereit zur Ausführung

Alle Terraform-Definitionen sind im `/terraform` Verzeichnis verfügbar.

**Aktion:**
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars bearbeiten
terraform init
terraform apply
```

**Siehe:** [`/terraform/README.md`](../terraform/README.md)

### Phase 2: Backend Code-Änderungen

**Status:** 🔄 Ausstehend

#### 2.1 Dependencies aktualisieren

**Datei:** `/apps/api/package.json`

```diff
{
  "dependencies": {
-   "@google/genai": "^0.x.x",
+   "@google-cloud/vertexai": "^1.7.0",
+   "@google-cloud/storage": "^7.13.0",
+   "@google-cloud/logging": "^11.2.0"
  }
}
```

#### 2.2 GeminiAgent auf Vertex AI migrieren

**Datei:** `/apps/api/utils/agent/GeminiAgent.ts`

```diff
- import { GoogleGenAI } from "@google/genai";
+ import { VertexAI } from "@google-cloud/vertexai";

export class GeminiAgent {
-   private client: GoogleGenAI;
+   private client: VertexAI;

-   constructor(apiKey: string) {
+   constructor(projectId: string, location: string = "europe-west3") {
-       this.client = new GoogleGenAI({ apiKey });
+       this.client = new VertexAI({ project: projectId, location });
    }

    async sendMessage(...) {
-       const chat = this.client.chats.create({
-           model: "gemini-2.0-flash",
+       const model = this.client.preview.getGenerativeModel({
+           model: "gemini-2.0-flash-001",
+           systemInstruction: dynamicSystemInstruction,
+           tools: [SALARY_TOOL],
+       });
+       const chat = model.startChat({ history: chatHistory });
        // ...
    }
}
```

#### 2.3 Document Upload zu Cloud Storage migrieren

**Datei:** `/apps/api/utils/documents.ts`

```diff
- import { GoogleGenAI } from "@google/genai";
+ import { Storage } from "@google-cloud/storage";
+ import { VertexAI } from "@google-cloud/vertexai";

- function getGeminiClient() {
-     return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
- }

+ function getCloudStorage() {
+     return new Storage({
+         projectId: process.env.GCP_PROJECT_ID,
+         keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
+     });
+ }

export async function uploadDocumentService(...) {
-   const client = getGeminiClient();
-   const uploadResult = await client.files.upload({ ... });

+   const storage = getCloudStorage();
+   const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
+   const blob = bucket.file(`documents/${userId}/${fileName}`);
+
+   await blob.save(Buffer.from(await file.arrayBuffer()), {
+       metadata: { contentType: mimeType },
+   });
+
+   const gsUri = `gs://${process.env.GCS_BUCKET_NAME}/documents/${userId}/${fileName}`;

    await supabase.from("documents").insert({
        // ...
-       google_file_uri: uploadResult.uri,
-       google_file_name: uploadResult.name,
+       gcs_uri: gsUri,
    });
}
```

#### 2.4 Audit Logging hinzufügen

**Neue Datei:** `/apps/api/utils/audit/logger.ts`

```typescript
import { Logging } from "@google-cloud/logging";

const logging = new Logging({
    projectId: process.env.GCP_PROJECT_ID,
});

const log = logging.log("chatbot-audit");

export async function logDataProcessing(event: {
    userId?: string;
    projectId: string;
    action: "chat_request" | "document_upload" | "document_delete" | "calculation";
    metadata: Record<string, any>;
}) {
    const entry = log.entry({
        severity: "INFO",
        resource: { type: "global" },
    }, {
        timestamp: new Date().toISOString(),
        ...event,
    });

    await log.write(entry);
}
```

**Integration in:** `/apps/api/app/api/chat/route.ts`

```typescript
import { logDataProcessing } from "@/utils/audit/logger";

export async function POST(request: Request) {
    // ... validation ...

    await logDataProcessing({
        projectId: publicKey,
        action: "chat_request",
        metadata: {
            origin: request.headers.get("origin"),
            ip: clientIp,
        },
    });

    // ... rest ...
}
```

#### 2.5 Environment Variables

**Datei:** `/apps/api/.env.local`

```diff
- GEMINI_API_KEY=AIza...

+ GCP_PROJECT_ID=dein-projekt-id
+ GCP_LOCATION=europe-west3
+ GCS_BUCKET_NAME=chatbot-docs-dein-projekt-prod-eu
+ GOOGLE_APPLICATION_CREDENTIALS=/pfad/zu/service-account.json
+ # Für Vercel/Cloud:
+ # GCP_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

### Phase 3: Database Migration

**Datei:** Migration Script (Supabase oder direkt SQL)

```sql
-- Neue Spalten hinzufügen
ALTER TABLE documents ADD COLUMN gcs_uri TEXT;
ALTER TABLE documents ADD COLUMN cache_name TEXT;

-- Index erstellen
CREATE INDEX idx_documents_gcs_uri ON documents(gcs_uri);
```

**Migration bestehender Dokumente:**

Erstelle ein Script: `/scripts/migrate-documents-to-gcs.ts`

### Phase 4: Testing

- [ ] Lokale Tests mit Vertex AI
- [ ] Document Upload testen
- [ ] Chat-Funktionalität testen
- [ ] Audit Logs prüfen
- [ ] Performance-Tests

### Phase 5: Deployment

- [ ] Staging-Umgebung deployen
- [ ] Integration-Tests
- [ ] Production Deployment
- [ ] Monitoring aktivieren

## Rollback-Plan

Falls Probleme auftreten:

1. Environment Variables zurücksetzen (alte GEMINI_API_KEY)
2. Code auf vorherige Version zurücksetzen
3. Database Migration rückgängig machen (optional)

## DSGVO-Compliance Checkliste

Nach Migration:

- [ ] Alle Daten in EU-Region (`europe-west3`)
- [ ] Service Account mit minimal permissions
- [ ] Audit Logs aktiviert (3 Jahre Retention)
- [ ] Verschlüsselung at rest (Cloud Storage default)
- [ ] Verschlüsselung in transit (TLS 1.3)
- [ ] Google Cloud DPA unterzeichnet
- [ ] Datenschutz-Folgenabschätzung (DPIA) erstellt
- [ ] Dokumentation für Betroffenenrechte

## Kosten-Vergleich

| Komponente | Public API | Vertex AI (EU) |
|------------|-----------|----------------|
| Gemini 2.0 Flash | $0.075/1M Tokens | $0.075/1M Tokens |
| Context Caching | ❌ | ✅ $0.01875/1M |
| Storage | ❌ | ~$0.02/GB/Monat |
| Audit Logs | ❌ | ~$0.50/GB |
| **DSGVO-Compliance** | ❌ | ✅ |

**Fazit:** Nahezu identische Kosten, aber volle DSGVO-Compliance!

## Zeitplan

- **Infrastruktur (Terraform):** 1 Tag
- **Backend Code-Änderungen:** 2-3 Tage
- **Testing:** 1-2 Tage
- **Deployment:** 1 Tag

**Total:** ~1 Woche

## Support & Dokumentation

- [Terraform Setup](../terraform/README.md)
- [Vertex AI Docs](https://cloud.google.com/vertex-ai/docs)
- [Cloud Storage Docs](https://cloud.google.com/storage/docs)
- [DSGVO Guidelines](https://gdpr.eu/)

## Status Tracking

- [ ] Phase 1: Infrastruktur (Terraform)
- [ ] Phase 2: Backend Code
- [ ] Phase 3: Database Migration
- [ ] Phase 4: Testing
- [ ] Phase 5: Production Deployment

**Aktueller Status:** Phase 1 bereit
