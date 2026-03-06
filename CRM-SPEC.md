# CRM Specification — Lead Capture, Admin & Website Config

This document is the blueprint for building a CRM that captures leads from the workshop checkout form, provides admin and sub-admin lead management (assign, track, pipeline), and allows editing offer date/time and prices shown on the marketing site.

---

## 1. Overview and Scope

### Purpose

- **Capture leads** from the existing checkout form and store them in a central database.
- **Manage leads** with a professional CRM: list, filter, search, status pipeline, assignment, notes, and activity tracking.
- **Control website/offer content** from one place: workshop date/time, countdown end, prices, platform, and related copy so the marketing site stays in sync without code deploys.

### Scope

- **In scope**: Backend API, database, authentication (admin/sub-admin), lead management UI, and a “Site config” / “Offer config” section in the admin. The current marketing site (Vite + React) will call the API for form submit and optionally for reading config.
- **Optional**: Keep the marketing site and admin in the same repo (e.g. `/admin` routes) or run the admin as a separate app; the spec works for both.

---

## 2. Lead Capture

### Data Model (Lead)

Each lead record should include:

| Field         | Type     | Description                                      |
|---------------|----------|--------------------------------------------------|
| `id`          | UUID/int | Primary key                                      |
| `name`        | string   | Full name                                        |
| `email`       | string   | Email                                            |
| `phone`       | string   | WhatsApp number                                  |
| `city`        | string   | City (optional from form)                        |
| `source`      | string   | e.g. `"checkout"`                                |
| `status`      | string   | Pipeline status (see Lead Management)            |
| `assigned_to` | FK user  | Optional; which admin/sub-admin owns the lead    |
| `created_at`  | datetime | When the lead was submitted                      |
| `updated_at`  | datetime | Last update                                      |

### Integration with Checkout Form

- **Current behaviour**: The checkout form in `src/pages/Checkout.tsx` collects `name`, `email`, `phone`, `city` and on submit runs a local `setTimeout` then shows the success screen. No data is sent to a server.
- **Required change**: On submit, `POST` the form data to a lead-capture API (e.g. `POST /api/leads`). On success, keep the existing success UI (and optionally pass dynamic date/time from config). On failure, show an error and do not switch to success.
- **Reference**: Form state and fields are in `src/pages/Checkout.tsx` (e.g. `formData`, `handleSubmit`, and the `fields` array for name, email, phone, city). The success block (lines ~40–117) shows hardcoded date, time, and platform; these can later be driven by site config.

### Optional

- Webhook or internal event on new lead for notifications (email, WhatsApp, Slack, etc.).

---

## 3. Authentication and Roles

### Roles

- **Super Admin**
  - Full access: user management, roles, all leads (view/assign/update), site/offer config, and any audit or settings.
- **Sub-admin (e.g. “Sales”, “Support”)**
  - Configurable permissions: e.g. view leads, assign leads, update status, add notes. Typically no user/role management and no (or read-only) site config.

### Auth Mechanics

- Login with **email + password**.
- Use **JWT** or **session cookies** for authenticated requests; role stored per user; permissions derived from role.
- **Password reset**: e.g. “Forgot password” flow (email link or token).
- Optional later: 2FA.

---

## 4. Lead Management (Professional)

### List View

- **Table or card layout** with columns: Name, Email, Phone, City, Status, Assigned To, Created At.
- **Sort**: e.g. by created_at, name, status.
- **Pagination**: Cursor or page-based.

### Filters

- By **status** (e.g. New, Contacted, Qualified, Converted, Lost).
- By **assigned user** (dropdown of admins/sub-admins).
- By **date range** (e.g. created_at).
- By **source** (e.g. checkout).

### Search

- Search by **name**, **email**, or **phone** (partial match).

### Status Pipeline

- Example: **New → Contacted → Qualified → Converted / Lost**.
- Status list can be fixed in code or configurable per deployment (e.g. stored in DB or config).

### Lead Detail Page

- Full contact info, current status, assignee.
- **Timeline**: Activity log (status changes, assignments, notes).
- **Notes**: Add/view notes (with author and timestamp).

### Assign

- Assign a lead to a user (sub-admin or admin); reassign when needed. Assignee list = users with lead-view/assign permission.

### Tracking / Activity

- Log: status changes, assignments, note additions. Optionally “viewed by” (who opened the lead) for basic tracking.

### Bulk Actions

- **Bulk status update**: Select multiple leads, set status.
- **Bulk assign**: Select multiple leads, assign to a user.
- **Export**: Export filtered/list view to CSV.

---

## 5. Website / Offer Configuration

A single **Site config** or **Offer config** section in the admin (Super Admin only, or configurable) to control what the marketing site shows.

### Workshop / Offer

| Config key (example) | Description           | Current hardcoded value / location                    |
|----------------------|------------------------|-------------------------------------------------------|
| Event date           | Workshop date          | e.g. “March 1, 2026”                                  |
| Event time           | Workshop time          | e.g. “11:00 AM”                                       |
| Duration             | Duration text          | e.g. “3 Hrs+”                                         |
| Platform             | Platform name          | e.g. “Zoom App”                                       |
| Workshop title       | Main offer title       | e.g. “Stock Market Crorepati Blueprint”               |

### Pricing

