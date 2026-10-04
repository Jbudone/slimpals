CREATE TABLE `reward_track_overrides` (
	`month_key` varchar(7) NOT NULL,
	`override` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reward_track_overrides_month_key` PRIMARY KEY(`month_key`)
);
