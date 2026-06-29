ALTER TABLE `user_gyms` ADD COLUMN `gym_visit_streak` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `user_gyms` ADD COLUMN `last_gym_visit_date` timestamp;--> statement-breakpoint
ALTER TABLE `user_gym_npc_relationships` ADD COLUMN `gym_days_active` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `user_gym_npc_relationships` ADD COLUMN `milestone_dialogs_fired` json NOT NULL DEFAULT ('[]');
