#!/bin/bash

# Terraform Setup Script für DSGVO-konforme GCP Infrastruktur
# Verwendung: ./setup.sh

set -e

echo "🚀 Terraform Setup für Chatbot Gehalt Pflege"
echo "=============================================="
echo ""

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Prerequisites
echo "📋 Prüfe Voraussetzungen..."

if ! command -v terraform &> /dev/null; then
    echo -e "${RED}❌ Terraform nicht installiert!${NC}"
    echo "Installation: https://developer.hashicorp.com/terraform/downloads"
    exit 1
fi
echo -e "${GREEN}✅ Terraform gefunden: $(terraform version | head -n1)${NC}"

if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Google Cloud CLI nicht installiert!${NC}"
    echo "Installation: https://cloud.google.com/sdk/docs/install"
    exit 1
fi
echo -e "${GREEN}✅ gcloud CLI gefunden${NC}"

# Check für terraform.tfvars
if [ ! -f "terraform.tfvars" ]; then
    echo -e "${YELLOW}⚠️  terraform.tfvars nicht gefunden!${NC}"
    echo ""
    echo "Bitte erstelle die Datei:"
    echo "  cp terraform.tfvars.example terraform.tfvars"
    echo "  nano terraform.tfvars"
    echo ""
    exit 1
fi
echo -e "${GREEN}✅ terraform.tfvars gefunden${NC}"

# Check GCloud Auth
echo ""
echo "🔐 Prüfe Google Cloud Authentifizierung..."

if ! gcloud auth application-default print-access-token &> /dev/null; then
    echo -e "${YELLOW}⚠️  Nicht authentifiziert!${NC}"
    echo ""
    read -p "Möchtest du dich jetzt authentifizieren? (j/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Jj]$ ]]; then
        gcloud auth application-default login
    else
        echo -e "${RED}Abgebrochen.${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✅ Authentifizierung erfolgreich${NC}"

# Terraform Init
echo ""
echo "🔧 Terraform initialisieren..."
terraform init

# Terraform Validate
echo ""
echo "✔️  Validiere Konfiguration..."
terraform validate

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Konfiguration ist valide${NC}"
else
    echo -e "${RED}❌ Validierung fehlgeschlagen!${NC}"
    exit 1
fi

# Terraform Plan
echo ""
echo "📊 Erstelle Deployment-Plan..."
terraform plan -out=tfplan

# Ask for Confirmation
echo ""
echo -e "${YELLOW}⚠️  Bereit zum Deployment!${NC}"
echo ""
echo "Die folgenden Ressourcen werden erstellt:"
echo "  - Service Account (chatbot-backend)"
echo "  - Cloud Storage Bucket (EU-Region)"
echo "  - IAM Bindings (Vertex AI, Storage, Logging)"
echo "  - Cloud Logging Bucket (3 Jahre Retention)"
echo "  - Monitoring Alert"
echo ""
read -p "Möchtest du die Infrastruktur jetzt erstellen? (j/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Jj]$ ]]; then
    echo -e "${YELLOW}Abgebrochen. Plan wurde gespeichert in: tfplan${NC}"
    echo "Später ausführen mit: terraform apply tfplan"
    exit 0
fi

# Terraform Apply
echo ""
echo "🚀 Erstelle Infrastruktur..."
terraform apply tfplan

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Infrastruktur erfolgreich erstellt!${NC}"
    echo ""

    # Extract Service Account Key
    echo "🔑 Extrahiere Service Account Key..."

    OUTPUT_DIR="../apps/api"
    KEY_FILE="$OUTPUT_DIR/service-account.json"

    terraform output -raw service_account_key | base64 -d > "$KEY_FILE"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Service Account Key gespeichert: $KEY_FILE${NC}"
        chmod 600 "$KEY_FILE"
    else
        echo -e "${RED}❌ Fehler beim Extrahieren des Keys${NC}"
    fi

    # Show Environment Variables
    echo ""
    echo "📝 Environment Variables für .env.local:"
    echo "=========================================="
    terraform output -raw env_vars
    echo ""
    echo "GOOGLE_APPLICATION_CREDENTIALS=$(realpath $KEY_FILE)"
    echo ""

    # Show Outputs
    echo ""
    echo "📊 Zusammenfassung:"
    echo "==================="
    echo "Service Account: $(terraform output -raw service_account_email)"
    echo "Bucket: $(terraform output -raw bucket_name)"
    echo "Bucket URL: $(terraform output -raw bucket_url)"
    echo "Project ID: $(terraform output -raw project_id)"
    echo "Region: $(terraform output -raw region)"
    echo ""

    echo -e "${GREEN}🎉 Setup abgeschlossen!${NC}"
    echo ""
    echo "Nächste Schritte:"
    echo "1. Kopiere die Environment Variables in apps/api/.env.local"
    echo "2. Migriere den Backend-Code (siehe docs/DSGVO-MIGRATION.md)"
    echo "3. Teste die Integration"
    echo ""

    # Cleanup
    rm -f tfplan

else
    echo -e "${RED}❌ Deployment fehlgeschlagen!${NC}"
    exit 1
fi
