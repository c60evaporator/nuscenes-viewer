locals {
  private_subnet_ids = var.multi_az ? [
    aws_subnet.private1.id,
    aws_subnet.private2.id
  ] : [aws_subnet.private1.id]
}

# S3 Gateway（無料）
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [
    aws_route_table.private1.id,
    aws_route_table.private2.id,
  ]

  tags = {
    Name = "${var.project_name}-vpce-s3"
  }
}

# CloudWatch Logs
resource "aws_vpc_endpoint" "logs" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.private_subnet_ids
  security_group_ids  = [aws_security_group.ecs.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.project_name}-vpce-logs"
  }
}

# SSM
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.private_subnet_ids
  security_group_ids  = [aws_security_group.ecs.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.project_name}-vpce-ssm"
  }
}
