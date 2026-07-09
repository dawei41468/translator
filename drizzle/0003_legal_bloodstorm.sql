ALTER TABLE "rooms" DROP CONSTRAINT "rooms_created_by_users_id_fk";
--> statement-breakpoint
DROP INDEX "room_participants_room_user_idx";--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "room_participants_room_user_idx" ON "room_participants" USING btree ("room_id","user_id");