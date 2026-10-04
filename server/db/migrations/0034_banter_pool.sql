CREATE TABLE `banter_pool` (
	`id` int AUTO_INCREMENT NOT NULL,
	`situation` varchar(32) NOT NULL,
	`lines` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `banter_pool_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `banter_pool_situation_idx` ON `banter_pool` (`situation`);
