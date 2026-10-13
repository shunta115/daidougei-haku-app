-- READ ONLY. Run before and after the payout migration/deployment.
begin transaction read only;

-- AWP audit baseline: 2026-10-10 00:00 through 2026-10-13 00:00 JST.
with awp_live_tips as (
  select * from public.tips
  where created_at >= timestamptz '2026-10-10 00:00:00+09'
    and created_at <  timestamptz '2026-10-13 00:00:00+09'
    and stripe_session_id like 'cs_live_%'
    and status = 'succeeded'
)
select
  count(*) as live_payment_count,
  coalesce(sum(gross_amount_yen), 0) as gross_yen,
  coalesce(sum(stripe_fee_yen), 0) as stripe_fee_yen,
  coalesce(sum(haku_fee_yen), 0) as haku_fee_yen,
  coalesce(sum(performer_share_yen), 0) as performer_share_yen
from awp_live_tips;

-- Expected audit baseline: 11 / 13100 / 521 / 1886 / 10693.
-- Any difference must stop release and be reconciled; this query never repairs it.

select
  p.id as performer_id,
  p.stage_name,
  count(t.id) as payments,
  coalesce(sum(t.gross_amount_yen), 0) as gross_yen,
  coalesce(sum(t.performer_share_yen), 0) as performer_share_yen
from public.performers p
left join public.tips t on t.performer_id = p.id
  and t.created_at >= timestamptz '2026-10-10 00:00:00+09'
  and t.created_at <  timestamptz '2026-10-13 00:00:00+09'
  and t.stripe_session_id like 'cs_live_%'
  and t.status = 'succeeded'
group by p.id, p.stage_name
having count(t.id) > 0
order by p.id;

-- These result sets must be empty.
select stripe_session_id, count(*)
from public.tips where stripe_session_id is not null
group by stripe_session_id having count(*) > 1;

select stripe_payment_intent, count(*)
from public.tips where stripe_payment_intent is not null
group by stripe_payment_intent having count(*) > 1;

select performer_id, count(*)
from public.performer_payouts where status = 'reserved'
group by performer_id having count(*) > 1;

select id, performer_id, amount_yen, status, stripe_transfer_id
from public.performer_payouts
where amount_yen < 10000 or (status = 'paid' and stripe_transfer_id is null);

rollback;
