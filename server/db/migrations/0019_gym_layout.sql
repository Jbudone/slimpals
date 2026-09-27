ALTER TABLE `user_gyms` ADD `layout_seeded_at` timestamp;
--> statement-breakpoint
CREATE TABLE `gym_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`type` varchar(32) NOT NULL,
	`shape` varchar(16) NOT NULL DEFAULT 'normal',
	`level` int NOT NULL DEFAULT 1,
	`layout_version` int NOT NULL DEFAULT 1,
	`wall_color` varchar(16),
	`floor_style` varchar(16),
	`floor_color` varchar(16),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gym_rooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gym_plots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`px` int NOT NULL,
	`pz` int NOT NULL,
	`state` varchar(16) NOT NULL DEFAULT 'owned',
	`lot_shape` varchar(16) NOT NULL DEFAULT 'normal',
	`room_id` int,
	CONSTRAINT `gym_plots_id` PRIMARY KEY(`id`),
	CONSTRAINT `gym_plots_gym_cell_unique` UNIQUE(`gym_id`,`px`,`pz`)
);
--> statement-breakpoint
CREATE TABLE `gym_pieces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gym_id` int NOT NULL,
	`room_id` int,
	`kind` varchar(16) NOT NULL,
	`item_key` varchar(128) NOT NULL,
	`upgrade_key` varchar(128),
	`spot_index` int,
	`pos_x2` int NOT NULL,
	`pos_z2` int NOT NULL,
	`rot` int NOT NULL DEFAULT 0,
	`tier` int NOT NULL DEFAULT 1,
	`locked` boolean NOT NULL DEFAULT false,
	`status` varchar(16) NOT NULL DEFAULT 'placed',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gym_pieces_id` PRIMARY KEY(`id`),
	CONSTRAINT `gym_pieces_gym_upgrade_unique` UNIQUE(`gym_id`,`upgrade_key`),
	CONSTRAINT `gym_pieces_room_spot_unique` UNIQUE(`room_id`,`spot_index`)
);
--> statement-breakpoint
ALTER TABLE `gym_rooms` ADD CONSTRAINT `gym_rooms_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `gym_plots` ADD CONSTRAINT `gym_plots_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `gym_plots` ADD CONSTRAINT `gym_plots_room_id_gym_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `gym_rooms`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `gym_pieces` ADD CONSTRAINT `gym_pieces_gym_id_user_gyms_id_fk` FOREIGN KEY (`gym_id`) REFERENCES `user_gyms`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `gym_pieces` ADD CONSTRAINT `gym_pieces_room_id_gym_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `gym_rooms`(`id`) ON DELETE no action ON UPDATE no action;
