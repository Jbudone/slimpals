CREATE TABLE `badges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`icon_url` varchar(500),
	`tier` enum('bronze','silver','gold','platinum') NOT NULL DEFAULT 'bronze',
	CONSTRAINT `badges_id` PRIMARY KEY(`id`),
	CONSTRAINT `badges_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`theme` varchar(255),
	`ai_generated` boolean NOT NULL DEFAULT false,
	`tasks` json NOT NULL,
	CONSTRAINT `challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_checkins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`date` timestamp NOT NULL,
	`goals_completed` json,
	`mood` varchar(64),
	`notes` text,
	`streak_count` int NOT NULL DEFAULT 0,
	CONSTRAINT `daily_checkins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `food_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`photo_url` varchar(500) NOT NULL,
	`ai_analysis` json,
	`ai_edited_photo_url` varchar(500),
	`meal_type` enum('breakfast','lunch','dinner','snack') NOT NULL DEFAULT 'snack',
	`logged_at` timestamp NOT NULL DEFAULT (now()),
	`is_shared` boolean NOT NULL DEFAULT false,
	CONSTRAINT `food_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`created_by_user_id` varchar(36) NOT NULL,
	`used_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	CONSTRAINT `invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `invites_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `pet_companions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(128) NOT NULL,
	`type` enum('dragon','bear','cat','bunny','phoenix') NOT NULL DEFAULT 'cat',
	`level` int NOT NULL DEFAULT 1,
	`xp` int NOT NULL DEFAULT 0,
	`evolution_stage` int NOT NULL DEFAULT 1,
	`equipped_items` json NOT NULL DEFAULT ('[]'),
	`last_adventure_at` timestamp,
	`current_adventure` json,
	CONSTRAINT `pet_companions_id` PRIMARY KEY(`id`),
	CONSTRAINT `pet_companions_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `pet_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`icon_url` varchar(500),
	`rarity` enum('common','uncommon','rare','epic','legendary') NOT NULL DEFAULT 'common',
	`unlock_condition` varchar(255),
	CONSTRAINT `pet_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`post_id` int NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`emoji` enum('❤️','😂','💪','🔥','😭') NOT NULL,
	CONSTRAINT `reactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `social_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`type` enum('food_photo','ai_message','milestone','weight_update','challenge_completion') NOT NULL,
	`content` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `social_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tournament_participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tournament_id` int NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`joined_at` timestamp NOT NULL DEFAULT (now()),
	`completed` boolean NOT NULL DEFAULT false,
	CONSTRAINT `tournament_participants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`creator_id` varchar(36) NOT NULL,
	`start_date` timestamp NOT NULL,
	`end_date` timestamp NOT NULL,
	`type` enum('weight_loss','step_count','streak','food_challenge') NOT NULL,
	`goal_value` int,
	`reward_description` text,
	CONSTRAINT `tournaments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_badges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`badge_id` int NOT NULL,
	`earned_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_badges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`challenge_id` int NOT NULL,
	`completed_tasks` json NOT NULL DEFAULT ('[]'),
	`completed_at` timestamp,
	CONSTRAINT `user_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_pet_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`item_id` int NOT NULL,
	`acquired_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_pet_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`avatar_url` varchar(500),
	`invite_code_used` varchar(64),
	`invite_code` varchar(64),
	`coach_personality` enum('drill_sergeant','friendly','roaster','anime_sensei','bro') NOT NULL DEFAULT 'friendly',
	`view_mode` enum('simple','technical') NOT NULL DEFAULT 'simple',
	`theme` varchar(32) NOT NULL DEFAULT 'midnight',
	`is_admin` boolean NOT NULL DEFAULT false,
	`height_cm` int,
	`goal_weight_kg` int,
	`goal_date` timestamp,
	`auto_share_food_logs` boolean NOT NULL DEFAULT false,
	`auto_share_badges` boolean NOT NULL DEFAULT true,
	`auto_share_weight_milestones` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_invite_code_unique` UNIQUE(`invite_code`)
);
--> statement-breakpoint
CREATE TABLE `weekly_inspirations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`week_start` timestamp NOT NULL,
	`message` text NOT NULL,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weekly_inspirations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weight_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`weight_kg` int NOT NULL,
	`source` enum('manual','apple_health','fitbit','garmin') NOT NULL DEFAULT 'manual',
	`note` text,
	`recorded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weight_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `daily_checkins` ADD CONSTRAINT `daily_checkins_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `food_logs` ADD CONSTRAINT `food_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invites` ADD CONSTRAINT `invites_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invites` ADD CONSTRAINT `invites_used_by_user_id_users_id_fk` FOREIGN KEY (`used_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pet_companions` ADD CONSTRAINT `pet_companions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reactions` ADD CONSTRAINT `reactions_post_id_social_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reactions` ADD CONSTRAINT `reactions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_posts` ADD CONSTRAINT `social_posts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tournament_participants` ADD CONSTRAINT `tournament_participants_tournament_id_tournaments_id_fk` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tournament_participants` ADD CONSTRAINT `tournament_participants_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tournaments` ADD CONSTRAINT `tournaments_creator_id_users_id_fk` FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_badges` ADD CONSTRAINT `user_badges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_badges` ADD CONSTRAINT `user_badges_badge_id_badges_id_fk` FOREIGN KEY (`badge_id`) REFERENCES `badges`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_challenges` ADD CONSTRAINT `user_challenges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_challenges` ADD CONSTRAINT `user_challenges_challenge_id_challenges_id_fk` FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_pet_items` ADD CONSTRAINT `user_pet_items_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_pet_items` ADD CONSTRAINT `user_pet_items_item_id_pet_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `pet_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weekly_inspirations` ADD CONSTRAINT `weekly_inspirations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weight_entries` ADD CONSTRAINT `weight_entries_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;