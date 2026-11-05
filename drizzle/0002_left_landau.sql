CREATE TABLE `portal_assignment_runs` (
	`student_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`started_at` text NOT NULL,
	`deadline_at` integer,
	`time_limit_minutes` integer,
	`late_policy` text DEFAULT 'block' NOT NULL,
	PRIMARY KEY(`student_id`, `assignment_id`),
	FOREIGN KEY (`student_id`) REFERENCES `portal_students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `portal_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `portal_assignments` ADD `time_limit_minutes` integer;--> statement-breakpoint
ALTER TABLE `portal_assignments` ADD `late_policy` text DEFAULT 'block' NOT NULL;--> statement-breakpoint
ALTER TABLE `portal_submissions` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `portal_submissions` ADD `deadline_at` integer;--> statement-breakpoint
ALTER TABLE `portal_submissions` ADD `late_by_sec` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `portal_submissions` ADD `server_duration_sec` integer;