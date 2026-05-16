# IAMインスタンスプロファイル
resource "aws_iam_instance_profile" "maintenance" {
  name = "${var.project_name}-maintenance-instance-profile"
  role = data.aws_iam_role.ec2_ssm.name
}

# 踏み台EC2インスタンス
resource "aws_instance" "maintenance" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.micro"
  subnet_id              = data.aws_subnet.private1.id
  vpc_security_group_ids = [data.aws_security_group.maintenance.id]
  iam_instance_profile   = aws_iam_instance_profile.maintenance.name
  associate_public_ip_address = false

  key_name = var.key_pair_name != "" ? var.key_pair_name : null

  tags = {
    Name = "${var.project_name}-maintenance-ec2"
  }
}

# VPCエンドポイント⑥: ec2messages
resource "aws_vpc_endpoint" "ec2messages" {
  vpc_id              = data.aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.ec2messages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [data.aws_subnet.private1.id, data.aws_subnet.private2.id]
  security_group_ids  = [data.aws_security_group.ecs.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.project_name}-vpce-ec2message"
  }
}

# VPCエンドポイント⑦: ssmmessages
resource "aws_vpc_endpoint" "ssmmessages" {
  vpc_id              = data.aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.ssmmessages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [data.aws_subnet.private1.id, data.aws_subnet.private2.id]
  security_group_ids  = [data.aws_security_group.ecs.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.project_name}-vpce-ssmmessage"
  }
}

# 接続用インスタンスIDを出力
output "instance_id" {
  value       = aws_instance.maintenance.id
  description = "Instance ID for SSM Session Manager connection"
}
