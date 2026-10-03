CREATE TABLE `gym_cosmetics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`cosmetic_key` varchar(64) NOT NULL,
	`source` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gym_cosmetics_id` PRIMARY KEY(`id`),
	CONSTRAINT `gym_cosmetics_gym_key_uq` UNIQUE(`gym_id`,`cosmetic_key`)
);
--> statement-breakpoint
ALTER TABLE `gym_cosmetics` ADD CONSTRAINT `gym_cosmetics_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
