ALTER TABLE `content_items` ADD `judge_score` int;
--> statement-breakpoint
ALTER TABLE `content_items` ADD `judge_model` varchar(80);
--> statement-breakpoint
ALTER TABLE `content_items` ADD `judge_note` varchar(300);
--> statement-breakpoint
ALTER TABLE `content_items` ADD `review_state` varchar(8);
--> statement-breakpoint
CREATE TABLE `content_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`verdict` varchar(8) NOT NULL,
	`tags` json NOT NULL,
	`note` varchar(300),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_reviews_item_user_uq` UNIQUE(`item_id`,`user_id`)
);
