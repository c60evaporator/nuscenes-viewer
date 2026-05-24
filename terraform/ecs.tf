resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  tags = {
    Name = "${var.project_name}-cluster"
  }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.project_name}-backend-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  task_role_arn            = aws_iam_role.ecs_task.arn
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([{
    name  = "backend"
    image = "${aws_ecr_repository.backend.repository_url}:latest"
    portMappings = [{
      containerPort = 8000
      protocol      = "tcp"
    }]
    environment = [
      { name = "DEPLOY_ENV", value = "aws" },
      { name = "PYTHONPATH",  value = "/app" }
    ]
    secrets = [
      { name = "POSTGRES_HOST",     valueFrom = aws_ssm_parameter.db_host.arn },
      { name = "POSTGRES_PORT",     valueFrom = aws_ssm_parameter.db_port.arn },
      { name = "POSTGRES_DB",       valueFrom = aws_ssm_parameter.db_name.arn },
      { name = "POSTGRES_USER",     valueFrom = aws_ssm_parameter.db_app_user.arn },
      { name = "POSTGRES_PASSWORD", valueFrom = aws_ssm_parameter.db_app_password.arn },
      { name = "S3_DATA_BUCKET",    valueFrom = aws_ssm_parameter.s3_data_bucket.arn },
      { name = "CLOUDFRONT_DATA_URL", valueFrom = aws_ssm_parameter.cloudfront_data_url.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.project_name}"
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "backend"
        "awslogs-create-group"  = "true"
      }
    }
  }])
}

resource "aws_ecs_service" "main" {
  name            = "${var.project_name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.private1.id]
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = "backend"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.http]

  lifecycle {
    ignore_changes = [task_definition]
  }
}
