import { and, asc, eq, like, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { students } from "../../../db/schema";

const statuses = ["Active", "On leave", "Graduated"] as const;

function clean(payload: Record<string, unknown>) {
  return {
    studentId: String(payload.studentId ?? "").trim().toUpperCase(),
    fullName: String(payload.fullName ?? "").trim(),
    email: String(payload.email ?? "").trim().toLowerCase(),
    phone: String(payload.phone ?? "").trim(),
    course: String(payload.course ?? "").trim(),
    year: Number(payload.year),
    gpa: Number(payload.gpa),
    status: String(payload.status ?? "Active") as (typeof statuses)[number],
    joinedDate: String(payload.joinedDate ?? "").trim(),
  };
}

function validate(value: ReturnType<typeof clean>) {
  if (!/^STU-\d{4}-\d{3,}$/.test(value.studentId)) return "Student ID must look like STU-2026-001.";
  if (value.fullName.length < 2) return "Full name is required.";
  if (!/^\S+@\S+\.\S+$/.test(value.email)) return "Enter a valid email address.";
  if (!value.course) return "Course is required.";
  if (!Number.isInteger(value.year) || value.year < 1 || value.year > 6) return "Year must be between 1 and 6.";
  if (!Number.isFinite(value.gpa) || value.gpa < 0 || value.gpa > 4) return "GPA must be between 0 and 4.";
  if (!statuses.includes(value.status)) return "Choose a valid status.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.joinedDate)) return "Joined date is required.";
  return null;
}

function message(error: unknown) {
  const text = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}` : "Unexpected error";
  if (text.includes("UNIQUE constraint failed: students.student_id")) return "That student ID already exists.";
  if (text.includes("UNIQUE constraint failed: students.email")) return "That email address already exists.";
  if (text.includes("no such table")) return "The database is being prepared. Please try again shortly.";
  return "We couldn't complete that request. Please try again.";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "All";
    const filters = [];
    if (query) {
      const term = `%${query}%`;
      filters.push(or(like(students.fullName, term), like(students.studentId, term), like(students.email, term), like(students.course, term))!);
    }
    if (status !== "All" && statuses.includes(status as (typeof statuses)[number])) filters.push(eq(students.status, status as (typeof statuses)[number]));
    const rows = await getDb().select().from(students).where(filters.length ? and(...filters) : undefined).orderBy(asc(students.fullName));
    return Response.json({ students: rows });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const value = clean((await request.json()) as Record<string, unknown>);
    const error = validate(value);
    if (error) return Response.json({ error }, { status: 400 });
    const [student] = await getDb().insert(students).values(value).returning();
    return Response.json({ student }, { status: 201 });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 409 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id)) return Response.json({ error: "Invalid student record." }, { status: 400 });
    const value = clean(body);
    const error = validate(value);
    if (error) return Response.json({ error }, { status: 400 });
    const [student] = await getDb().update(students).set({ ...value, updatedAt: new Date().toISOString() }).where(eq(students.id, id)).returning();
    if (!student) return Response.json({ error: "Student not found." }, { status: 404 });
    return Response.json({ student });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "Invalid student record." }, { status: 400 });
    const [student] = await getDb().delete(students).where(eq(students.id, id)).returning();
    if (!student) return Response.json({ error: "Student not found." }, { status: 404 });
    return Response.json({ student });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}
