# DB接続情報
resource "aws_ssm_parameter" "db_host" {
  name  = "/${var.project_name}/db/host"
  description = "RDS instance endpoint"
  type  = "String"
  value = aws_db_instance.main.address
}

resource "aws_ssm_parameter" "db_port" {
  name  = "/${var.project_name}/db/port"
  description = "RDS instance port"
  type  = "String"
  value = "5432"
}

resource "aws_ssm_parameter" "db_name" {
  name  = "/${var.project_name}/db/name"
  description = "RDS database name for ${var.project_name}"
  type  = "String"
  value = aws_db_instance.main.db_name
}

resource "aws_ssm_parameter" "db_migrator_user" {
  name  = "/${var.project_name}/db/migrator_user"
  description = "RDS username for ${var.project_name} migration"
  type  = "String"
  value = "migrator"
}

resource "aws_ssm_parameter" "db_migrator_password" {
  name  = "/${var.project_name}/db/migrator_password"
  description = "RDS user password for ${var.project_name} migration"
  type  = "SecureString"
  value = "PLACEHOLDER_CHANGE_AFTER_APPLY"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "db_app_user" {
  name  = "/${var.project_name}/db/app_user"
  description = "RDS username for ${var.project_name} backend"
  type  = "String"
  value = "app"
}

resource "aws_ssm_parameter" "db_app_password" {
  name  = "/${var.project_name}/db/app_password"
  description = "RDS user password for ${var.project_name} backend"
  type  = "SecureString"
  value = "PLACEHOLDER_CHANGE_AFTER_APPLY"

  lifecycle {
    ignore_changes = [value]
  }
}

# S3バケット名
resource "aws_ssm_parameter" "s3_data_bucket" {
  name  = "/${var.project_name}/s3/data_bucket"
  description = "S3 bucket name for data storage"
  type  = "String"
  value = aws_s3_bucket.data.bucket
}

resource "aws_ssm_parameter" "s3_static_bucket" {
  name  = "/${var.project_name}/s3/static_bucket"
  description = "S3 bucket name for React static files"
  type  = "String"
  value = aws_s3_bucket.static.bucket
}

# CloudFront URL
resource "aws_ssm_parameter" "cloudfront_data_url" {
  name  = "/${var.project_name}/cloudfront/data_url"
  description = "CloudFront distribution domain for data delivery"
  type  = "String"
  value = "PLACEHOLDER_CHANGE_AFTER_CLOUDFRONT_SETUP"

  lifecycle {
    ignore_changes = []
  }
}
