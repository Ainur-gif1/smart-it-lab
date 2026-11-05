CREATE TABLE `portal_assignment_finishes` (
	`student_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`submitted_at` text NOT NULL,
	PRIMARY KEY(`student_id`, `assignment_id`),
	FOREIGN KEY (`student_id`) REFERENCES `portal_students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `portal_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_assignment_finishes_submission_id_unique` ON `portal_assignment_finishes` (`submission_id`);