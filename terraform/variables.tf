variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
}

variable "account_id" {
  description = "AWS account ID"
  type        = string
}

variable "multi_az" {
  description = "Enable multi-AZ deployment"
  type        = bool
  default     = false
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "ecs_cpu" {
  description = "ECS task CPU units"
  type        = number
  default     = 1024
}

variable "ecs_memory" {
  description = "ECS task memory in MB"
  type        = number
  default     = 2048
}

variable "static_oac_id" {
  description = "CloudFront OAC ID for static S3 bucket. If empty, a new OAC will be created."
  type        = string
  default     = ""
}

variable "web_acl_id" {
  description = "WAF Web ACL ARN for CloudFront. Required when using existing distribution with pricing plan."
  type        = string
  default     = ""
}
