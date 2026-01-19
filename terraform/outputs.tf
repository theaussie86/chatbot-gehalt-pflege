output "service_account_email" {
  description = "Email des Backend Service Accounts"
  value       = google_service_account.backend.email
}

output "service_account_key" {
  description = "Private Key des Service Accounts (Base64-encoded JSON)"
  value       = google_service_account_key.backend_key.private_key
  sensitive   = true
}

output "bucket_name" {
  description = "Name des Cloud Storage Buckets"
  value       = google_storage_bucket.documents.name
}

output "bucket_url" {
  description = "GCS URL des Buckets"
  value       = "gs://${google_storage_bucket.documents.name}"
}

output "project_id" {
  description = "Google Cloud Project ID"
  value       = var.project_id
}

output "region" {
  description = "Primary Region"
  value       = var.region
}

# Für einfache .env File Generation
output "env_vars" {
  description = "Environment Variables für Backend (.env.local)"
  value       = <<-EOT
    # Google Cloud Configuration (DSGVO-konform, EU-Region)
    GCP_PROJECT_ID=${var.project_id}
    GCP_LOCATION=${var.region}
    GCS_BUCKET_NAME=${google_storage_bucket.documents.name}

    # Service Account Credentials
    # Decode mit: terraform output -raw service_account_key | base64 -d > ../apps/api/service-account.json
    # Für Vercel (JSON string): terraform output -raw service_account_key | base64 -d | jq -c
  EOT
  sensitive   = true
}
