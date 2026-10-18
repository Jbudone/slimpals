CREATE TABLE `content_bakeoff_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`round` varchar(40) NOT NULL,
	`situation` varchar(40) NOT NULL,
	`model` varchar(120) NOT NULL,
	`lines` json NOT NULL,
	`cost_micros` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_bakeoff_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `content_bakeoff_entries_round_idx` ON `content_bakeoff_entries` (`round`);
--> statement-breakpoint
CREATE TABLE `content_bakeoff_votes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`round` varchar(40) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`entry_a` int NOT NULL,
	`entry_b` int NOT NULL,
	`winner` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_bakeoff_votes_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_bakeoff_votes_pair_uq` UNIQUE(`user_id`,`entry_a`,`entry_b`)
);
