CREATE TABLE `gym_staff` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`npc_key` varchar(128) NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gym_staff_id` PRIMARY KEY(`id`),
	CONSTRAINT `gym_staff_gym_npc_uq` UNIQUE(`gym_id`,`npc_key`)
);
--> statement-breakpoint
ALTER TABLE `gym_staff` ADD CONSTRAINT `gym_staff_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
