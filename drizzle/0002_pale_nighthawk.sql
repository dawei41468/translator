ALTER TABLE "room_participants" ADD COLUMN "status" varchar(20) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "room_participants" ADD COLUMN "last_seen" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "room_participants" ADD COLUMN "backgrounded_at" timestamp;--> statement-breakpoint
CREATE INDEX "room_participants_status_idx" ON "room_participants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "room_participants_last_seen_idx" ON "room_participants" USING btree ("last_seen");