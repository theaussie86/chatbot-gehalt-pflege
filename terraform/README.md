# Terraform Infrastructure für DSGVO-konformen Chatbot

Diese Terraform-Konfiguration erstellt alle benötigten Google Cloud Platform (GCP) Ressourcen für den Chatbot mit DSGVO-Compliance.

## Voraussetzungen

1. **Google Cloud CLI** installiert:
   ```bash
   # macOS
   brew install google-cloud-sdk

   # Linux
   curl https://sdk.cloud.google.com | bash

   # Windows
   # Download von https://cloud.google.com/sdk/docs/install
   ```

2. **Terraform** installiert (>= 1.0):
   ```bash
   # macOS
   brew install terraform

   # Linux
   wget https://releases.hashicorp.com/terraform/1.6.6/terraform_1.6.6_linux_amd64.zip
   unzip terraform_1.6.6_linux_amd64.zip
   sudo mv terraform /usr/local/bin/

   # Oder über Package Manager
   ```

3. **Google Cloud Account** mit aktiviertem Billing

## Erstmaliges Setup

### 1. Google Cloud Projekt erstellen (optional, falls noch nicht vorhanden)

```bash
# Login
gcloud auth login

# Projekt erstellen
gcloud projects create dein-projekt-id --name="Chatbot Gehalt Pflege"

# Als aktives Projekt setzen
gcloud config set project dein-projekt-id

# Billing Account verknüpfen (erforderlich!)
gcloud billing accounts list
gcloud billing projects link dein-projekt-id --billing-account=DEINE_BILLING_ID
```

### 2. Terraform Konfiguration anpassen

```bash
cd terraform

# Kopiere das Template
cp terraform.tfvars.example terraform.tfvars

# Bearbeite terraform.tfvars mit deinen Werten
nano terraform.tfvars
```

**Wichtig:** `bucket_name` muss global eindeutig sein!

### 3. GCloud Auth für Terraform

```bash
# Application Default Credentials setzen
gcloud auth application-default login

# Oder: Service Account Key (für CI/CD)
# gcloud iam service-accounts create terraform-admin --display-name="Terraform Admin"
# gcloud projects add-iam-policy-binding dein-projekt-id \
#   --member="serviceAccount:terraform-admin@dein-projekt-id.iam.gserviceaccount.com" \
#   --role="roles/owner"
# gcloud iam service-accounts keys create terraform-key.json \
#   --iam-account=terraform-admin@dein-projekt-id.iam.gserviceaccount.com
# export GOOGLE_APPLICATION_CREDENTIALS="./terraform-key.json"
```

### 4. Terraform initialisieren und ausführen

```bash
# Provider herunterladen
terraform init

# Plan anschauen (Dry-Run)
terraform plan

# Infrastruktur erstellen
terraform apply
# Tippe "yes" zur Bestätigung
```

⏱️ **Dauer:** ca. 2-3 Minuten

## Service Account Key extrahieren

Nach erfolgreichem `terraform apply`:

```bash
# 1. Key als JSON-Datei speichern (für lokale Entwicklung)
terraform output -raw service_account_key | base64 -d > ../apps/api/service-account.json

# 2. Für Vercel/Cloud Deployment (einzeilige JSON-String)
terraform output -raw service_account_key | base64 -d | jq -c

# 3. Environment Variables anzeigen
terraform output -raw env_vars
```

## .env.local Konfiguration

Füge die Werte zu deiner `.env.local` im `/apps/api` Verzeichnis hinzu:

```bash
# Im terraform Verzeichnis:
terraform output -raw env_vars

# Ausgabe kopieren und in apps/api/.env.local einfügen
```

**Für lokale Entwicklung:**
```env
GCP_PROJECT_ID=dein-projekt-id
GCP_LOCATION=europe-west3
GCS_BUCKET_NAME=chatbot-docs-dein-projekt-prod-eu
GOOGLE_APPLICATION_CREDENTIALS=/pfad/zu/service-account.json
```

