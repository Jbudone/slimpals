ALTER TABLE `tournaments` ADD `winner_id` varchar(36);--> statement-breakpoint
ALTER TABLE `tournaments` ADD `victory_message` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `resolved_at` timestamp;--> statement-breakpoint
ALTER TABLE `tournaments` ADD CONSTRAINT `tournaments_winner_id_users_id_fk` FOREIGN KEY (`winner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;