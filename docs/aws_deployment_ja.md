# AWS環境でのデプロイ手順

## 事前準備

### AWS CLIの準備

もしAWS CLIを準備できていなければ、まず以下手順でAWS CLI2.32.0以上（aws loginに必要）をインストールしておく

https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

以下コマンドを打つとブラウザが開くので、ログインするとクレデンシャル情報がCLIに登録されます

```zsh
aws login
```

```zsh
brew install --cask session-manager-plugin
```

### Terraformのインストール

[公式手順](https://developer.hashicorp.com/terraform/install)に従ってTerraformをインストールします。
例えばMac OSでは、HomeBrewを用いて以下のようにインストールできます。

```zsh
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

### aws loginによるTerraformデプロイの有効化

`~/.aws/config`に以下のようにTerraform用のプロファイルを追加し、defaultプロファイル（aws loginでログインされたプロファイル）の内容を適用します

```config
[default]
region = ap-northeast-1
login_session = arn:aws:iam::**********:user/username # aws loginコマンド実施時に勝手に追加されている

# 以下を追加
[profile terraform]
region = ap-northeast-1
credential_process = aws configure export-credentials --profile default --format process
```

これでブラウザでAWSコンソールにログインした状態で`aws login`コマンドを打てば、シェルに認証情報が適用され、Terraformデプロイを有効化できます。

### terraform.tfvarsの作成

`terraform/terraform.tfvars.example`を参考に、以下のような`terraform/terraform.tfvars`を作成します。この設定は「1.メインリソース」のTerraformデプロイに使用されます。

```ini
account_id      = "your-aws-account-id" # AWSのアカウントID（12桁の数字）
region          = "ap-northeast-1"      # デプロイしたいAWSリージョン
project_name    = "your-project-name"   # プロジェクト名（好きな名前でOKだが、S3バケットの名前被りを防ぐため固有の名称となるようにする）
distribution_id = "your-cloudfront-distribution-id" # 後で修正するので最初は適当でOK
multi_az        = false                 # マルチAZの有効化有無（最初はfalseでOK。SLA要件等で冗長化が必要ならtrueにする）
```

特に、**project_nameは固有の名前となるよう複雑な名前にしてください**（S3バケット名が被るのを防ぐため）

### .env.makeの作成

`.env.make.example`を参考に、以下のような`.env.make`を作成します（多くが`terraform/terraform.tfvars`と重複する部分は同内容を記述してください）。この設定は「2.アプリ更新」＆「3.踏み台リソース」のTerraformデプロイに使用されます。

```ini
ACCOUNT_ID=your-aws-account-id                  # AWSのアカウントID（12桁の数字）
PROJECT_NAME=your-project-name                  # プロジェクト名
REGION=your-aws-region(e.g., ap-northeast-1)    # デプロイしたいAWSリージョン
DISTRIBUTION_ID=your-cloudfront-distribution-id # 後で修正するので最初は適当でOK
MULTI_AZ=false                                  # マルチAZの有効化有無
```

## 手動デプロイ

Terraformの方が手軽にデプロイできますが、設定ミスや予期せぬ高額請求の防止のため、まずは手動でデプロイして動作確認したのち、Terraformでのデプロイを実施することをお勧めします。

`{プロジェクト名}`の部分は適宜好きなプロジェクト名（例: `my-nuscenes`）に、`{account-id}`の部分は自分のAWSアカウントID（12桁の数字）に置き換えてください。

- A. VPCの作成
- B. IAMロールの作成
- C. RDSの作成
- D.メンテナンス用インスタンスの作成
- E. SSMへのパラメータ登録
- F. S3バケットの作成とデータのアップロード
- G. ALBの作成
- H. ECRリポジトリへのイメージプッシュ
- I. ECSタスクとサービスの作成
- J. フロントエンドのS3+CloudFront実装

### A. VPCの作成

#### VPC作成

VPC → Create VPC
以下設定でVPCを作成

- VPC settings: VPC and more
- Name tag auto-generation: {プロジェクト名}
- IPv4 CIDR block: 10.0.0.0/16
- IPv6 CIDR block: No IPv6 CIDR block
- Tenancy: Default
- Number of Availability Zones: 2
- Number of public subnets: 2
- Number of private subnets: 2
- Customize subnets CIDR blocks
  - Public subnet CIDR block in ap-northeast-1a: 10.0.1.0/24
  - Public subnet CIDR block in ap-northeast-1c: 10.0.2.0/24
  - Private subnet CIDR block in ap-northeast-1a: 10.0.11.0/24
  - Private subnet CIDR block in ap-northeast-1c: 10.0.12.0/24
- NAT gateways: None
- VPC endpoints: S3 Gateway
- Enable DNS hostnames: Enabled
- Enable DNS resolution: Enabled

#### セキュリティグループ作成

VPC → Security Groups → Create security group

以下①〜④のセキュリティグループを作成。作成時は先ほど作成したVPC（`{プロジェクト名}-vpc`）を選択することを忘れないよう

- セキュリティグループ①
  - Security group name: {プロジェクト名}-sg-alb
  - Description: Allow ALB access to clients
  - Inbound rules:
    - 1:
      - Type: HTTPs
      - Source: Anywhere-IPv4
    - 2:
      - Type: HTTP
      - Source: Anywhere-IPv4
  - Outbound rules:
    - 1:
      - Type: Custom TCP
      - Port range: 8000
      - Destination: {プロジェクト名}-sg-ecs
  - Tags:
    - Name: {プロジェクト名}-sg-alb
- セキュリティグループ②
  - Security group name: {プロジェクト名}-sg-ecs
  - Description: Allow backend access to ALB
  - Inbound rules:
    - 1:
      - Type: Custom TCP
      - Port range: 8000
      - Source: {プロジェクト名}-sg-alb
    - 2:
      - Type: HTTPs
      - Destination: {プロジェクト名}-sg-ecs
    - 3:
      - Type: HTTPs
      - Destination: {プロジェクト名}-sg-maintenance
  - Outbound rules:
    - 1:
      - Type: HTTPs
      - Destination: Anywhere-IPv4
    - 2:
      - Type: PostgreSQL
      - Destination: {プロジェクト名}-sg-rds
  - Tags:
    - Name: {プロジェクト名}-sg-ecs
- セキュリティグループ③
  - Security group name: {プロジェクト名}-sg-rds
  - Description: Allow RDS access to backend
  - Inbound rules:
    - 1:
      - Type: PostgreSQL
      - Source: {プロジェクト名}-sg-ecs
    - 2:
      - Type: PostgreSQL
      - Source: {プロジェクト名}-sg-maintenance
  - Outbound rules: なし
  - Tags:
    - Name: {プロジェクト名}-sg-rds
- セキュリティグループ④
  - Security group name: {プロジェクト名}-sg-maintenance
  - Description: Allow RDS access to maintenance instances
  - Inbound rules:なし
  - Outbound rules:
    - 1:
      - Type: HTTPs
      - Destination: Anywhere-IPv4
    - 2:
      - Type: PostgreSQL
      - Destination: {プロジェクト名}-sg-rds
  - Tags:
    - Name: {プロジェクト名}-sg-maintenance

#### VPCエンドポイントの作成

VPC → Endpoints → Create endpoint

以下②〜⑤のエンドポイントを作成（①はVPC作成時に作成済、また④、⑤はデプロイにしか使用しないので、デプロイ完了後削除する）

||Name|Services|Subnets|Security group|
|---|---|---|---|---|
|①|{プロジェクト名}-vpce-s3|com.amazonaws.ap-northeast-1.s3|なし（Gateway type）|なし（Gateway type）|
|②|{プロジェクト名}-vpce-logs|com.amazonaws.ap-northeast-1.logs|private1|{プロジェクト名}-sg-ecs|
|③|{プロジェクト名}-vpce-ssm|com.amazonaws.ap-northeast-1.ssm|private1|{プロジェクト名}-sg-ecs|
|④|{プロジェクト名}-vpce-dkr|com.amazonaws.ap-northeast-1.ecr.dkr|private1|{プロジェクト名}-sg-ecs|
|⑤|{プロジェクト名}-vpce-ecr|com.amazonaws.ap-northeast-1.ecr.api|private1|{プロジェクト名}-sg-ecs|

作成時は共通して以下を指定してください

- Type AWS service
- Enable Cross Region endpoint: Disabled
- VPC: {プロジェクト名}-vpc（先ほど作成したVPC）
- Enable private DNS name: Enabled
- Policy: Full access
- サブネット選択時のDesignate IP addressesはチェックしない

### B. IAMロールの作成

#### IAMポリシーの作成

IAM → Policies → Create policyから、以下①〜④のIAMロールを作成する（JSONタブを選択して編集）。

①パラメータストアアクセス用ポリシー
- Policy name: {プロジェクト名}-ssm-parameter-access
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SSMParameterAccess",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:ap-northeast-1:{account-id}:parameter/{プロジェクト名}/*"
    }
  ]
}
```

②SSMのKMSキーアクセス用ポリシー
- Policy name: {プロジェクト名}-ssm-kms-access
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "KMSDecrypt",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "ssm.ap-northeast-1.amazonaws.com"
        }
      }
    }
  ]
}
```

③S3バケット読取用ポリシー
- Policy name: {プロジェクト名}-s3-read-access
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::{プロジェクト名}-data",
        "arn:aws:s3:::{プロジェクト名}-data/*"
      ]
    }
  ]
}
```

