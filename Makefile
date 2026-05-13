.PHONY: prepare-init-scripts dev prod migrate test down

# Read .env.make if it exists
-include .env.make

ECR_REPO       := $(ACCOUNT_ID).dkr.ecr.$(REGION).amazonaws.com
S3_STATIC      := s3://$(PROJECT_NAME)-static
CLUSTER        := $(PROJECT_NAME)-cluster
SERVICE        := $(PROJECT_NAME)-service

prepare-init-scripts:
	chmod +x db/initdb.d/*.sh

dev:
	$(MAKE) prepare-init-scripts
	docker compose up --build

prod:
	$(MAKE) prepare-init-scripts
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build

migrate:
	docker compose build migrations
	docker compose run --rm migrations

test:
	docker compose run --rm api pytest
	docker compose run --rm frontend npm test

down:
	docker compose down

deploy-backend:
	cd terraform/deploy && terraform init -upgrade && \
		terraform apply -auto-approve \
		-var="region=$(REGION)" \
		-var="project_name=$(PROJECT_NAME)" \
		-var="multi_az=$(MULTI_AZ)"
	aws ecr get-login-password --region $(REGION) | \
		docker login --username AWS --password-stdin $(ECR_REPO)
	docker build \
		--platform linux/amd64 \
		--target production \
		-t $(PROJECT_NAME)/backend:latest \
		-f backend/Dockerfile \
		./backend
	docker tag $(PROJECT_NAME)/backend:latest \
		$(ECR_REPO)/$(PROJECT_NAME)/backend:latest
	docker push \
		$(ECR_REPO)/$(PROJECT_NAME)/backend:latest
	aws ecs update-service \
		--cluster $(CLUSTER) \
		--service $(SERVICE) \
		--force-new-deployment \
		--region $(REGION) \
		--no-cli-pager \
		--query 'service.{serviceName:serviceName,status:status,taskDefinition:taskDefinition,rolloutState:deployments[0].rolloutState}' \
		--output table
	@echo "Waiting for ECS task to pull image..."
	sleep 120
	cd terraform/deploy && terraform destroy -auto-approve \
		-var="region=$(REGION)" \
		-var="project_name=$(PROJECT_NAME)" \
		-var="multi_az=$(MULTI_AZ)"
	@echo "Deployment triggered. Check ECS console for task status."

deploy-frontend:
	docker build \
		--target builder \
		-t $(PROJECT_NAME)-frontend-builder \
		-f frontend/Dockerfile \
		./frontend
	docker rm -f fe-builder >/dev/null 2>&1 || true
	docker create --name fe-builder $(PROJECT_NAME)-frontend-builder
	rm -rf ./frontend/dist
	docker cp fe-builder:/app/dist ./frontend/dist
	docker rm -f fe-builder
	aws s3 cp ./frontend/dist/index.html $(S3_STATIC)/index.html \
		--cache-control "no-cache, no-store, must-revalidate" \
		--region $(REGION)
	aws s3 sync ./frontend/dist $(S3_STATIC) \
		--exclude "index.html" \
		--cache-control "public, max-age=31536000, immutable" \
		--delete \
		--region $(REGION)
	rm -rf ./frontend/dist
	aws cloudfront create-invalidation \
		--distribution-id $(DISTRIBUTION_ID) \
		--paths "/*" \
		--no-cli-pager
	@echo "Frontend deployed successfully."
