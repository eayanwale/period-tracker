resource "aws_dynamodb_table" "logs" {
  name         = "${var.project_name}-logs"
  billing_mode = "PAY_PER_REQUEST" # trivial traffic for 2 users — stays in the free tier

  hash_key  = "coupleId"
  range_key = "date"

  attribute {
    name = "coupleId"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true # cheap insurance against an accidental delete of her whole history
  }

  tags = {
    Project = var.project_name
  }
}
