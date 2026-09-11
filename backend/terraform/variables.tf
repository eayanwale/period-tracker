variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix used for resource names"
  type        = string
  default     = "period-tracker"
}

variable "passcode" {
  description = "Shared passcode the app must send to talk to the API. Set via TF_VAR_passcode or a .tfvars file that is NOT committed to git."
  type        = string
  sensitive   = true
}

variable "couple_id" {
  description = "Fixed partition key value for the shared log (no need to change this)"
  type        = string
  default     = "shared"
}

variable "cors_allowed_origin" {
  description = "Origin allowed to call the API (your CloudFront/S3 site URL). Use \"*\" until you have the final URL, then tighten it."
  type        = string
  default     = "*"
}
