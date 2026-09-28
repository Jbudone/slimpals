ALTER TABLE `user_gyms` ADD `sweat` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `user_gyms` ADD `greens` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `user_gyms` ADD `desk_collected_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `user_gyms` ADD `kitchen_collected_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `user_gyms` ADD `kitchen_menu` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `user_gyms` ADD `kitchen_rush_ends_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `user_gyms` ADD `last_open_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `gym_pieces` ADD `collected_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `missions` ADD `kind` varchar(16) NOT NULL DEFAULT 'other';
--> statement-breakpoint
UPDATE `missions` SET `kind` = 'exercise' WHERE LOWER(`title`) REGEXP '(^|[^a-z])(workout|work out|run|jog|walk|step|gym|lift|squat|push|pull|plank|yoga|pilates|swim|bike|cycl|cardio|hike|stretch|train|exercis|sport|danc|rowing|box|hiit|strength|sweat)';
--> statement-breakpoint
UPDATE `missions` SET `kind` = 'diet' WHERE `kind` = 'other' AND LOWER(`title`) REGEXP '(^|[^a-z])(meal|eat|food|water|drink|calor|kcal|protein|veg|fruit|salad|sugar|snack|breakfast|lunch|dinner|cook|diet|weigh|soda|alcohol|fast|fiber|fibre|smoothie|juice)';
--> statement-breakpoint
UPDATE `user_gyms` SET `sweat` = 3, `greens` = 2 WHERE `starter_coins_at` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `gym_rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`source` varchar(64) NOT NULL,
	`sweat` int NOT NULL DEFAULT 0,
	`greens` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gym_rewards_id` PRIMARY KEY(`id`),
	CONSTRAINT `gym_rewards_gym_source_uq` UNIQUE(`gym_id`,`source`)
);
--> statement-breakpoint
ALTER TABLE `gym_rewards` ADD CONSTRAINT `gym_rewards_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
