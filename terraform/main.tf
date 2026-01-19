# ============================================================================
# GOOGLE CLOUD PROJECT SETUP
# ============================================================================

# APIs aktivieren
resource "google_project_service" "required_apis" {
  for_each = toset([
    "aiplatform.googleapis.com",            # Vertex AI
    "storage.googleapis.com",               # Cloud Storage
    "logging.googleapis.com",               # Cloud Logging
    "cloudresourcemanager.googleapis.com",  # Resource Manager
    "iam.googleapis.com",                   # IAM
  ])

  project = var.project_id
  service = each.value

  disable_on_destroy = false
}

# ============================================================================
# SERVICE ACCOUNT für Backend
# ============================================================================

resource "google_service_account" "backend" {
  account_id   = var.service_account_name
  display_name = "Chatbot Backend Service Account"
  description  = "Service Account für Next.js Backend mit Vertex AI Zugriff"
  project      = var.project_id

  depends_on = [google_project_service.required_apis]
}

# Service Account Key erstellen
resource "google_service_account_key" "backend_key" {
  service_account_id = google_service_account.backend.name
}

# IAM Permissions für Vertex AI
resource "google_project_iam_member" "backend_vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# IAM Permissions für Cloud Storage
resource "google_project_iam_member" "backend_storage" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# IAM Permissions für Logging (Audit Trail)
resource "google_project_iam_member" "backend_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# ============================================================================
# CLOUD STORAGE BUCKET (EU-Region, DSGVO-konform)
# ============================================================================

resource "google_storage_bucket" "documents" {
  name          = var.bucket_name
  location      = var.region # europe-west3 = Frankfurt
  project       = var.project_id

  storage_class = "STANDARD"

  # Uniform Bucket-Level Access (empfohlen)
  uniform_bucket_level_access {
    enabled = true
  }

  # Versionierung aktivieren (für Disaster Recovery)
  versioning {
    enabled = true
  }

  # Lifecycle Rules für DSGVO-Compliance
  lifecycle_rule {
    condition {
      age = var.document_retention_days
    }
    action {
      type = "Delete"
    }
  }

  # Soft Delete (30 Tage Wiederherstellung)
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 30
    }
    action {
      type = "Delete"
    }
  }

  # CORS für Frontend-Uploads (optional)
  cors {
    origin          = ["*"] # TODO: Später einschränken auf deine Domains
    method          = ["GET", "HEAD", "PUT", "POST"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  # Labels für Organisation
  labels = {
    environment = var.environment
    purpose     = "chatbot-documents"
    compliance  = "dsgvo"
  }

  depends_on = [google_project_service.required_apis]
}

# Bucket IAM Binding für Service Account
resource "google_storage_bucket_iam_member" "backend_bucket_admin" {
  bucket = google_storage_bucket.documents.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backend.email}"
}

# ============================================================================
# CLOUD LOGGING für Audit Trail
# ============================================================================

# Log Bucket für längere Retention (DSGVO Nachweispflicht: 3 Jahre)
resource "google_logging_project_bucket_config" "audit_logs" {
  project        = var.project_id
  location       = var.region
  retention_days = 1095 # 3 Jahre
  bucket_id      = "chatbot-audit-logs"

  depends_on = [google_project_service.required_apis]
}

# Log Sink für Audit Logs
resource "google_logging_project_sink" "audit_sink" {
  name        = "chatbot-audit-sink"
  destination = "logging.googleapis.com/${google_logging_project_bucket_config.audit_logs.id}"

  filter = <<-EOT
    resource.type="global"
    logName="projects/${var.project_id}/logs/chatbot-audit"
  EOT

  unique_writer_identity = true
}

# ============================================================================
# MONITORING & ALERTING
# ============================================================================

# Alert bei ungewöhnlich vielen API-Aufrufen
resource "google_monitoring_alert_policy" "high_vertex_ai_usage" {
  display_name = "High Vertex AI Usage"
  combiner     = "OR"

  conditions {
    display_name = "Vertex AI requests > 10k/hour"

    condition_threshold {
      filter          = "resource.type = \"aiplatform.googleapis.com/Endpoint\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 10000

      aggregations {
        alignment_period   = "3600s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = []

  depends_on = [google_project_service.required_apis]
}
