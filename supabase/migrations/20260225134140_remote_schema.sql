drop extension if exists "pg_net";

alter table "public"."image_metadata" drop constraint "image_metadata_ai_processing_status_check";

alter table "public"."image_metadata" add constraint "image_metadata_ai_processing_status_check" CHECK (((ai_processing_status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[]))) not valid;

alter table "public"."image_metadata" validate constraint "image_metadata_ai_processing_status_check";


  create policy "Users can upload/select to/from own folder 1vs8c42_0"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'gallery'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload/select to/from own folder 1vs8c42_1"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'gallery'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



