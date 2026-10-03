CREATE TABLE `gym_open_walls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`px` int NOT NULL,
	`pz` int NOT NULL,
	`axis` varchar(1) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gym_open_walls_id` PRIMARY KEY(`id`),
	CONSTRAINT `gym_open_walls_uq` UNIQUE(`gym_id`,`px`,`pz`,`axis`)
);
--> statement-breakpoint
ALTER TABLE `gym_open_walls` ADD CONSTRAINT `gym_open_walls_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
