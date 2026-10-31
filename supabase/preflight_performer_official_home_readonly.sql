-- Run ONLY against separately verified haku-merch-validation / aeqskxxykzapgaudbeqa.
-- This script does not prove project identity itself. Verify with project metadata first.
begin read only;
select jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),
 'private_schema_exists',to_regnamespace('haku_home_private') is not null,
 'conflicting_relations',(select coalesce(jsonb_agg(c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('performer_homepages','performer_home_assets','performer_home_one_main')),
 'conflicting_functions',(select coalesce(jsonb_agg(p.proname),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('home_add_asset','home_reorder_assets','home_set_main','home_submit_booking','home_manage_cases','home_claim_cleanup','home_ack_cleanup','home_case_privacy','home_retention')),
 'bucket_exists',exists(select 1 from storage.buckets where id='performer-home-private' or name='performer-home-private'),
 'performer_update_stays_denied',not has_any_column_privilege('service_role','public.performers','UPDATE'),
 'service_profile_read',has_table_privilege('service_role','public.profiles','SELECT'),
 'service_notification_insert',has_table_privilege('service_role','public.notifications','INSERT'),
 'office_lookup_currently_allowed',has_column_privilege('service_role','public.admin_members','user_id','SELECT') and has_column_privilege('service_role','public.admin_members','permission','SELECT') and has_column_privilege('service_role','public.admin_members','status','SELECT'),
 'office_email_currently_allowed',has_column_privilege('service_role','public.admin_members','email','SELECT'),
 'storage_policies',(select coalesce(jsonb_agg(jsonb_build_object('name',policyname,'cmd',cmd,'roles',roles,'using',qual,'with_check',with_check)),'[]') from pg_policies where schemaname='storage' and tablename='objects'),
 'migration_history',(select coalesce(jsonb_agg(version),'[]') from supabase_migrations.schema_migrations where version='20261030213928')
) as preflight;
commit;