④S3バケット書込用ポリシー
- Policy name: {プロジェクト名}-s3-write-access
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::{プロジェクト名}-data/*"
    }
  ]
}
```

#### IAMロールの作成

IAM → Roles → Create roleから、以下①〜③のIAMロールを作成する。

①：ECSタスク実行ロール

DockerイメージのプルやCloudWatch Logsへのアクセスなど、ECSタスクの実行に必要な権限を持つロール

- Trusted entity type: AWS service
- Service or use case: Elastic Container Service
- Use case: Task Execution Role for Elastic Container Service
- Permissions policies: そのままNextを押す（AmazonECSTaskExecutionRolePolicyが選択されている）
- Role name: {プロジェクト名}-ecs-task-execution-role

上記設定以外はデフォルトでOK

作成後にロールの一覧から{プロジェクト名}-ecs-task-execution-roleをクリックして、Permissions → Add permissions → Attach policies → Customer managedでフィルタして先ほど作成した`{プロジェクト名}-ssm-parameter-access`と`{プロジェクト名}-ssm-kms-access`をチェックしてAdd permissionsで確定

②：コンテナ内アプリケーション用ロール

コンテナ内で動作するアプリケーションが、S3からのファイル取得やSSMからのパラメータ取得などを行うためのロール

- Trusted entity type: Custom trust policy
- Custom trust policy: 以下をJSON入力欄に直接打ち込む
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```
- Permissions policies: なし（そのままNextを押す）
- Role name: {プロジェクト名}-ecs-task-role


作成後にロールの一覧から{プロジェクト名}-ecs-task-role クリックして、Permissions → Add permissions → Attach policies → Customer managedでフィルタして先ほど作成した`{プロジェクト名}-ssm-parameter-access`,`{プロジェクト名}-s3-read-access`,`{プロジェクト名}-s3-write-access`をチェックしてAdd permissionsで確定


③：踏み台インスタンス用ロール

踏み台インスタンスにSSMセッションマネージャーを使用してアクセスするためのロール

- Trusted entity type: AWS service
- Service or use case: EC2
- Use case: EC2 Role for AWS Systems Manager
- Permissions policies: そのままNextを押す（AmazonSSMManagedInstanceCoreが選択されている）
- Role name: {プロジェクト名}-ec2-ssm-role

作成後にロールの一覧から{プロジェクト名}-ec2-ssm-roleをクリックして、Permissions → Add permissions → Attach policies → Customer managedでフィルタして先ほど作成した`{プロジェクト名}-s3-read-access`をチェックしてAdd permissionsで確定

### C. RDSの作成

#### サブネットグループの作成

Aurora and RDS → Subnet groups → Create DB subnet groupで以下を作成

- Name: {プロジェクト名}-db-subnet-group
- Description: Subnet group for RDS instances
- VPC: 先ほど作成したVPC（{プロジェクト名}-vpc）
- Availability Zones: ap-northeast-1a, ap-northeast-1c
- Subnets: private1,private2

#### パラメータグループの作成

Aurora and RDS → Parameter groups → Create parameter groupで以下を作成

- Parameter group name: {プロジェクト名}-postgis-params
- Description: Parameter group for PostGIS extension
- Engine type: PostgreSQL
- Parameter group family: postgres16
- Type: DB Parameter Group

#### RDSインスタンスの作成

Aurora and RDS → Databases → Create database → Full configuration

- Envine type: PostgreSQL
- Choose a database creation method: Full configuration
- Templates: Free tier
- Deployment options: Single-AZ DB instance deployment（マルチAZ構成に拡張する場合は、Multi-AZ DB instance deploymentに変更）
- Engine version: 16.9
- DB instance identifier: {プロジェクト名}-db
- Credentials management: Self managed
- Master username: migrator
- Master password: 生成した安全なパスワード
- Database authentication: Password authentication
- Instance class: db.t4g.micro
- Storage type: gp2
- Allocated storage: 20 GiB
- Enabled storage autoscaling: Disabled
- Compute resource: Don't connect to an EC2 compoute resource
- Network type: IPv4
- VPC: {プロジェクト名}-vpc（上で作成したVPCを使用）
- Subnet group: nusenes-viewer-db-subnet-group（上で作成したサブネットグループを使用）
- Public access: No
- VPC security groups: sg-rds（上で作成したRDS用セキュリティグループを使用）
- Availability zone: ap-northeast-1a（コスト削減のため片方のAZにのみ配置。マルチAZ構成に拡張する場合は、スタンバイインスタンスをもう一方のAZに配置）
- Initial database name: nuscenes_viewer
- DB parameter group: {プロジェクト名}-postgis-params（上で作成したパラメータグループを使用）
- Backup retention period: 7 days
- Enable auto minor version upgrades: Disabled

### D.メンテナンス用インスタンスの作成

PostGIS有効化やアプリ用ユーザ作成のためにRDSにアクセスする必要があるが、そのためには踏み台用のEC2インスタンスが必要。
運用時も想定して、踏み台インスタンスを立ち上げるための仕組みを構築しておく

#### メンテナンス用VPCエンドポイントの作成

VPC → Endpoints → Create endpoint

以下⑥〜⑦のエンドポイントを作成

||Name|Services|Subnets|Security group|
|---|---|---|---|---|
|⑥|{プロジェクト名}-vpce-ec2message|com.amazonaws.ap-northeast-1.ec2messages|private1,private2|{プロジェクト名}-sg-ecs|
|⑦|{プロジェクト名}-vpce-ssmmessage|com.amazonaws.ap-northeast-1.ssmmessages|private1,private2|{プロジェクト名}-sg-ecs|

作成時は共通して以下を指定してください

- Type AWS service
- VPC: {プロジェクト名}-vpc
- Enable private DNS name: Enabled
- Policy: Full access
- サブネット選択時のDesignate IP addressesはチェックしない

#### 踏み台EC2インスタンスの作成

まず踏み台EC2インスタンスを立て、SSMでCLIからターミナル接続する

EC2 → Instances → Launch instances

- Name: tmp-ec2
- Application and OS Images: Amazon Linux
- Instance type t3.micro
- Key pair: 既にあればそれを使用。なければCreate new key pair
- VPC: {プロジェクト名}-vpc（上で作成したVPCを使用）
- Subnet: private1
- Auto-assign public IP: Disable
- Firewall (security groups): Select existing securituy group
- Common security groups: {プロジェクト名}-sg-maintenance

上記のEC2インスタンスにターミナル接続できるよう、AWS Systems Manager Session Managerを設定する。

次に必要なIAMロールを付与する。
インスタンスを選択し、Actions → Security → Modify IAM role で先ほど作成した`{プロジェクト名}-ec2-ssm-role`を選択。Update IAM roleを押す

EC2 → Instances → i-********（当該インスタンス） → Instance state → Reboot instance

あとはローカルのターミナルでaws loginしたのち、以下コマンドでインスタンスに接続（`i-********`の部分はインスタンスIDで置き換える）

```zsh
aws ssm start-session --target i-********
```

以下のように表示されれば成功

```
Starting session with SessionId: admin1-vv******
sh-5.2$
```

インスタンスに接続された状態で以下コマンドでpsqlをインストール（うまくいかない場合、セキュリティグループとS3エンドポイントの設定を確認）

```zsh
sudo dnf install -y postgresql16
```

#### PostGISの有効化

以下コマンドでRDSのPostgreSQLの`{プロジェクト名}`DBに`migrator`ユーザーで接続（`{プロジェクト名}-db.xxxxxxxxxxxx.ap-northeast-1.rds.amazonaws.com`の部分はDatabases→当該インスタンスを選択して見られるRDSの接続用アドレスで置き換えてください）

```zsh
psql \
  -h {プロジェクト名}-db.xxxxxxxxxxxx.ap-northeast-1.rds.amazonaws.com \
  -U migrator \
  -d nuscenes_viewer
```

データベースに接続できたら、以下SQLコマンドでPostGISを有効化します

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 確認
SELECT PostGIS_Version();
```

`postgis_version`が表示されれば成功

#### アプリ用ユーザー作成と各種権限設定

Postgresに接続した状態で、以下SQLコマンドでアプリ用ユーザー`app`を作成

```sql
-- 01-init.sh相当) アプリユーザーの作成
CREATE USER app WITH PASSWORD '（強力なパスワードを設定）';

-- 02-init.sql 2) スキーマの所有権と権限設計
ALTER SCHEMA public OWNER TO migrator;
GRANT CONNECT ON DATABASE nuscenes_viewer TO app;
GRANT USAGE ON SCHEMA public TO app;
GRANT USAGE, CREATE ON SCHEMA public TO migrator;

-- 3) 既存テーブルへの権限（マイグレーション後に実行）
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app;

-- 4) 今後作成されるテーブルへの権限も自動付与
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app;

-- 5) PUBLICの権限を絞る
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

ここまで完了したら踏み台EC2インスタンスや関連VPCエンドポイントは不要なので、以下手順で削除します

- 踏み台EC2インスタンス: EC2 → Instances → 踏み台インスタンスをチェック → Instance state → Terminate (delete) instance
- ec2message用エンドポイント: VPC → Endpoints → {プロジェクト名}-vpce-ec2messageをチェック → Actions → Delete VPC endpoint
- ssmmessage用エンドポイント: EC2 → Instances → {プロジェクト名}-vpce-ssmmessageをチェック → Actions → Delete VPC endpoint

### E. SSMへのパラメータ登録

Systems Manager → Parameter Store → Create parameterで、以下①〜⑨のパラメータを登録

①RDSのホスト名
- Name: /{プロジェクト名}/db/host
- Description: RDS instance endpoint
- Type: String
- Data type: text
- Value: RDSの接続用アドレス（例: {プロジェクト名}-db.xxxxxxxxxxxx.ap-northeast-1.rds.amazonaws.com）

②RDSのポート番号
- Name: /{プロジェクト名}/db/port
- Description: RDS instance port
- Type: String
- Data type: text
- Value: 5432

③RDSのデータベース名
- Name: /{プロジェクト名}/db/name
- Description: RDS database name for {プロジェクト名}
- Type: String
- Data type: text
- Value: nuscenes_viewer（上でRDSインスタンスのInitial database nameに設定した値）

④マイグレーションユーザー名
- Name: /{プロジェクト名}/db/migrator_user
- Description: RDS username for {プロジェクト名} migration
- Type: String
- Data type: text
- Value: migrator（上でRDSインスタンスのMaster usernameに設定した値）

⑤マイグレーションユーザーパスワード
- Name: /{プロジェクト名}/db/migrator_password
- Description: RDS user password for {プロジェクト名} migration
- Type: SecureString
- KMS key: source My current account
- KMS Key ID: alias/aws/ssm（デフォルト）
- Value: 上でRDSインスタンスのMaster passwordに設定した値

⑥アプリユーザー名
- Name: /{プロジェクト名}/db/app_user
- Description: RDS username for {プロジェクト名} backend
- Type: String
- Value: app（上で作成したアプリ用ユーザ名）

⑦アプリユーザーパスワード
- Name: /{プロジェクト名}/db/app_password
- Description: RDS user password for {プロジェクト名} backend
- Type: SecureString
- Value: 上で作成したアプリ用ユーザのパスワード

⑧センサーデータ・basemap画像用S3バケット名
- Name: /{プロジェクト名}/s3/data_bucket
- Description: S3 bucket name for data storage
- Type: String
- Data type: text
- Value: {プロジェクト名}-data（下で作成するデータバケット名）

⑨センサーデータ・basemap画像用S3バケット名
- Name: /{プロジェクト名}/s3/static_bucket
- Description: S3 bucket name for React static files
- Type: String
- Data type: text
- Value: {プロジェクト名}-static（下で作成する静的ファイルバケット名）

### F. S3バケットの作成とデータのアップロード

#### S3バケットの作成

S3 → Create bucketで以下の2つのバケットを作成

①`{プロジェクト名}-data`: センサーデータ・basemap画像（非公開）
②`{プロジェクト名}-static`: Reactの静的ファイル（公開）

両バケットは以下を共通設定とする（Bucket nameを`{プロジェクト名}-data`または`{プロジェクト名}-static`にする）
- AWS Region: ap-northeast-1
- Bucket type: General purpose
- Bucket namespace: Global namespace
- Object Ownership: ACLs disabled
- Public access: Block all public access
- Bucket Versioning: Disabled
- Default encryption: Server-side encryption with Amazon S3 managed keys (SSE-S3)
- Bucket Key: Enabled

#### nuScenesデータのアップロード

以下のフォルダをS3にアップロードします（Trainvalを使用する場合`v1.0-mini`は`v1.0-trainval`に変わる）

```
project_root
└── data/nuscenes/
    ├── samples/        ← ✅ S3にアップロード（カメラ画像・LiDAR）
    ├── sweeps/         ← ❌ アップロード不要（アプリの可視化対象外）
    ├── maps/           ← ✅ S3にアップロード（basemap画像）
    └── v1.0-mini/      ← ✅ S3にアップロード（DBインポート用に一時的にアップロード）
```

まず`aws login`してから上の`project_root`フォルダにcdしたのち、アップロード対象のサイズを確認します

```bash
du -sh ./data/nuscenes/samples
du -sh ./data/nuscenes/maps
du -sh ./data/nuscenes/v1.0-mini
```

S3バケットへアップロードします（後述しますが`samples`はS3/CloudFrontでのキャッシュが重要なので、キャッシュ期間を2592000秒=1ヶ月に長くしています）

```bash
aws s3 sync ./data/nuscenes/samples s3://{プロジェクト名}-data/data/samples \
  --cache-control "public, max-age=2592000, immutable" --region ap-northeast-1
aws s3 sync ./data/nuscenes/maps s3://{プロジェクト名}-data/data/maps \
  --region ap-northeast-1
aws s3 sync ./data/nuscenes/v1.0-mini s3://{プロジェクト名}-data/data/v1.0-mini \
  --region ap-northeast-1
```

以下でアップロード後のファイル数とサイズを確認（サイズが事前確認と対応していればOK）

```bash
aws s3 ls s3://{プロジェクト名}-data/data/samples/ --recursive --summarize \
  | tail -2
aws s3 ls s3://{プロジェクト名}-data/data/maps/ --recursive --summarize \
  | tail -2
aws s3 ls s3://{プロジェクト名}-data/data/v1.0-mini/ --recursive --summarize \
  | tail -2
```

### G. ALBの作成

#### ターゲットグループの作成

EC2 → Target Groups → Create target group

- Target type: IP addresses
- Target group name: {プロジェクト名}-tg
- Protocol: HTTP
- Port: 8000
- IP address type: IPv4
- VPC: {プロジェクト名}-vpc（上で作成したVPCを使用）
- Protocol version: HTTP1
- Health check protocol: HTTP
- Health check path: /health
- Health check port: Traffic port
- Healthy threshold: 2
- Unhealthy threshold: 3
- Timeout: 5 seconds
- Interval: 30 seconds
- Success codes: 200
ターゲット登録は後ほどECSのサービス作成時に行う

#### ALBの作成

EC2 → Load Balancers → Create load balancer → Application Load Balancer → Create

- Load balancer name: {プロジェクト名}-alb
- Scheme: Internet-facing
- Load balancer IP address type: IPv4
- VPC: {プロジェクト名}-vpc（上で作成したVPCを使用）
- Availability Zones and subnets: {プロジェクト名}-subnet-public1-ap-northeast-1aと{プロジェクト名}-subnet-public2-ap-northeast-1c（マルチAZ移行に備えて両AZを含めておく）
- Security group: {プロジェクト名}-sg-alb（上で作成したALB用セキュリティグループを使用）
- Listeners
  - 1
    - Protocol: HTTP
    - Port: 80（ユーザーがアクセスするポート）
    - Routing action: Forward to target groups
    - Target group: {プロジェクト名}-tg（上で作成したターゲットグループ）

### H. ECRリポジトリへのイメージプッシュ

#### ECRリポジトリ作成

ECR → Repositoriies → Create repositoryで以下のECRリポジトリを作成

①バックエンド用
- Name: {プロジェクト名}/backend
- Image tag mutability: Mutable
- Encryption settings: AES-256

#### Dockerイメージのプッシュ

作成したリポジトリにDockerイメージをpushする。
まず以下コマンドでローカルのターミナルからECRにログイン（`{account-id}`の部分は自分のAWSアカウントIDに置き換えてください）

```zsh
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin \
  {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com
```

以下コマンドでバックエンド用イメージをビルドしてpush

```zsh
# ビルド
docker build \
  --platform linux/amd64 \
  --target production \
  -t {プロジェクト名}/backend:latest \
  -f backend/Dockerfile \
  ./backend

# タグ付け
docker tag {プロジェクト名}/backend:latest \
  {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/{プロジェクト名}/backend:latest

# プッシュ
docker push \
  {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/{プロジェクト名}/backend:latest
```

AWSコンソールからECRの{プロジェクト名}/backendにImageがアップロードされていることを確認

### I. ECSタスクとサービスの作成

#### ECSクラスター作成

ECS → Clusters → Create clusterで以下クラスターを作成

- Cluster name: {プロジェクト名}-cluster
- Select a method of obtaining compute capacity: Fargate only

#### タスク定義作成

Task definitions → Create new task definition → Create new task definitionでアプリ用とマイグレーション用、DBインポート用（nuScenes本体＋Map Expansion別々）の4種類のタスク定義を作成する

①アプリ用タスク定義
- Task definition family: {プロジェクト名}-backend-task
- Launch type: AWS Fargate
- Operating system/Architecture: Linux/x86_64
- Task size
  - CPU: 1 vCPU
  - Memory: 2 GB
- Task role: {プロジェクト名}-ecs-task-role（上で作成したコンテナ内アプリケーション用ロールを指定）
- Task execution role: {プロジェクト名}-ecs-task-execution-role（上で作成したECSタスク実行ロールを指定）
- Container - 1
  - Container name: backend
  - Image URI: 上で作成したバックエンド用ECRリポジトリのURI（例: {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/{プロジェクト名}/backend:latest）
  - Port mappings: 8000 (TCP)
  - Environment variables
    - Key: POSTGRES_HOST, Value type: ValueFrom, Value: /{プロジェクト名}/db/host
    - Key: POSTGRES_PORT, Value type: ValueFrom, Value: /{プロジェクト名}/db/port
    - Key: POSTGRES_DB, Value type: ValueFrom, Value: /{プロジェクト名}/db/name
    - Key: POSTGRES_USER, Value type: ValueFrom, Value: /{プロジェクト名}/db/app_user
    - Key: POSTGRES_PASSWORD, Value type: ValueFrom, Value: /{プロジェクト名}/db/app_password
    - Key: DEPLOY_ENV, Value type: Value, Value: aws
    - Key: S3_DATA_BUCKET, Value type: ValueFrom, Value: /{プロジェクト名}/s3/data_bucket
    - Key: PYTHONPATH, Value type: Value, Value: /app
  - Log collection
    - Destination: AWS CloudWatch
    - awslogs-group: /ecs/{プロジェクト名}
    - awslogs-region: ap-northeast-1
    - awslogs-stream-prefix: backend
    - awslogs-create-group: true

②マイグレーション用タスク定義
- Task definition name: {プロジェクト名}-migration-task
- Launch type: AWS Fargate
- Operating system/Architecture: Linux/x86_64
- Task size
  - CPU: 0.5 vCPU
  - Memory: 1 GB
- Task role: {プロジェクト名}-ecs-task-role（上で作成したコンテナ内アプリケーション用ロールを指定）
- Task execution role: {プロジェクト名}-ecs-task-execution-role（上で作成したECSタスク実行ロールを指定）
- Container - 1
  - Container name: migration
  - Image URI: 上で作成したバックエンド用ECRリポジトリのURI（例: {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/{プロジェクト名}/backend:latest）
  - Port mappings: 8000 (TCP)
  - Environment variables
    - Key: POSTGRES_HOST, Value type: ValueFrom, Value: /{プロジェクト名}/db/host
    - Key: POSTGRES_PORT, Value type: ValueFrom, Value: /{プロジェクト名}/db/port
    - Key: POSTGRES_DB, Value type: ValueFrom, Value: /{プロジェクト名}/db/name
    - Key: POSTGRES_USER, Value type: ValueFrom, Value: /{プロジェクト名}/db/migrator_user
    - Key: POSTGRES_PASSWORD, Value type: ValueFrom, Value: /{プロジェクト名}/db/migrator_password
    - Key: DEPLOY_ENV, Value type: Value, Value: aws
  - Log collection
    - Destination: AWS CloudWatch
    - awslogs-group: /ecs/{プロジェクト名}
    - awslogs-region: ap-northeast-1
    - awslogs-stream-prefix: migration
  - Docker configuration
    - Command: alembic,upgrade,head

③nuScenesメタデータのDBインポート用タスク定義
マイグレーション用タスク定義とほぼ同設定で、以下の部分だけ変える
- Task definition name: {プロジェクト名}-import-task
- Container - 1
  - Container name: import
  - Envirionment variables（以下を追加）
    - Key: S3_DATA_BUCKET, Value type: ValueFrom, Value: /{プロジェクト名}/s3/data_bucket
    - Key: PYTHONPATH, Value type: Value, Value: /app
  - Log collection
    - awslogs-stream-prefix: import
  - Docker configuration
    - Command: python,scripts/import_nuscenes.py,--dataset-version,v1.0-mini

④Map expansionのDBインポート用タスク定義
マイグレーション用タスク定義とほぼ同設定で、以下の部分だけ変える
- Task definition name: {プロジェクト名}-import-map-task
- Container - 1
  - Container name: map_import
  - Envirionment variables（以下を追加）
    - Key: S3_DATA_BUCKET, Value type: ValueFrom, Value: /{プロジェクト名}/s3/data_bucket
    - Key: PYTHONPATH, Value type: Value, Value: /app
  - Log collection
    - awslogs-stream-prefix: map_import
  - Docker configuration
    - Command: python,scripts/import_nuscenes_map.py

#### ログ保持期間の変更

タスク定義作成時にawslogs-create-group: trueを選択しているので、`/ecs/{プロジェクト名}`というロググループが自動で生成しているはず。このロググループはデフォルトで削除期間が設定されていないので、ログが溜まり続けるのを防ぐために30日で削除されるよう設定変更する

CloudWatch → Logs → Log Management
で、ロググループ`/ecs/{プロジェクト名}`を選択

Actions → Edit retention setting
で、Expire events after: 1month (30 days)を選択

#### ECSサービスの作成

ECS → Clusters → {プロジェクト名}-cluster → Services → Create

- Task definition family: {プロジェクト名}-backend-task
- Task definition revision: LATEST
- Service name: {プロジェクト名}-service
- Compute options: Launch type
- Launch type: Fargate
- Platform version: LATEST
- Desired tasks: 1
- Turn on Availability Zone rebalancing: Disabled（マルチAZ構成へ移行した場合に有効化）
- VPC: {プロジェクト名}-vpc（上で作成したVPCを使用）
- Subnets: {プロジェクト名}-subnet-private1-ap-northeast-1a のみ（マルチAZ構成へ移行した場合もう片方のAZを追加）
- Security group: {プロジェクト名}-sg-ecs（上で作成したECS用セキュリティグループを使用）
- Public IP: Turned off（ALBを使用するので不要）
- Use load balancing: Enabled
- Load balancer type: Application Load Balancer
- Application Load Balancer: Use an existing load balancer
- Load balancer: {プロジェクト名}-alb（上で作成したALBを指定）
- Listener: Use an existing listener
  - Listener: 上で作成したHTTP:80のリスナーを指定
- Target group: Use an existing target group
  - Target group name: {プロジェクト名}-tg（上で作成したターゲットグループを指定）
  - Health check path: /health
  - Health check protocol: HTTP
- Use service auto scaling: Disabled

Createを押してしばらく待ち、{プロジェクト名}-serviceサービスのTasksタブのLast statusがRunningになっていれば成功

#### ALBの疎通確認

EC2 → Load Balancers → {プロジェクト名}-alb → DNS nameをコピー
  例: {プロジェクト名}-alb-xxxx.ap-northeast-1.elb.amazonaws.com

以下コマンドでコピーしたDNS nameに対してヘルスチェックの確認

```bash
curl http://{プロジェクト名}-alb-xxxx.ap-northeast-1.elb.amazonaws.com/health
```

`{"status": "ok"}`が帰ってくればOK

うまくいかないときは

#### マイグレーションの実行

マイグレーションは常駐プロセスではなく単発処理のため、サービスを立ち上げずに単発タスクで実行する

ECS → Clusters → {プロジェクト名}-cluster → Tasks → Run new task

- Task definition family: {プロジェクト名}-migration-task
- Task definition revision: LATEST
- Desired tasks: 1
- Compute options: Launch type
- Launch type: Fargate
- Platform version: LATEST
- VPC: {プロジェクト名}-vpc（上で作成したVPCを使用）
- Subnets: {プロジェクト名}-subnet-private1-ap-northeast-1a のみ
- Security group: {プロジェクト名}-sg-ecs（上で作成したECS用セキュリティグループを使用）
- Public IP: Turned off

Createを押してしばらく待ち、当該TaskのLast statusがPending → Running → Stoppedと変わるのを待つ。Stoppedになったら、当該Taskをクリック → Containers → migrationのStatusが`Stopped | Exit code: 0`となっていれば成功

失敗していたら、{プロジェクト名}-cluster → TasksのLast statusに理由が書いてあるのと、CloudWatch → Log Managementの該当ログ部分を見るとデバッグの参考になります。

#### DBインポートの実行

S3上にアップロード済のnuScene本体とMap Expansionのメタデータを、DBにインポートします。基本的には

ECS → Clusters → {プロジェクト名}-cluster → Tasks → Run new task

で、マイグレーション実行タスクと同設定で、Task definition familyのみ`{プロジェクト名}-import-task`に変更します。
Createを押してしばらく待ち、当該TaskのLast statusがPending → Running → Stoppedと変わるのを待つ。Stoppedになったら、当該Taskをクリック → Containers → migrationのStatusが`Stopped | Exit code: 0`となっていれば成功

同様にMap Expansionのインポート用タスクも、Task definition familyで`{プロジェクト名}-import-task`を選択して実行します。

#### バックエンドの動作確認

EC2 → Load Balancers → {プロジェクト名}-albと開き、DNS nameのところに書いてある値（ALBのDNS name）をコピー

以下コマンドでscenes一覧が返ってくるかを確認する（`{dns-name}`には上で調べたALBのDNS nameを入力）。

```zsh
curl http://{dns-name}/api/v1/scenes
```

他にも

- `curl http://{dns-name}/api/v1/scenes/{token}/samples`
- `curl http://{dns-name}/api/v1/samples/{token}/sensor-data`
- `curl http://{dns-name}/api/v1/sensor-data/{token}/image`（カメラ画像）
- `curl http://{dns-name}/api/v1/sensor-data/{token}/pointcloud`（LiDAR点群）
- `curl http://{dns-name}/api/v1/maps`
- `curl http://{dns-name}/api/v1/maps/{location}/basemap`（basemap画像）

等を試すと良い

### J. フロントエンドのS3+CloudFront実装

アプリをCloudFrontドメイン（`*************.cloudfront.net`）で配信するよう、フロントエンドのS3+CloudFront実装を実施する

#### フロントエンドリソースのビルド

まず以下のような本番用の環境変数ファイル`frontend/.env.production`をGitリポジトリ（ローカルのプロジェクトフォルダ）内に作成し、以下のパス（相対パス）を記載

```
VITE_API_BASE_PATH=/api/v1
```

以下コマンドでフロントエンド用コンテナを本番形式でビルド

```zsh
docker build \
  --target builder \
  -t {プロジェクト名}-frontend-builder \
  -f frontend/Dockerfile \
  ./frontend
```

以下コマンドでdistを取り出す

```zsh
docker create --name fe-builder {プロジェクト名}-frontend-builder
docker cp fe-builder:/app/dist ./frontend/dist
docker rm fe-builder
```

以下コマンドでビルド結果を確認し

```zsh
ls ./frontend/dist
```

`assets          index.html`のフォルダ・ファイルが表示されればOK

#### S3に静的ファイルをアップロード

以下コマンドでindex.htmlをキャッシュなしでアップロード

```zsh
aws s3 cp ./frontend/dist/index.html \
  s3://{プロジェクト名}-static/index.html \
  --cache-control "no-cache, no-store, must-revalidate" \
  --region ap-northeast-1
```

以下コマンドでその他のファイルを長期キャッシュありでアップロード（`{account-id}`の部分は自分のAWSアカウントIDを入力）

```zsh
aws s3 sync ./frontend/dist \
  s3://{プロジェクト名}-static \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable" \
  --delete \
  --region ap-northeast-1
```

#### CloudFrontディストリビューションの作成

CloudFront → Distributions → Create distribution → Freeで以下ディストリビューションを作成（S3向けオリジンとビヘイビアも一緒に自動作成される）

- Distribution name: {プロジェクト名}-frontend
- Distribution type: Single website or app
- Origin type: S3
- S3 Origin: {プロジェクト名}-static.s3.ap-northeast-1.amazonaws.com（静的ファイルをアップロードしたバケット）
- Allow private S3 bucket access to CloudFront: Yes（該当S3バケットにCloudFrontからのアクセス許可バケットポリシーが自動作成される）

##### Default root objectの追加

作成したディストリビューションをクリックし、Generalタブ → Editで

- Default root object : index.html

を入力し、Save changesで確定

##### ALBオリジンの追加

Originsタブ → Create originで

- Origin domain: ALBのDNS名（EC2 → Load Balancers → {プロジェクト名}-alb → DNS nameで調べられるが、恐らく自動で選択肢に出てくる）
- Protocol: HTTP only
- HTTP port: 80

を選択し、Create originで確定

##### dataバケット内ファイル配信用オリジンの追加

Originsタブ → Create originで

- Origin domain: {プロジェクト名}-data.s3.ap-northeast-1.amazonaws.com
- Origin access: Origin access control settings
- Origin access control: Create new OAC
  - Name: {プロジェクト名}-data-oac
  - Signing behavior: Sign requests

を選択し、Create originで確定

##### /api/*のビヘイビアを追加

Behaviorsタブ → Create behaviorで

- Path pattern: /api/*
- Origin and origin groups: 上で作成したALB（ELB）オリジンを選択
- Compress objects automatically: Yes
- Viewer protocol policy: Redirect HTTP to HTTPS
- Allowed HTTP methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
- Restrict viewer access: NO
- Cache policy: CachingDisabled
- Origin request policy: AllViewer

を選択し、Create behaviorで確定

##### dataバケット内ファイル配信用ビヘイビアの追加

Behaviorsタブ → Create behaviorで

- Path pattern: /data/*
- Origin: 上で作成したdataバケット内ファイル配信用オリジンのオリジン
- Compress objects automatically: Yes
- Viewer protocol policy: Redirect HTTP to HTTPS
- Allowed HTTP methods: GET, HEAD
- Restrict viewer access: NO
- Cache policy: CachingOptimized
- Origin request policy: CORS-S3Origin

を選択し、Create behaviorで確定

##### SPAルーティングの追加

Error pagesタブ → Create custom error responseで、以下2つのエラーレスポンスを作成

1つ目
- HTTP error code: 403: Forbidden
- Error caching minimum TTL: 0
- Customize error response: Yes
- Response page path: /index.html
- HTTP Response code: 200: OK

2つ目
- HTTP error code: 404: Not Found
- Error caching minimum TTL: 0
- Customize error response: Yes
- Response page path: /index.html
- HTTP Response code: 200: OK

作成したディストリビューションのStatusがEnabledに変わるまで待つ（5〜10分くらい）

#### 作成したディストリビューションの他リソースへの登録

##### パラメータストアとECSにディストリビューションURL登録

System Manager → Parameter Store → Create parameterで以下パラメータを追加（CroudFrontの当該DirtributionのDistribution domain nameに記載）
- Name: /{プロジェクト名}/cloudfront/data_url
- Type: String
- Value: https://{distribution-domain}

Elastic Container Service → Task definitions → 当該タスク定義（バックエンド用
） → Create new revision → Environment variables → Add environment variableで以下環境変数を追加
- Key: CLOUDFRONT_DATA_URL
- Value type: ValueFrom
- Value: /{プロジェクト名}/cloudfront/data_url

##### CloudFront向けバケットポリシーの作成

CloudFrontでdataバケットのファイルを配信できるよう、
S3 → 当該バケット → Pemissionsタブ → Bucket policy → Editで以下のようなバケットポリシーを作成します。

```json
{
    "Version": "2008-10-17",
    "Id": "PolicyForCloudFrontPrivateContent",
    "Statement": [
        {
            "Sid": "AllowCloudFrontServicePrincipal",
            "Effect": "Allow",
            "Principal": {
                "Service": "cloudfront.amazonaws.com"
            },
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::{プロジェクト名}-data/*",
            "Condition": {
                "StringEquals": {
                    "AWS:SourceArn": "arn:aws:cloudfront::{account-id}:distribution/{distribution-id}"
                }
            }
        }
    ]
}
```

#### 動作確認

パラメータを再適用するため、以下コマンドでバックエンドを再デプロイ

```bash
# ECRリポジトリにログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin \
  {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com
# コンテナビルド
docker build \
  --platform linux/amd64 \
  --target production \
  -t {プロジェクト名}/backend:latest \
  -f backend/Dockerfile \
  ./backend
# イメージにタグ付け
docker tag {プロジェクト名}/backend:latest \
  {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/{プロジェクト名}/backend:latest
# ECRリポジトリにプッシュ
docker push \
  {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/{プロジェクト名}/backend:latest
```

ECS → Clusters → {プロジェクト名}-cluster → Services → {プロジェクト名}-service → Update service → Force new deploymentをチェック（タスク定義を更新した場合のみTask definition revisionで最新のものを選択し、他項目は変更しない）→ Update
TasksタブのLast statusがRunningになっていれば成功。

作成したディストリビューションをクリックし、Distribution domain nameをコピーする。
ブラウザに以下アドレスを入力して開く（`{distribution-domain}`には調べたDistribution domain nameを入力）

`https://{distribution-domain}`

アプリが動作すれば成功

com.amazonaws.ap-northeast-1.ecr.dkrとcom.amazonaws.ap-northeast-1.ecr.apiのエンドポイントはデプロイ以外では使用しないので、コストを低減したいのであれば削除してOKです

### ※リソースの削除

デプロイしたリソースを削除するには、コンソールから以下順番で削除します

- ECSサービス
- ECSタスク定義
- ECSクラスター
- ALB・ターゲットグループ
- CloudFrontディストリビューション
- ECRリポジトリ（イメージごと）
- RDSインスタンス
- SSMパラメータ
- S3バケット（データは別途バックアップ）
- VPCエンドポイント
- セキュリティグループ
- VPC（サブネット・ルートテーブル・IGW含む）
- IAMロール・ポリシー
- CloudWatch Logsグループ

## Terraformでのデプロイ

Terraformでのデプロイは、コスト最適化の観点から常駐するリソースを最小限に抑えるため、ユースケースに応じて以下のようにデプロイするリソースを分けます。

|No.|ユースケース|内容|
|---|---|---|
|1|アプリ本体のデプロイ|nuscenes-viewerアプリ動作用リソース（常駐するリソース）|
|2|バックエンド更新|nuscenes-viewerアプリのバックエンドを最新版に更新する|
|3|踏み台インスタンスのデプロイ|DB等のメンテナンス用の踏み台EC2インスタンスをデプロイする|

### 1. アプリ本体のデプロイ


### 2. バックエンド更新

バックエンド更新用リソースは`terraform/deploy`に実装しています。

リソースの検証は以下コマンドで実施できます

```bash
# terraform/deployフォルダに移動
cd terraform/deploy
# リソースの検証
terraform plan \
  -var="region={リージョン名}" \
  -var="project_name={プロジェクト名}"
```

これにより、以下コマンド一発でアプリのバックエンド（コンテナイメージとECSサービス）を更新できます（リポジトリのルートフォルダで実行します）。

```bash
make deploy-backend
```

### 3. 踏み台インスタンスのデプロイ

踏み台インスタンス用リソースは`terraform/maintenance`に実装しています。

リソースの検証は以下コマンドで実施できます

```bash
# terraform/maintenanceフォルダに移動
cd terraform/maintenance
# リソースの検証
AWS_PROFILE=terraform terraform init
AWS_PROFILE=terraform terraform plan \
  -var="region={リージョン名}" \
  -var="project_name={プロジェクト名}"
```

踏み台インスタンスを立ち上げたいときは、リポジトリのルートフォルダで以下コマンドを実行します

```zsh
make maintenance-up
```

踏み台インスタンスを削除したいときは、リポジトリのルートフォルダで以下コマンドを実行します

```zsh
make maintenance-down
```

### ※マイグレーションコンテナによるDBスキーマ更新

あまり使うことはないですが、migrationコンテナを使ってDBスキーマを最新版に更新するには、リポジトリのルートフォルダで以下コマンドを実行します

```zsh
make rds-migration
```
