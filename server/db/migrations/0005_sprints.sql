CREATE TABLE `sprints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`week_start` timestamp NOT NULL,
	`title` varchar(255) NOT NULL,
	`tasks` json NOT NULL,
	`completed_tasks` json NOT NULL DEFAULT ('[]'),
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sprints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sprints` ADD CONSTRAINT `sprints_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
