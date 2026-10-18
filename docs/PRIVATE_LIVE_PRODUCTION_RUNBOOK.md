# Private LIVE production runbook

This runbook is preparation only. Do not connect to or mutate the production database until an explicit production-change approval is recorded.

## Change set

Apply these migrations in order:

1. `20261018101500_private_test_live.sql`
   - adds `performers.is_private_test` with a `false` default;
   - marks only the verified Test Performer UUID as private after checking its stage name;
   - protects the flag from performer self-service updates;
   - hides the performer, sessions, and public event placement through RLS/triggers.
2. `20261018102007_private_live_viewer_allowlist.sql`
   - verifies both Supabase Auth UUID/email/profile tuples inside the transaction;
   - adds the session-scoped allowlist, with no Data API grants for `anon` or `authenticated`;
   - automatically allowlists only the verified s.s UUID for Test Performer sessions;
   - extends performer/session/comment/tip-event RLS to the active allowlisted session;
   - exposes Test Performer MAP coordinates and published appearance rows only to the verified active s.s fan UUID;
   - filters future private appearance in-app and push deliveries to that same UUID;
   - suppresses follower notifications for private LIVE at the database boundary.

Neither migration changes Stripe, Connect, tips, payouts, or historical payment rows.

## Approval gate and preflight

Before applying, record explicit approval and a maintenance window. Confirm that production migration history has no failed/pending entry and that both new versions are later than the latest applied version.

Run read-only identity checks and require exactly one row from each query:

```sql
select u.id, lower(u.email), u.email_confirmed_at, p.role, p.status,
       pf.stage_name, pf.is_approved
from auth.users u
join public.profiles p on p.id = u.id
join public.performers pf on pf.id = u.id
where u.id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid;

select u.id, lower(u.email), u.email_confirmed_at, p.display_name, p.role, p.status
from auth.users u
join public.profiles p on p.id = u.id
where u.id = '1c21f421-5561-4213-8759-962873accfa0'::uuid;
```

Confirm Test Performer has no public event link. Both migrations also fail and roll back if their identity/link invariants do not hold.

## Backup

Prefer a Supabase point-in-time recovery bookmark/snapshot immediately before the change. Also create an encrypted custom-format logical backup from an approved operator host:

```sh
pg_dump --dbname "$PRODUCTION_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --file "haku-before-private-live-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Store the dump in the approved encrypted backup location, record its SHA-256 checksum, and test that `pg_restore --list BACKUP.dump` succeeds. Never commit the dump or connection string.

## Apply and verify

Apply only through the repository migration workflow after reviewing the generated dry-run SQL. Do not paste fragments independently: each file is transactional.

After apply, verify with three disposable sessions/tokens:

- anonymous and an unrelated active fan receive no Test Performer row/session and token issuance returns `403`;
- anonymous and an unrelated active fan receive no Test Performer MAP coordinates or appearance rows;
- s.s sees the live card and private MAP/appearance card, receives a viewer-only token for `private-<performer UUID>-<session UUID>`, and can subscribe to audio/video;
- Test Performer receives a publish token for that same session room;
- a normal public LIVE remains visible and viewable by a guest;
- no private notification, map marker, public event placement, or public Realtime fever broadcast appears;
- after end, the session has `ended_at`, the room is deleted, identities are revoked, and the old token cannot reconnect.

## Restore

If verification fails before traffic resumes, stop application writes and restore the pre-change point-in-time snapshot. For a logical restore into a clean recovery database:

```sh
createdb "$RECOVERY_DATABASE_NAME"
pg_restore --dbname "$RECOVERY_DATABASE_URL" --no-owner --clean --if-exists BACKUP.dump
```

Validate the recovery database first, then follow the approved Supabase restore/promote procedure. A full snapshot restore is preferred over a hand-written down migration because the change replaces existing RLS policies and a partial rollback could reopen private rows. Preserve the failed database for audit until recovery is confirmed.

## Rollout order

1. Merge only after CI and review pass.
2. Obtain explicit production DB approval.
3. Capture and validate backup.
4. Apply both migrations.
5. Deploy the server/client code immediately after DB verification.
6. Run the access matrix above in production with Test Performer and s.s.
7. Monitor `403` token denials, presence cleanup errors, and unexpected notification/map activity.
