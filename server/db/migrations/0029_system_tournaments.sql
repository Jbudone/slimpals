ALTER TABLE `tournaments` MODIFY COLUMN `creator_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `tournaments` ADD `system_key` varchar(32);
--> statement-breakpoint
ALTER TABLE `tournaments` ADD CONSTRAINT `tournaments_system_key_uq` UNIQUE(`system_key`);
