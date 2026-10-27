CREATE TABLE `story_drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaign` int NOT NULL,
	`level` varchar(8) NOT NULL,
	`ref` varchar(48) NOT NULL,
	`status` varchar(12) NOT NULL DEFAULT 'draft',
	`body` json NOT NULL,
	`trace` json NOT NULL,
	`notes` varchar(500),
	`cost_micros` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `story_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `story_drafts_ref_idx` ON `story_drafts` (`campaign`,`level`,`ref`);
