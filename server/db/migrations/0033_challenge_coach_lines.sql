CREATE TABLE `challenge_coach_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_challenge_id` int NOT NULL,
	`day` int NOT NULL,
	`line` text NOT NULL,
	CONSTRAINT `challenge_coach_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `challenge_coach_lines_uc_day` UNIQUE(`user_challenge_id`,`day`)
);
--> statement-breakpoint
ALTER TABLE `challenge_coach_lines` ADD CONSTRAINT `challenge_coach_lines_uc_fk` FOREIGN KEY (`user_challenge_id`) REFERENCES `user_challenges`(`id`) ON DELETE cascade ON UPDATE no action;
