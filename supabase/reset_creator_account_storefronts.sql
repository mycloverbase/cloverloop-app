-- REVIEW ONLY: this reset has not been executed.
--
-- Before running this SQL, empty and delete only these buckets through the
-- Supabase Storage API (or Dashboard):
--   creator-avatars
--   storefront-assets
-- Use a trusted admin client: call storage.emptyBucket(id), then
-- storage.deleteBucket(id) for each bucket, stopping on any error. Do not
-- delete rows from storage.objects with SQL; that leaves files orphaned.
-- Production currently contains one creator profile row and one avatar
-- object; both were confirmed as disposable test data.
--
-- This transaction removes only creator-account/storefront database objects
-- and the exact storefront cron job. It does not drop auth objects, unrelated
-- tables or buckets, extensions, Vault secrets, or the purge-storefronts
-- Edge Function. It intentionally uses no CASCADE.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id IN ('creator-avatars', 'storefront-assets')
  ) THEN
    RAISE EXCEPTION
      'Empty and delete creator-avatars and storefront-assets through the Storage API before running this reset';
  END IF;
END;
$$;

DO $$
DECLARE
  storefront_job_id bigint;
BEGIN
  FOR storefront_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'purge-expired-storefronts'
  LOOP
    PERFORM cron.unschedule(storefront_job_id);
  END LOOP;
END;
$$;

DROP VIEW IF EXISTS public.published_storefronts;

DROP POLICY IF EXISTS "Creators can view their own avatar files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can upload their own avatar files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can delete their own avatar files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can read their own storefront images" ON storage.objects;
DROP POLICY IF EXISTS "Creators can delete their own storefront images" ON storage.objects;
DROP POLICY IF EXISTS "Published storefront images are publicly readable" ON storage.objects;

DO $$
DECLARE
  feature_policy record;
BEGIN
  FOR feature_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'creator_profiles',
        'creator_feedback',
        'storefront_reserved_usernames',
        'creator_storefronts',
        'storefront_username_claims',
        'storefront_assets'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      feature_policy.policyname,
      feature_policy.schemaname,
      feature_policy.tablename
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  feature_trigger record;
BEGIN
  FOR feature_trigger IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname AS trigger_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('creator_profiles', 'creator_storefronts')
      AND t.tgname IN (
        'set_creator_profile_updated_at',
        'set_creator_storefront_updated_at',
        'sync_storefront_username_claims'
      )
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format(
      'DROP TRIGGER %I ON %I.%I',
      feature_trigger.trigger_name,
      feature_trigger.schema_name,
      feature_trigger.table_name
    );
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.set_creator_profile_updated_at();
DROP FUNCTION IF EXISTS public.set_creator_storefront_updated_at();
DROP FUNCTION IF EXISTS public.sync_storefront_username_claims();
DROP FUNCTION IF EXISTS public.storefront_username_available(text);
DROP FUNCTION IF EXISTS public.storefront_redirect_target(text);
DROP FUNCTION IF EXISTS public.register_storefront_asset(uuid, text);
DROP FUNCTION IF EXISTS public.save_my_storefront(text, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.publish_my_storefront();
DROP FUNCTION IF EXISTS public.unpublish_my_storefront();
DROP FUNCTION IF EXISTS public.delete_my_storefront();
DROP FUNCTION IF EXISTS public.is_published_storefront_asset(text);
DROP FUNCTION IF EXISTS public.delete_my_account();

DROP TABLE IF EXISTS public.storefront_assets;
DROP TABLE IF EXISTS public.storefront_username_claims;
DROP TABLE IF EXISTS public.creator_storefronts;
DROP TABLE IF EXISTS public.storefront_reserved_usernames;
DROP TABLE IF EXISTS public.creator_feedback;
DROP TABLE IF EXISTS public.creator_profiles;

COMMIT;
