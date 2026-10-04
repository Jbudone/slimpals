ALTER TABLE `user_gyms` ADD `campaign` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `user_gyms` ADD `archived_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `user_gyms` ADD `archive_summary` json;
--> statement-breakpoint
ALTER TABLE `user_gyms` ADD CONSTRAINT `user_gyms_user_campaign_uq` UNIQUE(`user_id`,`campaign`);
--> statement-breakpoint
ALTER TABLE `user_gyms` DROP INDEX `user_gyms_user_id_unique`;
