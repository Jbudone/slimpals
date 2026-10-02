CREATE TABLE `scheduled_job_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`job` varchar(64) NOT NULL,
	`period` varchar(32) NOT NULL,
	`status` enum('running','ok','failed') NOT NULL,
	`attempts` int NOT NULL DEFAULT 1,
	`trigger` enum('schedule','manual') NOT NULL DEFAULT 'schedule',
	`started_at` timestamp NOT NULL,
	`finished_at` timestamp NULL,
	`result` json,
	`error` text,
	CONSTRAINT `scheduled_job_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduled_job_runs_job_period_uq` UNIQUE(`job`,`period`)
);