| Config key (example) | Description    | Current hardcoded value / location        |
|----------------------|----------------|-------------------------------------------|
| Original price       | Strikethrough  | e.g. ₹499                                 |
| Offer price          | Prominent price| e.g. ₹0                                   |

### Countdown

| Config key (example) | Description        | Notes                                                                 |
|----------------------|--------------------|-----------------------------------------------------------------------|
| Countdown end        | End date/time (ISO)| Target for “offer ends”; CountdownTimer should use this for a real countdown; fallback to static or hidden if not set. |

### Bonuses (optional for v1)

- **Timed bonus section**: Per-item values (e.g. ₹10,000, ₹5,000, …) and total (e.g. ₹20,000).
- **Bonus section**: Items with title, value, description (e.g. Free E-books ₹2000, etc.) if these should be editable from admin.

### Frontend Impact — Where Values Are Used

| Component / file                         | Values to make config-driven                                      |
|------------------------------------------|--------------------------------------------------------------------|
| `src/components/HeroSection.tsx`         | Date, time, duration (e.g. `details` array: “Mar 1, 2026”, “11:00 AM”, “3 Hrs+”). |
| `src/pages/Checkout.tsx`                 | Success block: date, time, platform; price card: ₹499, ₹0; workshop title; optionally inclusions. |
| `src/components/PricingSection.tsx`      | Original price (₹499), offer price (₹0).                          |
| `src/components/CountdownTimer.tsx`      | Countdown end date/time (replace client-only countdown with target from config). |
| `src/components/TimedBonusSection.tsx`  | Bonus item values and total (e.g. ₹10,000, ₹5,000, total ₹20,000). |
| `src/components/BonusSection.tsx`       | Bonus items (title, value, description) if configurable.           |

The marketing site can read config via a **public or authenticated GET** (e.g. `GET /api/site-config`) and cache it, or config can be baked at build time via env; the spec does not mandate one approach.

---

## 6. Data Models (Concise)

- **User**: `id`, `email`, `password_hash`, `name`, `role_id`, `created_at`, `updated_at`. Used for login and as assignee.
- **Role**: `id`, `name`, `permissions` (JSON or separate permission rows). Links to User.
- **Lead**: `id`, `name`, `email`, `phone`, `city`, `source`, `status`, `assigned_to` (user_id, nullable), `created_at`, `updated_at`.
- **LeadNote**: `id`, `lead_id`, `user_id`, `body`, `created_at`.
- **LeadActivity**: `id`, `lead_id`, `user_id`, `action` (e.g. `status_change`, `assigned`, `note_added`), `meta` (JSON for old/new values, etc.), `created_at`.
- **SiteConfig**: Key-value table or single row with columns such as `workshop_date`, `workshop_time`, `duration`, `platform`, `workshop_title`, `original_price`, `offer_price`, `countdown_end`, and optional bonus-related keys.

---

## 7. API Outline

- **Auth**: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, (optional) `POST /api/auth/reset-password`.
- **Leads**:  
  - `POST /api/leads` — create (used by checkout form).  
  - `GET /api/leads` — list with filters, search, sort, pagination.  
  - `GET /api/leads/:id` — detail.  
  - `PATCH /api/leads/:id` — update (e.g. status, assigned_to).  
  - `POST /api/leads/:id/notes` — add note.
- **Users (admin)**: CRUD for admin users; list endpoint for assignee dropdown (e.g. `GET /api/users`).
- **Roles**: List, create, update (Super Admin only).
- **Site config**: `GET /api/site-config` (public or authenticated), `PATCH /api/site-config` (admin only). Can be a single object or key-value.

No need to implement every endpoint in detail here; the above is the high-level resource list.

---

## 8. Implementation Phases

- **Phase 1 — Foundation and lead capture**
  - Backend: API + DB (Users, Roles, Leads, SiteConfig).
  - Lead capture: `POST /api/leads` and wire Checkout form in `src/pages/Checkout.tsx` to it.
  - Admin: login + lead list + lead detail (read-only or with status edit).

- **Phase 2 — Full lead management**
  - Sub-admins and roles/permissions.
  - Assign lead to user; notes; activity log (LeadNote, LeadActivity).
  - Filters, search, sort, pagination on lead list.

- **Phase 3 — Website config**
  - Site config API and admin UI to edit workshop date/time, duration, platform, title, prices, countdown end, and optionally bonuses.
  - Marketing site: components listed in Section 5 read from config (or build-time env); CountdownTimer uses config end date for a real countdown.

- **Phase 4 (optional)**  
  - Bulk actions (status, assign), CSV export, and notifications (e.g. email/WhatsApp on new lead).

---

## 9. Tech Stack Suggestions

- **Backend**: Node (Express/Fastify) or similar; or Next.js API routes if the app is moved to Next.
- **Database**: PostgreSQL (recommended for production) or SQLite for simplicity.
- **Auth**: JWT or session cookies; bcrypt (or equivalent) for password hashing.
- **Admin UI**: Same stack as the marketing site (React) under `/admin`, or a separate React app; use table components, forms, and role-based routing/guards.

---

## Summary

This spec defines a CRM that captures checkout leads, provides admin and sub-admin lead management (pipeline, assign, notes, activity), and a site/offer config section so date, time, and prices on the website can be changed from the admin without code changes. Implementation can follow the four phases above and use the referenced files in `src/` for integration points.
