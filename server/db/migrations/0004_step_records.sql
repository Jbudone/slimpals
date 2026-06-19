CREATE TABLE `step_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`steps` int NOT NULL,
	`source` enum('apple_health','fitbit','garmin') NOT NULL DEFAULT 'apple_health',
	`recorded_at` timestamp NOT NULL,
	CONSTRAINT `step_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `step_records` ADD CONSTRAINT `step_records_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
