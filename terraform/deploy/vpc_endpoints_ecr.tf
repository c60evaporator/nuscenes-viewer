resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = data.aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.private.ids
  security_group_ids  = [data.aws_security_group.ecs.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.project_name}-vpce-dkr"
  }
}

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = data.aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.private.ids
  security_group_ids  = [data.aws_security_group.ecs.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.project_name}-vpce-ecr"
  }
}
