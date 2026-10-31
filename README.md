<div align="center">

# Classly

### A clear, responsive workspace for student records.

Student administration MVP built with React, TypeScript, and Cloudflare D1.

<a href="screenshots/task-2-classly/README.md">Explore all 20 feature screenshots</a>

</div>

![Classly student administration dashboard](screenshots/task-2-classly/01-overview.png)

## What it does

Classly brings everyday student-record tasks into one dashboard: browse a directory, find records, review academic status, and manage student details. The interface adapts to desktop and mobile layouts, with feedback for loading, empty, validation, and confirmation states.

### Highlights

- Create, edit, and delete student records
- Search by student name, student ID, email, or course
- Filter the directory by Active, On leave, or Graduated status
- Review student, active-enrolment, course, and GPA summary cards
- Validate required fields and prevent duplicate student IDs and email addresses
- Use responsive layouts, a scrollable mobile directory, and delete confirmation

## Built with

| Area | Technology |
| --- | --- |
| UI | React 19, TypeScript, Tailwind CSS 4 |
| App framework | Vinext with a Next-compatible App Router |
| Runtime | Cloudflare Workers |
| Data | Cloudflare D1, SQLite, Drizzle ORM |
| API | App Router route handlers |

## Run locally

**Prerequisites:** Node.js 22.13 or newer and npm.

Install the locked dependencies and build the Worker application:

```bash
npm ci
npm run build
```

Apply the checked-in D1 migration to a fresh local database:

```bash
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cool_aaron_stack.sql
```

Start the local app:

```bash
npm start
```

Wrangler serves the application locally and keeps its D1 state under `.wrangler/state/`. The directory starts empty; the fictional records shown in the screenshots are not seeded into the app. To regenerate migrations after changing the Drizzle schema, run `npm run db:generate` and apply the new migration locally.

## Student record and API

A student record stores a unique student ID and email, name, phone, course, academic year, GPA, enrolment status, and joined date. The API is available at `/api/students`:

| Method | Behavior |
| --- | --- |
| `GET` | List records; optional `q` searches name, ID, email, and course; optional `status` filters by status |
| `POST` | Create a validated student record |
| `PUT` | Update a record by numeric `id` |
| `DELETE` | Delete a record by numeric `id` query parameter |

The summary cards are calculated from the records currently returned by the directory, so search and status filters affect the displayed metrics.

## Screenshots

The [feature screenshot index](screenshots/task-2-classly/README.md) includes the overview and examples of search, status filters, create/edit/delete flows, validation feedback, and responsive layouts.

## Scope and privacy

This is an internship MVP, not a production-ready student information system. The API does not include authentication or authorization, and the course navigation item is a visual placeholder rather than a course-management feature. Add appropriate access controls, deployment configuration, and privacy safeguards before handling real student information.

Screenshots use fictional names and reserved `example.test` email addresses. No screenshot demo database, local Wrangler state, environment files, credentials, or hosting-project configuration is included in this repository.
