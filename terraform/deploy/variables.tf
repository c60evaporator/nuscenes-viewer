variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "Project name used for resource tagging"
  type        = string
  default     = "nuscenes-viewer"
}

variable "multi_az" {
  description = "Enable multi-AZ for VPC endpoints"
  type        = bool
  default     = false
}
