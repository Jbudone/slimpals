CREATE TABLE `mission_completions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mission_id` int NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`period_start` timestamp NOT NULL,
	`completed_at` timestamp NOT NULL DEFAULT (now()),
	`xp_awarded` int NOT NULL,
	CONSTRAINT `mission_completions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `mission_completions` ADD CONSTRAINT `mission_completions_mission_id_missions_id_fk` FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `mission_completions` ADD CONSTRAINT `mission_completions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
