import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const students = sqliteTable('portal_students', {
  id: text('id').primaryKey(), teacherId: text('teacher_id').notNull(), username: text('username').notNull().unique(),
  displayCode: text('display_code').notNull(), groupCode: text('group_code').notNull().default(''),
  passwordHash: text('password_hash').notNull(), mustChange: integer('must_change').notNull().default(1), active: integer('active').notNull().default(1),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
}, t => [index('students_teacher_idx').on(t.teacherId)]);
export const sessions = sqliteTable('portal_sessions', {
  tokenHash: text('token_hash').primaryKey(), studentId: text('student_id').notNull().references(() => students.id, {onDelete: 'cascade'}), expiresAt: integer('expires_at').notNull()
}, t => [index('sessions_student_idx').on(t.studentId)]);
export const assignments = sqliteTable('portal_assignments', {
  id: text('id').primaryKey(), teacherId: text('teacher_id').notNull(), taskId: text('task_id').notNull(), title: text('title').notNull(), instruction: text('instruction').notNull().default(''),
  mode: text('mode').notNull().default('learn'), active: integer('active').notNull().default(1), createdAt: text('created_at').notNull()
}, t => [index('assignments_teacher_idx').on(t.teacherId)]);
export const submissions = sqliteTable('portal_submissions', {
  id: text('id').primaryKey(), teacherId: text('teacher_id').notNull(), studentId: text('student_id').notNull().references(() => students.id), assignmentId: text('assignment_id').notNull().references(() => assignments.id),
  attemptId: text('attempt_id').notNull(), taskId: text('task_id').notNull(), simulatorScore: integer('simulator_score').notNull(), completed: integer('completed').notNull(),
  teacherScore: integer('teacher_score'), feedback: text('feedback').notNull().default(''), status: text('status').notNull().default('submitted'),
  snapshotJson: text('snapshot_json').notNull(), reportJson: text('report_json').notNull(), metricsJson: text('metrics_json').notNull(), checkJson: text('check_json').notNull(),
  submittedAt: text('submitted_at').notNull(), reviewedAt: text('reviewed_at')
}, t => [uniqueIndex('submission_attempt_unique').on(t.studentId, t.assignmentId, t.attemptId), index('submissions_teacher_idx').on(t.teacherId, t.submittedAt), index('submissions_student_idx').on(t.studentId)]);
export const loginLimits = sqliteTable('portal_login_limits', { key: text('key').primaryKey(), failures: integer('failures').notNull(), windowStart: integer('window_start').notNull() });
export const teachers = sqliteTable('portal_teachers', {
  id: text('id').primaryKey(), username: text('username').notNull().unique(), passwordHash: text('password_hash').notNull(),
  active: integer('active').notNull().default(1), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
});
export const teacherSessions = sqliteTable('portal_teacher_sessions', {
  tokenHash: text('token_hash').primaryKey(), teacherId: text('teacher_id').notNull().references(() => teachers.id,{onDelete:'cascade'}), expiresAt: integer('expires_at').notNull()
}, t => [index('teacher_sessions_owner_idx').on(t.teacherId)]);
export const loginNames = sqliteTable('portal_login_names', {
  username: text('username').primaryKey(), role: text('role').notNull(), ownerId: text('owner_id').notNull()
});
