CREATE TABLE `gym_classes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(64) NOT NULL,
	`required_xp` int NOT NULL DEFAULT 0,
	`days_of_week` json NOT NULL,
	`start_hour` int NOT NULL,
	`end_hour` int NOT NULL,
	`capacity_boost` int NOT NULL DEFAULT 2,
	CONSTRAINT `gym_classes_id` PRIMARY KEY(`id`),
	CONSTRAINT `gym_classes_key_unique` UNIQUE(`key`)
);
