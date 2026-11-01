"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, GraduationCap, LayoutDashboard, LogOut, MoreHorizontal, Pencil, Plus, Search, Trash2, UserRoundCheck, Users, X } from "lucide-react";

type Status = "Active" | "On leave" | "Graduated";
type Student = { id: number; studentId: string; fullName: string; email: string; phone: string; course: string; year: number; gpa: number; status: Status; joinedDate: string; createdAt: string; updatedAt: string };
type StudentForm = Omit<Student, "id" | "createdAt" | "updatedAt">;

const emptyForm: StudentForm = { studentId: "", fullName: "", email: "", phone: "", course: "", year: 1, gpa: 0, status: "Active", joinedDate: new Date().toISOString().slice(0, 10) };
const courses = ["Computer Science", "Software Engineering", "Data Science", "Information Technology", "Cybersecurity", "Business Analytics"];
const statusStyles: Record<Status, string> = { Active: "bg-emerald-50 text-emerald-700 ring-emerald-600/15", "On leave": "bg-amber-50 text-amber-700 ring-amber-600/15", Graduated: "bg-violet-50 text-violet-700 ring-violet-600/15" };

function initials(name: string) { return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }

export default function Home() {
  const [authStatus, setAuthStatus] = useState<"checking" | "signed-out" | "signed-in" | "unavailable">("checking");
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (status !== "All") params.set("status", status);
      const response = await fetch(`/api/students?${params}`, { cache: "no-store", credentials: "same-origin" });
      const data = await response.json() as { students?: Student[]; error?: string };
      if (response.status === 401) {
        setStudents([]);
        setAuthMessage("Your session expired. Sign in again to continue.");
        setAuthStatus("signed-out");
        return;
      }
      if (!response.ok) throw new Error(data.error);
      setStudents(data.students ?? []);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load students."); }
    finally { setLoading(false); }
  }, [query, status]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const data = await response.json() as { authenticated?: boolean; email?: string; error?: string };
        if (!active) return;
        if (response.status === 503) {
          setAuthMessage("Administrator sign-in is unavailable. Configure the required Worker secrets before using Classly.");
          setAuthStatus("unavailable");
        } else if (response.ok && data.authenticated && data.email) {
          setAuthEmail(data.email);
          setAuthStatus("signed-in");
        } else {
          setAuthStatus("signed-out");
        }
      })
      .catch(() => {
        if (active) {
          setAuthMessage("Unable to check your sign-in. Please refresh the page.");
          setAuthStatus("unavailable");
        }
      });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (authStatus !== "signed-in") return;
    const timer = setTimeout(load, 220);
    return () => clearTimeout(timer);
  }, [authStatus, load]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2800); return () => clearTimeout(timer); }, [toast]);

  const metrics = useMemo(() => ({ total: students.length, active: students.filter((s) => s.status === "Active").length, courses: new Set(students.map((s) => s.course)).size, average: students.length ? (students.reduce((sum, s) => sum + s.gpa, 0) / students.length).toFixed(2) : "0.00" }), [students]);

  function openCreate() { setEditing(null); setForm({ ...emptyForm, studentId: `STU-${new Date().getFullYear()}-${String(Math.max(1, students.length + 1)).padStart(3, "0")}` }); setError(""); setModalOpen(true); }
  function openEdit(student: Student) { setEditing(student); setForm({ studentId: student.studentId, fullName: student.fullName, email: student.email, phone: student.phone, course: student.course, year: student.year, gpa: student.gpa, status: student.status, joinedDate: student.joinedDate }); setError(""); setMenu(null); setModalOpen(true); }
  function closeModal() { if (!saving) { setModalOpen(false); setEditing(null); setError(""); } }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await response.json() as { email?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to sign in.");
      setAuthEmail(data.email ?? loginEmail);
      setLoginPassword("");
      setAuthStatus("signed-in");
    } catch (err) {
      setAuthMessage(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Unable to sign out. Please try again.");
      setStudents([]);
      setAuthEmail("");
      setLoginPassword("");
      setAuthMessage("");
      setAuthStatus("signed-out");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign out.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/students", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { id: editing.id, ...form } : form) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error);
      setModalOpen(false); setEditing(null); setToast(editing ? "Student record updated" : "Student added successfully"); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save student."); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!deleteTarget) return;
    try {
      const response = await fetch(`/api/students?id=${deleteTarget.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error);
      setDeleteTarget(null); setToast("Student record deleted"); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to delete student."); setDeleteTarget(null); }
  }

  if (authStatus !== "signed-in") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7fb] px-5 py-10 text-slate-900">
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="mb-7 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white"><GraduationCap size={24}/></div>
            <div><p className="text-xl font-bold">Classly</p><p className="text-xs text-slate-500">Administrator sign-in</p></div>
          </div>
          {authStatus === "checking" ? <p role="status" className="text-sm text-slate-500">Checking your sign-in…</p> : authStatus === "unavailable" ? (
            <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">{authMessage || "Administrator sign-in is not configured for this deployment."}</div>
          ) : (
            <form onSubmit={signIn} className="space-y-5">
              <p className="text-sm text-slate-600">Sign in with the administrator account configured for this deployment.</p>
              <Field label="Administrator email"><input required type="email" autoComplete="username" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></Field>
              <Field label="Password"><input required type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></Field>
              {authMessage && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{authMessage}</p>}
              <button disabled={authBusy} className="h-11 w-full rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{authBusy ? "Signing in…" : "Sign in"}</button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-slate-200/80 bg-[#111827] px-4 py-6 text-white lg:flex">
        <div className="flex items-center gap-3 px-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500"><GraduationCap size={23}/></div><div><div className="text-lg font-bold tracking-tight">Classly</div><div className="text-[11px] text-slate-400">STUDENT OPERATIONS</div></div></div>
        <nav className="mt-10 space-y-1.5"><a className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-3 text-sm font-medium text-white" href="#"><LayoutDashboard size={19}/>Overview</a><a className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400" href="#students"><Users size={19}/>Students</a><span className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500"><BookOpen size={19}/>Courses</span></nav>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-sm font-semibold">Academic year</p><p className="mt-1 text-xs text-slate-400">2026 / 2027</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[62%] rounded-full bg-indigo-400"/></div><p className="mt-2 text-[11px] text-slate-500">Semester progress · 62%</p></div>
      </aside>

      <section className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur md:px-8"><div className="flex items-center gap-3 lg:hidden"><div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white"><GraduationCap size={21}/></div><span className="font-bold">Classly</span></div><div className="hidden text-sm text-slate-500 lg:block">Student records / <span className="font-medium text-slate-900">Overview</span></div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{authEmail}</p><p className="text-xs text-slate-500">Administrator</p></div><div className="grid h-10 w-10 place-items-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{initials(authEmail)}</div><button onClick={signOut} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><LogOut size={18}/></button></div></header>

        <div className="mx-auto max-w-[1440px] px-5 py-8 md:px-8 md:py-10">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Student administration</p><h1 className="text-3xl font-bold tracking-[-0.03em] md:text-4xl">Good morning, Admin</h1><p className="mt-2 text-sm text-slate-500">Here’s what’s happening across your student community.</p></div><button onClick={openCreate} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(79,70,229,.22)] transition hover:bg-indigo-700"><Plus size={18}/>Add student</button></div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
            { label: "Total students", value: metrics.total, note: "All registered records", icon: Users, tone: "bg-indigo-50 text-indigo-600" },
            { label: "Active students", value: metrics.active, note: "Currently enrolled", icon: UserRoundCheck, tone: "bg-emerald-50 text-emerald-600" },
            { label: "Courses", value: metrics.courses, note: "Unique programmes", icon: BookOpen, tone: "bg-amber-50 text-amber-600" },
            { label: "Average GPA", value: metrics.average, note: "Across visible records", icon: GraduationCap, tone: "bg-violet-50 text-violet-600" },
          ].map((item) => <article key={item.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.03)]"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{item.label}</p><p className="mt-2 text-3xl font-bold tracking-tight">{item.value}</p></div><div className={`grid h-11 w-11 place-items-center rounded-xl ${item.tone}`}><item.icon size={21}/></div></div><p className="mt-4 text-xs text-slate-400">{item.note}</p></article>)}</div>

          <section id="students" className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,.04)]">
            <div className="flex flex-col gap-4 border-b border-slate-200/80 p-5 md:flex-row md:items-center md:justify-between"><div><h2 className="text-lg font-bold">Student directory</h2><p className="mt-1 text-xs text-slate-500">Manage student details and academic status.</p></div><div className="flex flex-col gap-3 sm:flex-row"><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search students..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none ring-indigo-500 transition focus:bg-white focus:ring-2 sm:w-64"/></label><label className="relative"><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-sm outline-none ring-indigo-500 focus:ring-2 sm:w-36"><option>All</option><option>Active</option><option>On leave</option><option>Graduated</option></select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"/></label></div></div>
            {error && !modalOpen && <div className="mx-5 mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            <div className="overflow-x-auto"><table className="w-full min-w-[860px] border-collapse text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wider text-slate-400"><th className="px-5 py-3.5">Student</th><th className="px-5 py-3.5">Student ID</th><th className="px-5 py-3.5">Course</th><th className="px-5 py-3.5">Year</th><th className="px-5 py-3.5">GPA</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5"><span className="sr-only">Actions</span></th></tr></thead><tbody>
              {loading ? Array.from({length:4}).map((_, i) => <tr key={i} className="border-b border-slate-100"><td colSpan={7} className="px-5 py-4"><div className="h-11 animate-pulse rounded-xl bg-slate-100"/></td></tr>) : students.length === 0 ? <tr><td colSpan={7} className="px-5 py-16 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><Users size={26}/></div><h3 className="mt-4 font-bold">No students found</h3><p className="mt-1 text-sm text-slate-500">Add your first student or adjust the active filters.</p><button onClick={openCreate} className="mt-5 text-sm font-semibold text-indigo-600">Add a student →</button></td></tr> : students.map((student, index) => <tr key={student.id} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/60"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className={`grid h-10 w-10 place-items-center rounded-full text-xs font-bold ${["bg-indigo-100 text-indigo-700","bg-amber-100 text-amber-700","bg-emerald-100 text-emerald-700","bg-rose-100 text-rose-700"][index%4]}`}>{initials(student.fullName)}</div><div><p className="text-sm font-semibold">{student.fullName}</p><p className="mt-0.5 text-xs text-slate-500">{student.email}</p></div></div></td><td className="px-5 py-4 font-mono text-xs font-medium text-slate-600">{student.studentId}</td><td className="px-5 py-4 text-sm text-slate-600">{student.course}</td><td className="px-5 py-4 text-sm text-slate-600">Year {student.year}</td><td className="px-5 py-4 text-sm font-semibold">{student.gpa.toFixed(2)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[student.status]}`}>{student.status}</span></td><td className="relative px-5 py-4 text-right"><button onClick={() => setMenu(menu === student.id ? null : student.id)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MoreHorizontal size={18}/></button>{menu === student.id && <div className="absolute right-8 top-12 z-10 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl"><button onClick={() => openEdit(student)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"><Pencil size={15}/>Edit</button><button onClick={() => {setDeleteTarget(student);setMenu(null)}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"><Trash2 size={15}/>Delete</button></div>}</td></tr>)}
            </tbody></table></div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-xs text-slate-500"><span>Showing {students.length} student{students.length === 1 ? "" : "s"}</span><span>Updated live</span></div>
          </section>
        </div>
      </section>

      {modalOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.currentTarget === e.target) closeModal(); }}><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="text-xl font-bold">{editing ? "Edit student" : "Add a new student"}</h2><p className="mt-1 text-sm text-slate-500">Enter the student’s academic and contact information.</p></div><button onClick={closeModal} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20}/></button></div><form onSubmit={submit} className="p-6"><div className="grid gap-5 sm:grid-cols-2"><Field label="Student ID"><input required value={form.studentId} onChange={(e)=>setForm({...form,studentId:e.target.value})} placeholder="STU-2026-001"/></Field><Field label="Full name"><input required value={form.fullName} onChange={(e)=>setForm({...form,fullName:e.target.value})} placeholder="Ayesha Khan"/></Field><Field label="Email address"><input required type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} placeholder="ayesha@example.com"/></Field><Field label="Phone number"><input value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} placeholder="+92 300 1234567"/></Field><Field label="Course"><select required value={form.course} onChange={(e)=>setForm({...form,course:e.target.value})}><option value="">Select course</option>{courses.map((course)=><option key={course}>{course}</option>)}</select></Field><Field label="Academic year"><select value={form.year} onChange={(e)=>setForm({...form,year:Number(e.target.value)})}>{[1,2,3,4,5,6].map((year)=><option key={year} value={year}>Year {year}</option>)}</select></Field><Field label="GPA"><input required type="number" min="0" max="4" step="0.01" value={form.gpa} onChange={(e)=>setForm({...form,gpa:Number(e.target.value)})}/></Field><Field label="Status"><select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value as Status})}><option>Active</option><option>On leave</option><option>Graduated</option></select></Field><Field label="Joined date"><input required type="date" value={form.joinedDate} onChange={(e)=>setForm({...form,joinedDate:e.target.value})}/></Field></div>{error && <div className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}<div className="mt-7 flex justify-end gap-3"><button type="button" onClick={closeModal} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{saving ? "Saving..." : editing ? "Save changes" : "Add student"}</button></div></form></div></div>}
      {deleteTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600"><Trash2 size={22}/></div><h2 className="mt-5 text-xl font-bold">Delete student record?</h2><p className="mt-2 text-sm leading-6 text-slate-500">This will permanently remove <strong className="text-slate-700">{deleteTarget.fullName}</strong> from the directory.</p><div className="mt-6 flex justify-end gap-3"><button onClick={()=>setDeleteTarget(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold">Cancel</button><button onClick={remove} className="h-10 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white">Delete record</button></div></div></div>}
      {toast && <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-2xl"><span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500"><Check size={14}/></span>{toast}</div>}
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold text-slate-600">{label}</span><span className="field-control">{children}</span></label>;
}
