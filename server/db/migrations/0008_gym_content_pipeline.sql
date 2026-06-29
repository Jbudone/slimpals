ALTER TABLE `user_gyms` ADD COLUMN `today_event_data` json;--> statement-breakpoint
ALTER TABLE `user_gym_npc_relationships` ADD COLUMN `gym_memory_events` json NOT NULL DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `gym_npcs` ADD COLUMN `portrait_generated_at` timestamp;
