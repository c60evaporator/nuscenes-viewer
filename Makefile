.PHONY: dev prod migrate test down

dev:
	docker compose up --build

prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build

migrate:
	docker compose run --rm migrations

test:
	docker compose run --rm api pytest
	docker compose run --rm frontend npm test

down:
	docker compose down
