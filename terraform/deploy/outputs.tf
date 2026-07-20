output "migration_subnet_id" {
  description = "Subnet ID for ECS migration task"
  value       = local.subnet_ids[0]
}

output "ecs_security_group_id" {
  description = "Security group ID for ECS tasks"
  value       = data.aws_security_group.ecs.id
}
