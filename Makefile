.PHONY: prepare-init-scripts dev prod migrate test down

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
