CREATE TYPE "public"."vault_item_kind" AS ENUM('note', 'attachment');--> statement-breakpoint
CREATE TABLE "vault_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relative_path" varchar(512) NOT NULL,
	"name" varchar(255) NOT NULL,
	"kind" "vault_item_kind" NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_items_relative_path_unique" UNIQUE("relative_path")
);