**Für Vercel/Cloud Deployment:**
```env
GCP_PROJECT_ID=dein-projekt-id
GCP_LOCATION=europe-west3
GCS_BUCKET_NAME=chatbot-docs-dein-projekt-prod-eu
GCP_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"..."}'
```

## Erstellte Ressourcen

Nach dem Deployment existieren folgende Ressourcen:

| Ressource | Zweck | Region |
|-----------|-------|--------|
| **Service Account** | Authentifizierung für Backend | Global |
| **Cloud Storage Bucket** | Dokument-Speicherung | `europe-west3` (Frankfurt) |
| **IAM Bindings** | Berechtigungen (Vertex AI, Storage, Logging) | Global |
| **Cloud Logging Bucket** | Audit Logs (3 Jahre Retention) | `europe-west3` |
| **Monitoring Alert** | Alert bei hoher API-Nutzung | Global |

## Wartung

### Infrastruktur-Updates

```bash
# Nach Änderungen in *.tf Files:
terraform plan    # Änderungen reviewen
terraform apply   # Anwenden
```

### Outputs erneut anzeigen

```bash
terraform output                           # Alle Outputs
terraform output service_account_email     # Nur Email
terraform output -raw service_account_key  # Key (sensitive)
```

### State Management

```bash
# State Backup (vor kritischen Änderungen)
terraform state pull > backup-$(date +%Y%m%d-%H%M%S).tfstate

# Liste aller verwalteten Ressourcen
terraform state list
```

### Kosten überwachen

```bash
# Im GCP Console:
# Navigation → Billing → Reports
# Oder:
gcloud billing accounts list
```

**Erwartete Kosten** (10.000 Chats/Monat):
- Vertex AI: ~0.34 €/Monat
- Cloud Storage: ~0.02 €/Monat
- Logging: ~0.05 €/Monat
- **Total: ~0.41 €/Monat**

## Troubleshooting

### Fehler: "Quota exceeded"

```bash
# Quota erhöhen über GCP Console:
# APIs & Services → Quotas → Search "Vertex AI"
```

### Fehler: "Bucket name already exists"

Der Bucket-Name muss global eindeutig sein. Ändere in `terraform.tfvars`:
```hcl
bucket_name = "chatbot-docs-DEIN-PROJEKT-$(uuidgen)-eu"
```

### Fehler: "API not enabled"

```bash
# APIs manuell aktivieren:
gcloud services enable aiplatform.googleapis.com
gcloud services enable storage.googleapis.com
```

### Service Account Key erneuern

```bash
# Alten Key revoken
terraform state rm google_service_account_key.backend_key

# Neuen Key erstellen
terraform apply
```

## Sicherheit

⚠️ **Wichtig:**

1. **NIEMALS** `terraform.tfvars` oder `service-account.json` in Git committen!
2. Service Account Keys regelmäßig rotieren (alle 90 Tage)
3. Bucket Name nicht öffentlich bekannt machen
4. CORS origins in Production auf spezifische Domains einschränken

## Cleanup (Vorsicht!)

```bash
# Alle Ressourcen löschen (nur für Test-Umgebungen!)
terraform destroy

# Einzelne Ressource entfernen
terraform destroy -target=google_monitoring_alert_policy.high_vertex_ai_usage
```

⚠️ **Achtung:** `destroy` löscht ALLE Daten unwiderruflich!

## Nächste Schritte

Nach erfolgreichem Deployment:

1. ✅ Backend-Code auf Vertex AI migrieren (`GeminiAgent.ts`)
2. ✅ Document Upload auf Cloud Storage umstellen (`documents.ts`)
3. ✅ Tests durchführen
4. ✅ DSGVO-Dokumentation ergänzen

Siehe: `/docs/vertex-ai-migration.md` (coming soon)

## Support

Bei Fragen oder Problemen:
- Google Cloud Docs: https://cloud.google.com/vertex-ai/docs
- Terraform GCP Provider: https://registry.terraform.io/providers/hashicorp/google/latest/docs
