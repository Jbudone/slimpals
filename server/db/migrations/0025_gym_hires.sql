CREATE TABLE `gym_hires` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`room_id` int NOT NULL,
	`role` varchar(32) NOT NULL,
	`name` varchar(64) NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gym_hires_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `gym_hires` ADD CONSTRAINT `gym_hires_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `gym_hires` ADD CONSTRAINT `gym_hires_room_id_gym_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `gym_rooms`(`id`) ON DELETE no action ON UPDATE no action;
