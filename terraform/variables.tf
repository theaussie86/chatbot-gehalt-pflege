variable "project_id" {
  description = "Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "Primary region for resources (EU for DSGVO)"
  type        = string
  default     = "europe-west3" # Frankfurt
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "bucket_name" {
  description = "Cloud Storage bucket name for documents (must be globally unique)"
  type        = string
}

variable "service_account_name" {
  description = "Service Account name for backend"
  type        = string
  default     = "chatbot-backend"
}

variable "document_retention_days" {
  description = "Days to retain documents before automatic deletion"
  type        = number
  default     = 90
}
