ALTER TABLE `user_gyms` ADD `coins` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `user_gyms` ADD `plots_bought` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `user_gyms` ADD `starter_coins_at` timestamp NULL;
--> statement-breakpoint
CREATE TABLE `gym_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`kind` varchar(16) NOT NULL,
	`room_id` int,
	`piece_id` int,
	`target_tier` int,
	`cost` int NOT NULL DEFAULT 0,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`ends_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` timestamp NULL,
	CONSTRAINT `gym_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `gym_jobs_gym_status_idx` ON `gym_jobs` (`gym_id`,`status`);
--> statement-breakpoint
ALTER TABLE `gym_jobs` ADD CONSTRAINT `gym_jobs_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `gym_jobs` ADD CONSTRAINT `gym_jobs_room_id_gym_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `gym_rooms`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `gym_jobs` ADD CONSTRAINT `gym_jobs_piece_id_gym_pieces_id_fk` FOREIGN KEY (`piece_id`) REFERENCES `gym_pieces`(`id`) ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
CREATE TABLE `gym_activity_cuts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`source` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gym_activity_cuts_id` PRIMARY KEY(`id`),
	CONSTRAINT `gym_activity_cuts_gym_source_uq` UNIQUE(`gym_id`,`source`)
);
--> statement-breakpoint
ALTER TABLE `gym_activity_cuts` ADD CONSTRAINT `gym_activity_cuts_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;