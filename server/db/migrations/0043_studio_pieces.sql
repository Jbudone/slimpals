CREATE TABLE `studio_pieces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(120) NOT NULL,
	`kind` varchar(12) NOT NULL DEFAULT 'other',
	`status` varchar(12) NOT NULL DEFAULT 'idea',
	`premise` varchar(600) NOT NULL DEFAULT '',
	`notes` varchar(2000) NOT NULL DEFAULT '',
	`slot` varchar(10),
	`lines` json NOT NULL,
	`version` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `studio_pieces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `studio_piece_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`piece_id` int NOT NULL,
	`version` int NOT NULL,
	`lines` json NOT NULL,
	`note` varchar(200),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `studio_piece_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `studio_piece_versions_piece_idx` ON `studio_piece_versions` (`piece_id`,`version`);
