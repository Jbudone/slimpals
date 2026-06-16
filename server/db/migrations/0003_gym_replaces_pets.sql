DROP TABLE IF EXISTS `user_pet_items`;--> statement-breakpoint
DROP TABLE IF EXISTS `pet_companions`;--> statement-breakpoint
DROP TABLE IF EXISTS `pet_items`;--> statement-breakpoint
CREATE TABLE `user_gyms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(128) NOT NULL,
	`level` int NOT NULL DEFAULT 0,
	`xp` int NOT NULL DEFAULT 0,
	`pending_upgrade_keys` json NOT NULL DEFAULT ('[]'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_gyms_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_gyms_user_id_unique` UNIQUE(`user_id`),
	CONSTRAINT `user_gyms_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE `gym_upgrades_catalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` enum('cardio','weights','amenities','decor','staff') NOT NULL,
	`required_xp` int NOT NULL DEFAULT 0,
	`sort_order` int NOT NULL DEFAULT 0,
	`asset_prompt` text,
	`unlocks_npc_key` varchar(128),
	CONSTRAINT `gym_upgrades_catalog_id` PRIMARY KEY(`id`),
	CONSTRAINT `gym_upgrades_catalog_key_unique` UNIQUE(`key`)
);--> statement-breakpoint
CREATE TABLE `user_gym_upgrades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`upgrade_key` varchar(128) NOT NULL,
	`unlocked_at` timestamp NOT NULL DEFAULT (now()),
	`placement_data` json,
	CONSTRAINT `user_gym_upgrades_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_gym_upgrades_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action
);
