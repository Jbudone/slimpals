CREATE TABLE `content_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(32) NOT NULL,
	`situation` varchar(48) NOT NULL,
	`payload` json NOT NULL,
	`status` enum('candidate','approved','published','retired','rejected') NOT NULL DEFAULT 'published',
	`source` varchar(16) NOT NULL DEFAULT 'ai',
	`model` varchar(80),
	`cost_micros` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`published_at` timestamp NULL,
	`shown_count` int NOT NULL DEFAULT 0,
	`first_seen_at` timestamp NULL,
	`last_seen_at` timestamp NULL,
	CONSTRAINT `content_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `content_items_type_status_idx` ON `content_items` (`type`,`status`,`situation`);
--> statement-breakpoint
CREATE TABLE `content_seen` (
	`item_id` int NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_seen_item_id_user_id_pk` PRIMARY KEY(`item_id`,`user_id`)
);
--> statement-breakpoint
INSERT INTO `content_items` (`type`, `situation`, `payload`, `status`, `source`, `created_at`, `published_at`)
SELECT 'banter', `situation`, JSON_OBJECT('lines', `lines`), 'published', 'ai', `created_at`, `created_at` FROM `banter_pool`;
