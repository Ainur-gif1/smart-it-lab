CREATE TABLE `portal_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`instruction` text DEFAULT '' NOT NULL,
	`mode` text DEFAULT 'learn' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assignments_teacher_idx` ON `portal_assignments` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `portal_login_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portal_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `portal_students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_student_idx` ON `portal_sessions` (`student_id`);--> statement-breakpoint
CREATE TABLE `portal_students` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`username` text NOT NULL,
	`display_code` text NOT NULL,
	`group_code` text DEFAULT '' NOT NULL,
	`password_hash` text NOT NULL,
	`must_change` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_students_username_unique` ON `portal_students` (`username`);--> statement-breakpoint
CREATE INDEX `students_teacher_idx` ON `portal_students` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `portal_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`student_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`task_id` text NOT NULL,
	`simulator_score` integer NOT NULL,
	`completed` integer NOT NULL,
	`teacher_score` integer,
	`feedback` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`snapshot_json` text NOT NULL,
	`report_json` text NOT NULL,
	`metrics_json` text NOT NULL,
	`check_json` text NOT NULL,
	`submitted_at` text NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`student_id`) REFERENCES `portal_students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `portal_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_attempt_unique` ON `portal_submissions` (`student_id`,`assignment_id`,`attempt_id`);--> statement-breakpoint
CREATE INDEX `submissions_teacher_idx` ON `portal_submissions` (`teacher_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `submissions_student_idx` ON `portal_submissions` (`student_id`);