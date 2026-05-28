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

# For CloudFront (Fixed to us-east-1)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# For GitHub Actions
data "aws_caller_identity" "current" {}
