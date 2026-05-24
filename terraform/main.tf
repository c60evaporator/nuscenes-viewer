terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# CloudFront用（us-east-1固定）
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
