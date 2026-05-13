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

data "aws_vpc" "main" {
  filter {
    name   = "tag:Name"
    values = ["${var.project_name}-vpc"]
  }
}

# シングルAZ用（常に取得）
data "aws_subnet" "private1" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  filter {
    name   = "tag:Name"
    values = ["${var.project_name}-subnet-private1-ap-northeast-1a"]
  }
}

# マルチAZ用（multi_az=trueの時のみ使用）
data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  filter {
    name   = "tag:Name"
    values = ["*private*"]
  }
}

data "aws_security_group" "ecs" {
  filter {
    name   = "tag:Name"
    values = ["${var.project_name}-sg-ecs"]
  }
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
}

locals {
  subnet_ids = var.multi_az ? data.aws_subnets.private.ids : [data.aws_subnet.private1.id]
}
