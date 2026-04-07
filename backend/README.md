# 開発起動
docker compose up

# 本番ビルド起動
APP_ENV=production docker compose up --build

# マイグレーション実行のみ
docker compose run --rm migrations

# DB接続確認
docker compose exec db psql -U postgres -d myapp
