# ECSタスク実行ロール
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_ssm" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = aws_iam_policy.ssm_parameter_access.arn
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_kms" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = aws_iam_policy.ssm_kms_access.arn
}

# ECSタスクロール
resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_ssm" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.ssm_parameter_access.arn
}

resource "aws_iam_role_policy_attachment" "ecs_task_s3_read" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.s3_read_access.arn
}

resource "aws_iam_role_policy_attachment" "ecs_task_s3_write" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.s3_write_access.arn
}

# EC2 SSMロール
resource "aws_iam_role" "ec2_ssm" {
  name = "${var.project_name}-ec2-ssm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2_ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ec2_ssm_s3_read" {
  role       = aws_iam_role.ec2_ssm.name
  policy_arn = aws_iam_policy.s3_read_access.arn
}

# カスタムポリシー
resource "aws_iam_policy" "ssm_parameter_access" {
  name = "${var.project_name}-ssm-parameter-access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "SSMParameterAccess"
      Effect = "Allow"
      Action = ["ssm:GetParameter", "ssm:GetParameters"]
      Resource = "arn:aws:ssm:${var.region}:${var.account_id}:parameter/${var.project_name}/*"
    }]
  })
}

resource "aws_iam_policy" "ssm_kms_access" {
  name = "${var.project_name}-ssm-kms-access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "KMSDecrypt"
      Effect = "Allow"
      Action = "kms:Decrypt"
      Resource = "*"
      Condition = {
        StringEquals = {
          "kms:ViaService" = "ssm.${var.region}.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_policy" "s3_read_access" {
  name = "${var.project_name}-s3-read-access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "S3Access"
      Effect = "Allow"
      Action = ["s3:GetObject", "s3:ListBucket"]
      Resource = [
        "arn:aws:s3:::${var.project_name}-data",
        "arn:aws:s3:::${var.project_name}-data/*"
      ]
    }]
  })
}

resource "aws_iam_policy" "s3_write_access" {
  name = "${var.project_name}-s3-write-access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "S3Access"
      Effect = "Allow"
      Action = ["s3:PutObject", "s3:DeleteObject"]
      Resource = "arn:aws:s3:::${var.project_name}-data/*"
    }]
  })
}

# ----------------------------------------------------------------
# GitHub Actions OIDC
# ----------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_actions" {
  name = "${var.project_name}-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:c60evaporator/nuscenes-viewer:*"
        }
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_actions" {
  name = "${var.project_name}-github-actions-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ECRAuth"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "ECRPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = "arn:aws:ecr:${var.region}:${data.aws_caller_identity.current.account_id}:repository/${var.project_name}/*"
      },
      {
        Sid    = "ECSUpdate"
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices"
        ]
        Resource = "arn:aws:ecs:${var.region}:${data.aws_caller_identity.current.account_id}:service/${var.project_name}-cluster/${var.project_name}-service"
      },
      {
        Sid    = "S3Deploy"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.project_name}-static",
          "arn:aws:s3:::${var.project_name}-static/*"
        ]
      },
      {
        Sid      = "CloudFrontInvalidation"
        Effect   = "Allow"
        Action   = "cloudfront:CreateInvalidation"
        Resource = "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/*"
      },
      {
        Sid    = "VPCEndpointDeploy"
        Effect = "Allow"
        Action = [
          "ec2:CreateVpcEndpoint",
          "ec2:DeleteVpcEndpoints",
          "ec2:DescribeVpcEndpoints",
          "ec2:ModifyVpcEndpoint",
          "ec2:DescribeVpcs",
          "ec2:DescribeVpcAttribute",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeSecurityGroupRules",
          "ec2:CreateTags",
          "ec2:DescribeTags"
        ]
        Resource = "*"
      }
    ]
  })
}
