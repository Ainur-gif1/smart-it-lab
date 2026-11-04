CREATE TABLE `portal_login_names` (
	`username` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`owner_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portal_teacher_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `portal_teachers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teacher_sessions_owner_idx` ON `portal_teacher_sessions` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `portal_teachers` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_teachers_username_unique` ON `portal_teachers` (`username`);