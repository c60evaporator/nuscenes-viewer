-- 変数の代入は initdb の仕組みではできないので、ここでは固定名で書きます。
\c nusc_viewer
-- ===== 1) nusc_viewer に接続して PostGIS 有効化 =====
CREATE EXTENSION IF NOT EXISTS postgis;

-- ===== 2) スキーマの所有権と権限設計 =====
ALTER SCHEMA public OWNER TO nusc_migrator;
GRANT CONNECT ON DATABASE nusc_viewer TO nusc_app;
GRANT USAGE ON SCHEMA public TO nusc_app;
GRANT USAGE, CREATE ON SCHEMA public TO nusc_migrator;

-- ===== 3) 既存オブジェクトに対する権限（初回はまだ無いが、保険） =====
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nusc_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO nusc_app;

-- ===== 4) “今後作られる” オブジェクトへのデフォルト権限（重要） =====
ALTER DEFAULT PRIVILEGES FOR ROLE nusc_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nusc_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nusc_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO nusc_app;

-- ===== 5) さらに堅く：PUBLIC の権限を絞る（任意だが推奨） =====
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
