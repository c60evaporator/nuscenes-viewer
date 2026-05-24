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
