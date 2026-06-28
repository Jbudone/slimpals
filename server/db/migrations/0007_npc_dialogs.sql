CREATE TABLE `gym_npc_dialog_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`npc_key` varchar(128) NOT NULL,
	`relationship_stage` int NOT NULL DEFAULT 0,
	`dialogs` json NOT NULL,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	CONSTRAINT `gym_npc_dialog_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `gym_npc_dialog_batches` ADD CONSTRAINT `gym_npc_dialog_batches_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
