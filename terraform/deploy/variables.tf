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
