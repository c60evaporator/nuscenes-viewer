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

# VPCをタグ名で検索
data "aws_vpc" "main" {
  filter {
    name   = "tag:Name"
    values = ["${var.project_name}-vpc"]
  }
}

# Private Subnet1をタグ名で検索
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

# Private Subnet2をタグ名で検索（VPCエンドポイント用）
data "aws_subnet" "private2" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  filter {
    name   = "tag:Name"
    values = ["${var.project_name}-subnet-private2-ap-northeast-1c"]
  }
}

# メンテナンス用セキュリティグループ
data "aws_security_group" "maintenance" {
  filter {
    name   = "tag:Name"
    values = ["${var.project_name}-sg-maintenance"]
  }
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
}

# ECS用セキュリティグループ（VPCエンドポイント用）
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

# EC2 SSMロール
data "aws_iam_role" "ec2_ssm" {
  name = "${var.project_name}-ec2-ssm-role"
}

# AMIを動的取得ではなく固定で指定
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*.0-kernel-6.1-x86_64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}
