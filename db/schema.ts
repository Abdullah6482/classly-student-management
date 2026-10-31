import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const students = sqliteTable("students", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentId: text("student_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().default(""),
  course: text("course").notNull(),
  year: integer("year").notNull(),
  gpa: real("gpa").notNull().default(0),
  status: text("status", { enum: ["Active", "On leave", "Graduated"] })
    .notNull()
    .default("Active"),
  joinedDate: text("joined_date").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
