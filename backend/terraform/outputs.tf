output "api_base_url" {
  description = "Base URL of the API — put this in frontend/js/config.js"
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "site_url" {
  description = "The app's URL — open this on her phone and 'Add to Home Screen'"
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "site_bucket_name" {
  description = "S3 bucket to sync the frontend/ folder into"
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "Needed to invalidate the CloudFront cache after re-uploading the site"
  value       = aws_cloudfront_distribution.site.id
}

output "github_actions_role_arn" {
  description = "Role GitHub Actions assumes via OIDC to deploy the frontend — put in the workflow yaml (not secret)"
  value       = aws_iam_role.github_actions_deploy.arn
}
