CREATE TABLE `content_config` (
	`key` varchar(64) NOT NULL,
	`value` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `content_config_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `ai_spend` (
	`id` int AUTO_INCREMENT NOT NULL,
	`at` timestamp NOT NULL DEFAULT (now()),
	`day` varchar(10) NOT NULL,
	`provider` varchar(16) NOT NULL,
	`model` varchar(80) NOT NULL,
	`purpose` varchar(48) NOT NULL,
	`tokens_in` int NOT NULL DEFAULT 0,
	`tokens_out` int NOT NULL DEFAULT 0,
	`images` int NOT NULL DEFAULT 0,
	`usd_micros` int NOT NULL DEFAULT 0,
	`ok` boolean NOT NULL DEFAULT true,
	CONSTRAINT `ai_spend_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ai_spend_day_idx` ON `ai_spend` (`day`);
