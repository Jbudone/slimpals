CREATE TABLE `gym_npcs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`role` enum('trainer','receptionist','regular','specialist') NOT NULL,
	`personality_profile` json NOT NULL,
	`default_schedule` json NOT NULL,
	`portrait_url` varchar(500),
	`sprite_key` varchar(128) NOT NULL,
	`unlocked_by_upgrade_key` varchar(128),
	CONSTRAINT `gym_npcs_id` PRIMARY KEY(`id`),
	CONSTRAINT `gym_npcs_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `user_gym_npc_relationships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`npc_key` varchar(128) NOT NULL,
	`relationship_level` int NOT NULL DEFAULT 0,
	`personality_notes` json NOT NULL DEFAULT ('[]'),
	`interaction_count` int NOT NULL DEFAULT 0,
	`last_interacted_at` timestamp,
	`mood_history` json NOT NULL DEFAULT ('[]'),
	CONSTRAINT `user_gym_npc_relationships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gym_npc_daily_state` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`npc_key` varchar(128) NOT NULL,
	`date` timestamp NOT NULL,
	`mood` int NOT NULL DEFAULT 0,
	`goal_sequence` json NOT NULL DEFAULT ('[]'),
	`equipment_history` json NOT NULL DEFAULT ('[]'),
	`mood_events` json NOT NULL DEFAULT ('[]'),
	CONSTRAINT `gym_npc_daily_state_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_gym_npc_relationships` ADD CONSTRAINT `user_gym_npc_relationships_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `gym_npc_daily_state` ADD CONSTRAINT `gym_npc_daily_state_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
