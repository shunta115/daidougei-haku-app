# HAKU P3 本番DB承認資料

更新日: 2026-10-18

## 適用停止状態

- 本番project ref: `pmmtijwswzwhuriqhlep`
- P3 migration: `supabase/migrations/20261016142951_live_comment_moderation.sql`
- SHA-256: `075502b0adde57e2eb40a91a40a4fd3b3274d1bf8048ed59938206c5ffd741c1`
- 本番へのP3 SQL適用、migration history repair、データ削除は未実施。
- 2026-10-18のREAD ONLY確認時点で`public.live_comments`は59件。

## 1. 適用直前の論理バックアップ

Supabase CLIの`db dump`は既定で`auth`、`storage`、拡張管理schemaを除外し、schema・data・roleを別々に出力する。このため「完全な論理バックアップ」には、PostgreSQL 17の`pg_dump`を直接使ったcustom archiveを正本とし、Supabase CLIのportable dumpを補助資料として併用する。

バックアップは本番接続情報をGit、PR、ログへ残さない管理端末で実行する。接続先はDirect connectionまたはSession poolerを使い、Transaction poolerは使わない。

```sh
umask 077
backup_root="$(mktemp -d)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$backup_root/haku-$timestamp"
mkdir -p "$backup_dir"

# 対話入力または承認済みsecret storeから設定する。コマンド履歴へ直書きしない。
test -n "${HAKU_BACKUP_DB_URL:?set HAKU_BACKUP_DB_URL}"

# pg_dumpの接続を防御的にread-onlyへ固定する。本番DBの設定自体は変更しない。
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=0' \
pg_dump "$HAKU_BACKUP_DB_URL" \
  --format=custom \
  --no-owner \
  --no-subscriptions \
  --serializable-deferrable \
  --file "$backup_dir/haku-full.dump"

# 人間が差分確認できるschema-only版。RLS、関数、trigger、policy、ACLを確認する。
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=0' \
pg_dump "$HAKU_BACKUP_DB_URL" \
  --schema-only \
  --no-owner \
  --no-subscriptions \
  --file "$backup_dir/haku-schema.sql"

pg_restore --list "$backup_dir/haku-full.dump" > "$backup_dir/haku-full.list"
shasum -a 256 "$backup_dir/haku-full.dump" "$backup_dir/haku-schema.sql" \
  > "$backup_dir/SHA256SUMS"
```

custom archiveには、通常のschemaとdataに加え、RLS有効化、policy、関数、trigger、sequence、index、constraint、publication、GRANT/REVOKEが含まれる。PostgreSQLのrole定義とrole password、Supabase Storageの実オブジェクト本体はDB dumpの対象外である。Storageはメタデータのみなので、オブジェクト本体が必要なら別の承認済みStorage exportが必要。

## 2. バックアップ整合性

リポジトリの`./scripts/verify-pg-backup.sh`を使用する。

```sh
./scripts/verify-pg-backup.sh \
  "$backup_dir/haku-full.dump" \
  "$backup_dir/SHA256SUMS"
```

合格条件:

1. archiveとchecksumファイルが空でない。
2. `shasum -a 256 -c`が成功する。
3. `pg_restore --list`が成功し、TABLE DATAを含む。
4. schema抽出結果にFUNCTION、TRIGGER、POLICY、ROW SECURITY、ACLの各エントリがある。
5. archive、一覧、checksumを暗号化済みの承認保管先へ移し、ローカル一時領域から削除する。

バックアップ内容や資格情報をGit、PR、チャットへ添付しない。

## 3. 隔離復元テスト

本番と同じPostgreSQL major version 17の使い捨て環境を使用する。本番project、既存の検証project、共有DBを復元先にしない。

第一段階はローカルの使い捨てPostgreSQL 17でarchiveの構文・依存関係を検査する。Supabase固有extensionが必要な場合は、対応するローカルSupabase stackへ切り替える。

