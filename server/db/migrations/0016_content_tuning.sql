CREATE TABLE `content_tuning_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`content_type` varchar(64) NOT NULL,
	`subcategory` varchar(64) NOT NULL,
	`context_params` json NOT NULL,
	`generated_sample` text NOT NULL,
	`tags` json NOT NULL,
	`note` text,
	`note_scope` enum('sample','global') NOT NULL DEFAULT 'sample',
	`tuning_doc_before` text NOT NULL,
	`tuning_doc_after` text NOT NULL,
	`changelog` text,
	`created_by` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_tuning_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `content_tuning_feedback` ADD CONSTRAINT `content_tuning_feedback_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
