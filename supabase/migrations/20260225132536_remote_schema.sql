


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."image_metadata" (
    "id" integer NOT NULL,
    "image_id" integer,
    "user_id" "uuid",
    "description" "text",
    "tags" "text"[],
    "colors" character varying(7)[],
    "ai_processing_status" character varying(20) DEFAULT 'pending'::character varying,
    "error_message" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "image_metadata_ai_processing_status_check" CHECK ((("ai_processing_status")::"text" = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::"text"[])))
);


ALTER TABLE "public"."image_metadata" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."image_metadata_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."image_metadata_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."image_metadata_id_seq" OWNED BY "public"."image_metadata"."id";



CREATE TABLE IF NOT EXISTS "public"."images" (
    "id" integer NOT NULL,
    "user_id" "uuid",
    "filename" character varying(255),
    "original_path" "text",
    "thumbnail_path" "text",
    "uploaded_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."images" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."images_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."images_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."images_id_seq" OWNED BY "public"."images"."id";



ALTER TABLE ONLY "public"."image_metadata" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."image_metadata_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."images" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."images_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."image_metadata"
    ADD CONSTRAINT "image_metadata_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."images"
    ADD CONSTRAINT "images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."image_metadata"
    ADD CONSTRAINT "image_metadata_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id");



ALTER TABLE ONLY "public"."image_metadata"
    ADD CONSTRAINT "image_metadata_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."images"
    ADD CONSTRAINT "images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Users can only see own images" ON "public"."images" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can only see own metadata" ON "public"."image_metadata" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."image_metadata" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."images" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."image_metadata";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."images";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";








































































































































































GRANT ALL ON TABLE "public"."image_metadata" TO "anon";
GRANT ALL ON TABLE "public"."image_metadata" TO "authenticated";
GRANT ALL ON TABLE "public"."image_metadata" TO "service_role";



GRANT ALL ON SEQUENCE "public"."image_metadata_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."image_metadata_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."image_metadata_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."images" TO "anon";
GRANT ALL ON TABLE "public"."images" TO "authenticated";
GRANT ALL ON TABLE "public"."images" TO "service_role";



GRANT ALL ON SEQUENCE "public"."images_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."images_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."images_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































