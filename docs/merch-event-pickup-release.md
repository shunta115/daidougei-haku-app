# グッズ会場受取・無料取り置き リリース手順

## 適用前提

`20261008_merch_event_pickup.sql` は次のmigration適用後に実行する。

1. `20260909_merch_foundation.sql`
2. `20260912_stripe_connect_direct_charges.sql`
3. `20261003_payout_settlement.sql`
4. `20261004_payment_ledger_write_lockdown.sql`
5. `20261004_platform_held_settlement.sql`
6. `20261005_admin_members.sql`
7. `20261008_merch_event_pickup.sql`

新migrationは列・index・server-only RPCの追加だけを行う。既存行のUPDATE、DELETE、TRUNCATE、既存決済の再計算は行わない。既存商品では無料取り置きを既定OFFとする。

## 適用前バックアップ

1. Supabase DashboardのDatabase backupsで直近バックアップ時刻と復元可能性を確認する。
2. SQL Editorで次のREAD ONLY件数を記録する。

```sql
select 'merch_products' as table_name, count(*) from public.merch_products
union all
select 'merch_orders', count(*) from public.merch_orders;

select status, count(*), coalesce(sum(amount_yen), 0) as amount_yen
from public.merch_orders
group by status
order by status;
```

3. SupabaseのExport CSV、または接続文字列を画面外で安全に扱える環境から次を取得する。

```sh
pg_dump --data-only --format=custom \
  --table=public.merch_products \
  --table=public.merch_orders \
  "$SUPABASE_DATABASE_URL" > merch-before-event-pickup.dump
```

接続文字列やパスワードをチャット、ログ、リポジトリへ保存しない。

## 適用後確認

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('merch_products', 'merch_orders')
  and column_name in (
    'pickup_location', 'pickup_deadline', 'reservation_enabled',
    'order_kind', 'order_number', 'fulfillment_status',
    'reservation_expires_at', 'fulfilled_at', 'cancelled_at', 'cash_received_at'
  )
order by table_name, ordinal_position;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_merch_cash_reservation',
    'update_merch_handoff',
    'expire_due_merch_reservations'
  )
order by routine_name;
```

## ロールバック

第一選択はコードを直前のProductionへ戻すこと。追加列とRPCは旧コードから参照されないため、DB側は残しても既存機能へ影響しない。

DB schemaの削除は、新形式の注文・取り置きが1件も作成されていないことをREAD ONLYで確認した場合に限る。注文が存在する場合は列・RPCを削除せず、コードだけを戻す。

```sql
select count(*) as new_format_orders
from public.merch_orders
where order_number is not null
   or order_kind = 'cash_reservation';
```

バックアップ復元、既存注文のUPDATE、Stripe決済の再処理、返金、Transfer、Payoutはロールバック作業として自動実行しない。