```sh
# 復元先URLはlocalhostだけを許可する。
test "${HAKU_RESTORE_DB_URL#*localhost}" != "$HAKU_RESTORE_DB_URL" || exit 64

pg_restore \
  --dbname "$HAKU_RESTORE_DB_URL" \
  --no-owner \
  --exit-on-error \
  --single-transaction \
  "$backup_dir/haku-full.dump"
```

復元後は本番と隔離環境で、table件数、policy、function、trigger、ACL、publication、代表テーブルの行数をREAD ONLYで比較する。`live_comments`はバックアップ取得時の件数と一致すること。匿名・一般視聴者・配信者・モデレーターのRLSテストは隔離環境だけで実行する。

第二段階としてSupabase固有機能まで確認する場合は、新しい隔離projectまたはbranchの費用と作成を別途承認後に実施する。既存projectへの上書き復元は禁止。

## 4. migration履歴の不整合

2026-10-18のREAD ONLY調査結果:

- 本番`supabase_migrations.schema_migrations`: `20261014065602 performer_appearances_and_notifications_20261014`の1件のみ。
- リポジトリ: 2026-07-26から2026-10-16まで38ファイル。
- ローカルの対応ファイル名は`20261014_performer_appearances_and_notifications.sql`であり、本番versionの桁数とも一致しない。
- `supabase db push --dry-run`は「remote versionがlocalにない」として安全に停止する。

安全な整合方針:

1. `migration repair`、履歴テーブルへのINSERT/UPDATE/DELETEは行わない。
2. 論理バックアップとschema manifestを正本として保存する。
3. 過去migrationごとに本番catalogとの同値性をREAD ONLYで確認する。ファイルが存在するだけで「適用済み」と扱わない。
4. P3は承認後、監査済みの単一SQLとして適用し、新しい履歴だけを正規に記録する。過去履歴は同時に修復しない。
5. 過去履歴を正規化する場合は、全migrationの同値性表、復元テスト、別の明示承認を必要とする。
6. 整合完了までは`supabase db push`を本番に使用しない。

## 5. P3再監査

P3 SQLは既存コメント行をUPDATE/DELETE/TRUNCATEしない。新規2テーブル、policy、index、GRANT、Realtime設定だけを変更する。

適用前の本番には次の問題がある。

- `anon`と`authenticated`が`live_comments`へTRUNCATE、UPDATE等の広いtable privilegeを持つ。
- 一般ユーザー本人削除policyが残る。
- P3用モデレーター／ミュートテーブルは未作成。

P3適用後の期待値:

- `anon`: `live_comments`のSELECTだけ。
- `authenticated`: コメントSELECT/INSERT/DELETE。DELETEはRLSで配信者・担当モデレーター・adminだけ。
- 担当モデレーターは配信者や別モデレーターをミュート／削除できない。
- `live_comments`は`REPLICA IDENTITY FULL`、`supabase_realtime` publicationへ登録済み。
- 追加のpermissive INSERT/DELETE/ALL policyが0件。

適用後は`supabase/verify_live_comment_moderation_readonly.sql`を実行し、Security Advisorの適用前後差分を保存する。

## 6. 最終承認ゲート

次をすべて満たすまで適用を承認しない。

- [ ] `haku-full.dump`取得完了
- [ ] checksum検証成功
- [ ] schema/data/RLS/function/trigger/policy/ACLの含有確認
- [ ] 隔離復元成功
- [ ] 復元後の代表行数と権限比較成功
- [ ] P3 SQL hashが本資料と一致
- [ ] 適用前READ ONLY snapshot取得
- [ ] Security Advisor baseline保存
- [ ] 適用担当者とロールバック担当者を確定
- [ ] 本番DB変更の明示承認

承認対象はP3 SQL 1ファイルだけとし、過去migration履歴repair、Stripe、Connect、投げ銭、投票、出演者データの変更は含めない。
