CREATE TABLE `portal_assignment_drafts` (
	`student_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`attempt_json` text NOT NULL,
	`saved_at` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`student_id`, `assignment_id`),
	FOREIGN KEY (`student_id`) REFERENCES `portal_students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `portal_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `portal_submissions` ADD `submission_kind` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `portal_submissions` ADD `received_at` text;