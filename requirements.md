# Backend Application — Requirements

This document consolidates all functional and non-functional requirements for the backend application. It is organized by module. Each module follows the same structure: Overview, Roles, Dependencies, Scenarios, Contract (API), Errors & Constraints, Audit/Logging, and Non-Functional Requirements.

---

## Table of Contents

1. [Registration](#1-registration)
2. [Authentication (Login)](#2-authentication-login)
3. [Authorization (Session Verification)](#3-authorization-session-verification)
4. [RBAC (Role-Based Access Control)](#4-rbac-role-based-access-control)
5. [View User Profile](#5-view-user-profile)
6. [Update User Data](#6-update-user-data)
7. [Delete User](#7-delete-user)
8. [List All Users (Admin)](#8-list-all-users-admin)
9. [File Format Transformation](#9-file-format-transformation)
10. [Image Transformation](#10-image-transformation)
11. [Transformation History](#11-transformation-history)
12. [Saving Transformation Results to Storage](#12-saving-transformation-results-to-storage)
13. [General Requirements for the Transformation Module](#13-general-requirements-for-the-transformation-module)
14. [Cross-Cutting Non-Functional Requirements](#14-cross-cutting-non-functional-requirements)

---

## 1. Registration

### 1.1 Overview

**Purpose:** create a user account using email + password.

**Users/Roles:** Guest (unauthenticated user).

**Dependencies / related settings:** the administrator can enable/disable the requirement for email confirmation independently for each of the following flows:

- Registration
- Password recovery
- Authentication / login

### 1.2 Scenarios (user stories)

1. **Registration without confirmation:** user submits email + password, the account is created immediately, and the user can log in.
2. **Registration with confirmation (optional):** user submits email + password, then confirms the email via a code (OTP) or a link (magic link).

### 1.3 Contract

#### 1.3.1 Registration request

**Input:**

- `email: string` — must be a valid format.
- `password: string`

**Validation:**

- `email` is required and must be a valid format.
- `password` is required.
- Password policy: minimum length and complexity (letters/digits/special characters, etc.) — optional, governed by validation rules if required.
- Re-registration with an already existing `email` is forbidden.

**Logic/steps:**

1. Accept `email`, `password`.
2. Validate input.
3. If confirmation is disabled for registration:
   - Create the user (and related records, if needed).
4. If confirmation is enabled for registration:
   - Create a "pending registration" record (awaiting confirmation), **or** create the user in an inactive state (pick one approach).
   - Trigger email confirmation via one of:
     - Code (OTP), or
     - Link (magic link).

**Responses:**

- **Option A — success (confirmation disabled):** return the registration result (and tokens/session, if applicable).
- **Option B — success (confirmation enabled):** return a flag indicating confirmation is required, plus an attempt identifier/token for subsequent confirmation.

#### 1.3.2 Email confirmation for registration (optional)

**General rule:** confirmation is only performed _if_ the administrator has enabled the corresponding flag for the "Registration" flow.

**Supported methods:**

- Code (OTP)
- Link (magic link)

**Recommended parameters (if using OTP):**

- Length: 6 digits.
- TTL: 10 minutes.
- Attempt limit: 5.
- Resend cooldown: no more than once per 60 seconds.

### 1.4 Errors & Constraints

- Invalid email.
- Invalid password (per password policy).
- Email already registered (or return a neutral error, per security requirements).
- Invalid/expired confirmation code or token.
- Confirmation attempt limit exceeded / email send rate limit exceeded.

### 1.5 Audit/Logging

- Log: registration attempts (success/failure), OTP/link dispatch, successful/failed confirmations.

### 1.6 Non-Functional Requirements

- Protection against spam and brute force (rate limiting on registration and resend).
- Do not reveal in error messages whether an email exists (optional, per security requirements).

### Related resources

- JWT tokens
- Password storage
- Email delivery

---

## 2. Authentication (Login)

### 2.1 Overview

**Purpose:** authenticate a user by email + password.

**Dependencies / related settings:** email confirmation for actions is enabled/disabled by the administrator. The administrator can independently configure the confirmation requirement for each action, including **authentication/login** (same mechanism as the "Email confirmation" section under Registration).

### 2.2 Contract

#### 2.2.1 Login request

**Input:**

- `email: string`
- `password: string`

**Validation:**

- `email` is required, valid format.
- `password` is required.

#### 2.2.2 Responses

**Option A — login confirmation disabled:**

- Issue tokens.

**Option B — login confirmation enabled:**

- **Do not issue tokens** at this step.
- Create a "pending login attempt" record.
- Trigger email confirmation via one of:
  - Code (OTP), or
  - Link (magic link).

### 2.3 Email confirmation for login (optional)

**General rule:** confirmation is only performed _if_ the administrator has enabled the corresponding flag for the "Authentication/Login" flow.

#### 2.3.1 Scenario: code (OTP)

**Initiation:**

- Generate a one-time code and send it to the user's email.

**Confirmation:**

- Input: `attemptId/token` + `otpCode`.
- Validate expiry, attempt count, and code match.
- On success: activate the login attempt, create a session/issue tokens.

**Recommended parameters (configurable):**

- Length: 6 digits.
- TTL: 10 minutes.
- Attempt limit: 5.
- Resend cooldown: no more than once per 60 seconds.

#### 2.3.2 Scenario: link (magic link)

**Initiation:**

- Generate a one-time token and send a link of the form `https://<host>/auth/confirm?token=...`.

**Confirmation:**

- Input: `token`.
- Validate token validity/expiry/single-use, and its binding to the login attempt.
- On success: issue tokens.

**Recommended parameters:**

- TTL: 10 minutes.
- The token is single-use and bound to a specific login attempt.

### 2.4 Errors & Constraints

- Invalid email or password.
- Account not found.
- Login attempt limit exceeded (rate limit / temporary lockout).
- Invalid/expired code or token.

### 2.5 Audit/Logging

- Log: login attempts (success/failure), OTP/link dispatch, successful/failed confirmations.

### 2.6 Non-Functional Requirements

- Protection against password brute-forcing (rate limit, lockout).
- Do not reveal in error messages whether an email exists (per security requirements — optional).

### Related resources

- Login/password authentication without transmitting the raw password on subsequent requests.

---

## 3. Authorization (Session Verification)

User authorization is performed via a JWT token transmitted in cookies.

### 3.1 Overview

**Purpose:** authenticate user requests based on a JWT obtained from cookies.

**Users/Roles:** any user making requests to protected resources.

**Dependencies / related settings:**

- JWT signing secret/key (and signing algorithm).
- Cookie parameters (domain, path, `Secure`, `HttpOnly`, `SameSite`).
- Two JWTs are used: **access token** and **refresh token**.
- **TTL:** access — **15 minutes**, refresh — **30 days**.
- **Refresh rotation:** enabled. On every successful refresh, issue a **new pair** (access + refresh).
- **Server-side refresh storage:** **forbidden** (no allowlist/denylist; do not persist the refresh JWT, `jti`, or any session identifiers tied to the refresh token).
  - Consequence: server-side invalidation of a refresh token (logout/compromise/reuse) is not available; the system relies on TTL expiry and client-side cookie clearing.

### 3.2 Scenarios (user stories)

1. **Access to a protected resource (access token valid):** the user sends a request with cookies, the server validates the access JWT and allows access.
2. **Access expired, refresh valid:** the user performs a refresh, receives a new access token (and, with rotation, a new refresh token), then retries the request.
3. **Refresh expired/invalid:** the user receives 401 and must log in again.
4. **Logout (optional):** the refresh token is invalidated, cookies are cleared.

### 3.3 Contract / API

#### 3.3.1 Authorization check on protected endpoints

**Input:**

- Cookie `access_token` containing the access JWT.

**Validation:**

- Cookie is present.
- JWT signature is valid (against the current key/key set).
- `exp` has not expired.
- `nbf`/`iat` (if used) are valid.
- `iss`/`aud` (if used) match configuration.
- `sub` (user identifier) is present.

**Logic/steps:**

1. Extract the JWT from cookies.
2. Validate the JWT (signature + claims).
3. Look up the user by `sub`.
4. Check the user's status (active/blocked) — if applicable.
5. Pass `userId`/user context to the request handler.

**Responses:**

- **Success:** request proceeds; the endpoint's response is returned.
- **Error:** see section 3.4.

#### 3.3.2 Setting cookies on login and refresh (if covered by this spec)

**General rule:**

- On login, set `access_token` and `refresh_token`.
- On refresh, set a new `access_token` (and, with rotation, a new `refresh_token`).

**Input (refresh):**

- Cookie `refresh_token` containing the refresh JWT.

**Validation (refresh):**

- Cookie is present.
- JWT signature is valid.
- `exp` has not expired.
- No additional server-side state checks are performed (since server-side storage is forbidden).

**Responses (refresh):**

- **Success:** set a new `access_token` (and optionally a new `refresh_token`).
- **Error:** 401.

**Recommended cookie attributes:**

- `HttpOnly: true` (JS cannot read the token).
- `Secure: true` (HTTPS only).
- `SameSite: Lax/Strict` (choose per requirements; cross-domain scenarios may require `None` + `Secure`).
- Cookie TTL synchronized with the token's `exp`.

### 3.4 Errors & Constraints

- JWT cookie missing.
- JWT invalid (signature/format).
- JWT expired.
- User not found / blocked.
- Refresh token missing/invalid/expired.
- Logout cannot invalidate an already-issued refresh token server-side; logout = clearing cookies (and, if needed, a client-side redirect to login).

### 3.5 Audit/Logging

- Log: failed JWT validations (reason, without leaking secret data), access attempts to protected resources.
- Do NOT log: the full JWT, secrets, or sensitive personal data.

### 3.6 Non-Functional Requirements

- Security: protection against XSS/CSRF via correct cookie configuration; minimize log leakage.

---

## 4. RBAC (Role-Based Access Control)

> Reference implementation example: [nestjs-rbac](https://github.com/sergey-telpuk/nestjs-rbac)

### 4.1 Concept

RBAC configuration (roles, permissions, rules) is stored in the database and can be changed without restarting the application.

**Configuration:** the set of access rules (role → permission → action) is stored in the DB and loaded at application startup.

**Access check flow:**

1. The user requests a resource specifying the required permission (`resource@action`).
2. The system checks whether the user's role has this permission in the loaded configuration.
3. Result: access granted or denied (403).

**Dynamic updates:**

- Rule changes in the DB → cache invalidation → configuration reload.
- Changes take effect without restarting the application.

**DB entities:**

- **Roles** — list of roles.
- **Permissions** — resources and allowed actions (`create`, `update`, `delete`).
- **Grants** — the "role → permission → action" association (if action is not specified, all actions are allowed).

**Benefits:** permission changes without a deploy; flexible per-role action assignment; centralized access management.

### 4.2 Overview

**Purpose:** centralized, role- and permission-based access control. Configuration is stored in the DB and applied without restarting the application.

**Users/Roles:**

- **Admin:** manages roles, permissions, and grants.
- **User:** subject of the access check (holder of one or more roles).

**Context/Preconditions:**

- Request authorization happens after authentication (JWT).
- RBAC is framework-agnostic.

**Dependencies / related settings:**

- DB (stores roles, permissions, grants).
- Cache (optional, for fast permission checks).
- Cache invalidation mechanism.

### 4.3 Scenarios

1. **Access check:** the user requests an action (e.g., viewing the user list) → the system checks the permission → access is granted or 403 is returned.
2. **Dynamic update:** the administrator changes rules in the DB → the cache is invalidated → configuration is reloaded → new rules apply without a restart.
3. **Startup configuration load:** the application loads roles, permissions, and grants from the DB → configuration is ready for checks.

### 4.4 Contract

#### 4.4.1 Access check

**Input (internal RBAC module call):**

- `userId: string` — user identifier (from JWT).
- `roles: string[]` — user's roles (from DB or cache).
- `permission: string` — permission identifier (e.g., `permission1`).
- `action: string` — action within the permission (`create`, `update`, `delete`, etc.).

**Validation:**

- User is authenticated.
- User's roles exist in configuration.
- Permission exists in configuration.
- Action is valid for the permission.

**Logic/steps:**

1. Get the user's roles.
2. For each role, find grants in the loaded configuration.
3. Check for the presence of the permission and action.
4. If a grant includes the permission with no action specified — all actions for that permission are allowed.
5. If a grant specifies particular actions — only those actions are allowed.
6. If a match is found — access is granted.
7. If no match is found — return 403.

**Responses:**

- **Access granted:** proceed with the request.
- **403 Forbidden:** access denied.

#### 4.4.2 Role management

**Operations:**

- `GET /admin/rbac/roles` — list roles.
- `POST /admin/rbac/roles` — create a role.
- `PUT /admin/rbac/roles/{roleId}` — update a role.
- `DELETE /admin/rbac/roles/{roleId}` — delete a role.

**Input:**

- `role: { id: string, name: string, description?: string }`

**Validation:**

- Admin only.
- Role name must be unique.
- A role with existing grants cannot be deleted (or delete cascades — requires a decision).

**Responses:** 200 / 201 / 400 / 403 / 404 / 409.

#### 4.4.3 Permission management

**Operations:**

- `GET /admin/rbac/permissions` — list permissions.
- `POST /admin/rbac/permissions` — create a permission.
- `PUT /admin/rbac/permissions/{permissionId}` — update a permission.
- `DELETE /admin/rbac/permissions/{permissionId}` — delete a permission.

**Input:**

- `permission: { id: string, name: string, actions: string[] }`

**Notes:**

- `name` — permission identifier (e.g., `permission1`, `permission2`).
- `actions` — list of allowed actions for this permission (e.g., `['create', 'update', 'delete']`).

**Validation:**

- Admin only.
- Permission name must be unique.
- A permission with existing grants cannot be deleted.

**Responses:** 200 / 201 / 400 / 403 / 404 / 409.

#### 4.4.4 Grant management

**Operations:**

- `GET /admin/rbac/grants` — list grants.
- `POST /admin/rbac/grants` — create a grant.
- `PUT /admin/rbac/grants/{grantId}` — update a grant.
- `DELETE /admin/rbac/grants/{grantId}` — delete a grant.

**Input:**

- `grant: { id: string, roleId: string, permissionId: string, actions?: string[] }`

**Notes:**

- If `actions` is omitted or empty — all actions of the permission are allowed.
- If `actions` is specified — only the listed actions are allowed.

**Validation:**

- Admin only.
- Role and permission must exist.
- Duplicate grants (same role + permission) are forbidden.

**Responses:** 200 / 201 / 400 / 403 / 404 / 409.

### 4.5 Errors & Constraints

- Role not found.
- Permission not found.
- Grant not found.
- Duplicate role/permission/grant.
- Attempt to delete an entity with active grants.
- Invalid action or permission format.

### 4.6 Audit/Logging

- Log: `actorUserId`, operation (create/update/delete), entity (role/permission/grant), result (200/403/409).
- Log: cache resets and configuration reloads.

---

## 5. View User Profile

### 5.1 Overview

**Purpose:** display a user profile per access rules.

**Roles:** Self (own profile), Support/Admin (another user's profile — only with the required permission).

**Dependencies:** access JWT (cookie), RBAC, photo storage (URL/file).

### 5.2 Scenarios

1. **Self:** the client requests `GET /users/{userId}` for their own `userId` → receives their own profile.
2. **Role with permission:** the client requests `GET /users/{userId}` for another user's `userId` → receives only the allowed fields.
3. **Without permission:** an attempt to view another user's profile → 403.

### 5.3 Contract

#### 5.3.1 Get user profile

**Operation:** `GET /users/{userId}`

**Input:** `userId: string`, access JWT (cookie).

**Output (minimum):** `id`, `email`, `photo`, `fields` (only allowed fields).

**Validation:**

- Authorization (JWT valid).
- User exists.
- Access: Self, or the `users.read` permission.

**Response formation rules:**

- Filter profile fields on the API side based on role/permissions (default-deny).
- The list of allowed fields per Self/role is defined by policy/configuration (requires confirmation if not yet defined).

**Responses:** 200 / 401 / 403 / 404.

### 5.4 Errors & Constraints

- Rate limit on profile reads (especially for viewing other users' profiles).
- Default-deny on fields: only return allowed fields.

### 5.5 Audit/Logging (optional)

- Log: `viewerUserId`, `targetUserId`, result (200/403/404).

### 5.6 Non-Functional Requirements

- Protection against IDOR (Self can only access their own profile).

### Related resources

- File storage (see section 12 / storage abstraction)

---

## 6. Update User Data

### 6.1 Overview

**Purpose:** update a user's profile data per access rules.

**Roles:**

- **Self:** can update their own data, except `email` (only via confirmation).
- **Admin:** can update any user field (including `email`) directly.

**Context/Preconditions:**

- User is authenticated via access JWT (cookie).
- Authorization via RBAC (roles/permissions).

**Dependencies / related settings:**

- Email service for sending confirmation codes/links.
- Storage/URL for photos (if being changed).

### 6.2 Scenarios

1. **Self updates profile (no email change):** the client submits changes to allowed fields → the profile is updated.
2. **Self changes email via confirmation:** the client initiates an email change → confirmation is required → confirms via code/link → email is updated.
3. **Admin updates profile/email:** an admin client updates any user field directly.
4. **No permission:** an attempt to modify another user or a forbidden field → 403.

### 6.3 Contract

#### 6.3.1 Update user data (excluding email for Self)

**Operation:** `PATCH /users/{userId}`

**Input:**

- `userId: string` (path)
- `patch: object` — fields to update (the allowed set must be explicitly fixed).

**Validation:**

- Authorization (JWT valid).
- User exists.
- Access:
  - Self: `userId` must match the current user.
  - Admin: requires the `users.update` permission (or equivalent).
- **Forbidden:** Self changing `email` via this endpoint.
- Validate field values by format/constraints (per field).

**Logic/steps:**

1. Check permissions and ownership (Self vs Admin).
2. Verify `patch` contains no fields forbidden for this role.
3. Apply changes and save.

**Responses:**

- **200 OK:** updated profile (allowed fields only), or a success confirmation.
- **Errors:** see section 6.4.

#### 6.3.2 Initiate email change (Self)

**Operation:** `POST /users/{userId}/email-change`

**Input:**

- `userId: string` (path)
- `newEmail: string`
- `method: "otp" | "magic_link"` (or chosen by the server)

**Validation:**

- Authorization (JWT valid).
- Access: Self only (`userId` = current user).
- `newEmail` is a valid format.
- `newEmail` is not taken by another user (or the policy must be defined).

**Logic/steps:**

1. Create a pending email-change request with a TTL.
2. Send a confirmation to `newEmail`:
   - OTP code, or
   - Magic link with a token.

**Responses:**

- **200 OK:** `requiresConfirmation: true` and `challengeId` (if needed).
- **Errors:** see section 6.4.

#### 6.3.3 Confirm email change (Self)

**Operation:** `POST /users/{userId}/email-change/confirm`

**Option A (OTP):** `challengeId: string`, `code: string`

**Option B (magic link):** `token: string`

**Validation:**

- Authorization (JWT valid) **or** (optionally) the magic-link token is self-sufficient — requires clarification.
- Access: Self only.
- Validate TTL, attempt limits, and code/token match.

**Logic/steps:**

1. Verify the code/token.
2. Update the user's `email`.
3. Invalidate the challenge/token.

**Responses:**

- **200 OK:** email changed.
- **Errors:** see section 6.4.

#### 6.3.4 Direct email change (Admin)

**Operation:** `PATCH /users/{userId}` (via the general endpoint) **or** a dedicated `PATCH /users/{userId}/email` — pick one.

**Rule:** Admin can change `email` without confirmation.

### 6.4 Errors & Constraints

- **400 Bad Request:** invalid field formats.
- **401 Unauthorized:** missing/invalid JWT.
- **403 Forbidden:** no permission / Self attempting to change `email` directly.
- **404 Not Found:** user not found.
- **409 Conflict:** `newEmail` already taken (if applicable).
- **429 Too Many Requests:** rate limit on profile updates / confirmation sends.
- For email confirmation:
  - TTL (e.g., 10 minutes) — needs to be fixed.
  - Attempt limit (e.g., 5) — needs to be fixed.
  - Resend cooldown (e.g., 60 seconds) — needs to be fixed.

### 6.5 Audit/Logging

- Log: who made the change (`actorUserId`), on whom (`targetUserId`), which fields (field names only, no values), result.
- Log email-change events: initiated/sent/confirmed/error/TTL expired.

### 6.6 Non-Functional Requirements

- Security: default-deny on updatable fields; protection against IDOR (Self only for themselves).
- Performance: profile updates should be a single transaction / minimal queries.
- Reliability: email sending via queue/retries (if available).

---

## 7. Delete User

### 7.1 Overview

**Purpose:** delete (or anonymize) a user's personal data on request, per access rules.

**Roles:**

- **Self:** can request deletion of their own data.
- **Admin:** can delete any user's data.

**Context/Preconditions:**

- User is authenticated via access JWT (cookie).
- Authorization via RBAC.

### 7.2 Scenarios

1. **Self requests deletion:** the client initiates deletion of their own account → the system deletes/anonymizes the data → the user can no longer log in.
2. **Admin deletes a user:** the admin initiates deletion of a target user → the system deletes/anonymizes the data.
3. **No permission:** an attempt to delete another user without permission → 403.

### 7.3 Contract

#### 7.3.1 Request user deletion

**Operation:** `DELETE /users/{userId}` (or `POST /users/{userId}/delete` — pick one approach)

**Input:**

- `userId: string` (path)
- (optional) `reason: string` — reason (for audit/support)

**Validation:**

- Authorization (JWT valid).
- User exists.
- Access:
  - Self: `userId` matches the current user.
  - Admin: requires the `users.delete` permission (or equivalent).
- **Required:** before self-delete, mandatory email confirmation (OTP code or magic link), consistent with other confirmation flows in the application. Deletion without confirmation must be forbidden.

**Logic/steps:**

1. Check permissions (Self/Admin).
2. Deactivate access:
   - Revoke active sessions/refresh tokens.
   - Prevent further authentication.
3. Start the deletion/anonymization process:
   - Delete/anonymize profile fields (PII).
   - Delete files (photos/attachments) belonging to the user.
   - Handle related entities.
4. Complete the operation synchronously **or** enqueue it (if long-running) — requires a decision.

**Responses:**

- **200 OK / 204 No Content:** deletion accepted/completed.
- **202 Accepted:** deletion enqueued (async) + `jobId`.
- **Errors:** see section 7.4.

#### 7.3.2 Deletion status (if asynchronous)

**Operation:** `GET /users/{userId}/deletion-status` (or `GET /jobs/{jobId}`)

**Output:** `status: "pending" | "in_progress" | "done" | "failed"`.

### 7.4 Errors & Constraints

- **401 Unauthorized:** missing/invalid JWT.
- **403 Forbidden:** no permission.
- **404 Not Found:** user not found.
- **409 Conflict:** deletion already in progress / user is in "deleting" state.
- **429 Too Many Requests:** rate limit on deletion operations.

### 7.5 Audit/Logging

- Log: `actorUserId`, `targetUserId`, operation type (self/admin), result (success/failure), `jobId` (if applicable).
- Do NOT log deleted PII values.

### 7.6 Non-Functional Requirements

- Security: protection against IDOR, strict `users.delete` permission enforcement.
- Reliability: deletion must be idempotent (a repeat call must not break the system).

### Related resources

- GDPR

---

## 8. List All Users (Admin)

### 8.1 Overview

**Purpose:** provide the administrator with a searchable/filterable list of users.

**Roles:**

- **Admin:** access allowed.
- **Other roles:** forbidden (unless separate permissions are defined).

**Context/Preconditions:**

- Authorization via access JWT (cookie).
- Authorization via RBAC.

**Dependencies / related settings:**

- Indexing/search over users (if fast search is needed).
- User photo storage (URL/file).

### 8.2 Scenarios

1. **Admin retrieves the list:** the client requests the user list → receives a page of results.
2. **Admin searches/filters:** the client sets search/filter parameters → receives a filtered list.
3. **No permission:** a list request without admin permission → 403.

### 8.3 Contract

#### 8.3.1 Get user list

**Operation:** `GET /admin/users` (or `GET /users` with the admin permission — pick one approach)

**Query parameters:**

- `cursor: string | null` — pagination cursor (optional).
- `limit: number` — page size (e.g., 20–100).
- `q: string` — search string (optional: email/name/id).
- `status: "active" | "blocked" | "deleted"` — filter (optional).
- `sort: "created_at" | "last_login" | "email"` — sort field (optional).
- `order: "asc" | "desc"` — sort direction (optional).

**Output:**

- `items: UserListItem[]`
- `nextCursor: string | null`

`UserListItem`:

- `id: string`
- `email: string` (or partially masked — requires a decision)
- `photo: string | null` — profile photo URL (if uploaded)
- `createdAt: datetime`
- `status: string`
- (optional) `lastLoginAt: datetime | null`

**Validation:**

- Authorization (JWT valid).
- Check for the admin permission (e.g., `users.list.admin`).
- `limit` within allowed bounds.
- Validate `cursor`, `sort`, `order`, `status`.

**Logic/steps:**

1. Authorize the request.
2. Build the query against the user store with filters/search applied.
3. Return a paginated result.

**Responses:**

- **200 OK:** user list.
- **401 Unauthorized:** missing/invalid JWT.
- **403 Forbidden:** no permission.

### 8.4 Errors & Constraints

- Rate limit on the list endpoint.
- Restrict allowed search fields to avoid expensive queries.
- Never return sensitive fields (password hashes, tokens, 2FA secrets, internal flags).

### 8.5 Audit/Logging

- Log: `actorUserId`, request parameters (excluding PII where possible), result (200/403), number of items returned.

### 8.6 Non-Functional Requirements

- Security: strict RBAC checks, PII minimization.
- Performance: pagination is mandatory; indexes for filters/search.
- Reliability: stable cursor-based pagination (preferred) and idempotent responses for identical parameters.

---

## 9. File Format Transformation

### 9.1 Overview

**Purpose:** convert files between CSV, JSON, XML, and YAML formats.

**Users/Roles:** authenticated users only.

**Context/Preconditions:**

- Authorization via access JWT (cookie).
- Endpoint access requires authentication.

**Dependencies / related settings:**

- Parsing/serialization libraries for CSV, JSON, XML, YAML (or custom implementations).
- File size limits: configured by the administrator per input format (CSV, JSON, XML, YAML).
- Streaming file processing.

### 9.2 Scenarios

1. **CSV → JSON**
2. **JSON → CSV**
3. **XML → JSON**
4. **JSON → XML**
5. **YAML → JSON**
6. **JSON → YAML**
7. **CSV → XML**
8. **XML → CSV**
9. **CSV → YAML**
10. **YAML → CSV**
11. **XML → YAML**
12. **YAML → XML**
13. **List supported formats:** the client requests the available conversion directions.

### 9.3 Contract

#### 9.3.1 Convert file

**Operation:** `POST /api/convert`

**Input (multipart/form-data):**

- `file: binary` — source file (CSV, JSON, XML, or YAML).
- `targetFormat: string` — target format: `csv` | `json` | `xml` | `yaml`.

**Validation:**

- `file` is required, non-empty.
- File size does not exceed the configured limit for the source format.
- `targetFormat` is required and one of the allowed values.
- Source format is determined by content/extension and must be supported.
- The source → target pair must be valid (all 12 directions are considered valid).
- The source file's structure is syntactically valid for its format.

**Logic/steps (implementation may vary):**

1. Accept the file and parameters.
2. Determine the source format.
3. Check file size against the source format's limit.
4. Parse the source file into an internal representation (object/array/table).
5. Transform the internal representation into a structure suitable for the target format (for ambiguous pairs, at the implementer's discretion — see 9.4).
6. Serialize into the target format.
7. Return the result as a streamed file.

**Responses:**

- **200 OK:** file in the target format, with `Content-Type` matching the format and `Content-Disposition: attachment; filename="converted.<ext>"`.
- **400 Bad Request:** invalid file, invalid parameters, parsing error.
- **413 Payload Too Large:** source format's size limit exceeded.
- **415 Unsupported Media Type:** unsupported file format.
- **401 Unauthorized:** unauthenticated request.

#### 9.3.2 List supported formats

**Operation:** `GET /api/convert/formats`

**Response:**

- **200 OK:** array of `{ source: string, target: string[] }` — allowed directions (all 12 pairs).

**Validation:**

- Authorization (JWT valid).

### 9.4 Errors & Constraints

- Unsupported source format.
- Invalid input file syntax.
- Size limit exceeded (limit depends on source format, set by admin).
- Conversion ambiguity (e.g., CSV → JSON: array of objects vs. array of arrays; XML → JSON: attributes, repeated elements; JSON → XML: root element, arrays). Rules for ambiguous pairs are implementation-defined (must be documented in code/docs).
- Encoding errors (non-UTF-8, BOM).

### 9.5 Audit/Logging

- Log: `userId`, `sourceFormat`, `targetFormat`, `fileSize`, result (`success` / `error` + code), duration.
- Do NOT log file contents.

### 9.6 Non-Functional Requirements

- **Security:** validate and sanitize input; disallow external entities in XML; limit structure depth/size; protect against resource-exhaustion attacks.
- **Performance:** streaming for large files; conversion timeout (e.g., 30s); caching of results not required. Process files on separate threads/workers to avoid blocking the main thread.
- **Reliability:** correct handling of Unicode, BOM, empty files; atomic responses (never return a partial file on error).
- **Compatibility:** support current format versions (JSON RFC 8259, YAML 1.2, XML 1.0, CSV RFC 4180).

---

## 10. Image Transformation

### 10.1 Overview

**Purpose:** convert images between PNG, JPEG, and SVG formats.

**Users/Roles:** authenticated users only.

**Context/Preconditions:**

- Authorization via access JWT (cookie).
- Endpoint access requires authentication.

**Dependencies / related settings:**

- Libraries for raster image handling (PNG/JPEG) and SVG.
- File size limits: configured by the administrator per input format (PNG, JPEG, SVG).
- Maximum output dimensions (width/height) for raster output when rasterizing SVG: configurable or hardcoded (simple solution acceptable).
- SVG rasterization parameters: default background — `#ffffff`.

### 10.2 Scenarios

1. **PNG → JPEG**
2. **JPEG → PNG**
3. **SVG → PNG** (rasterization)
4. **SVG → JPEG** (rasterization)
5. **List supported formats:** the client requests available conversion directions.

**Permanent constraint:** PNG/JPEG → SVG (vectorization) is not supported.

### 10.3 Contract

#### 10.3.1 Convert image

**Operation:** `POST /api/images/convert`

**Input (multipart/form-data):**

- `file: binary` — source image (PNG, JPEG, or SVG).
- `targetFormat: string` — target format: `png` | `jpeg` | `svg`.
- `options: object` (optional):
  - `quality: number` — JPEG quality (1–100), if target format is `jpeg`.
  - `width: number` — output width for SVG → raster. If omitted, the SVG's intrinsic size or a default is used.
  - `height: number` — output height for SVG → raster. If omitted, the SVG's intrinsic size or a default is used.
  - `background: string` — background color for SVG rasterization. Default: `#ffffff`.

**Validation:**

- `file` is required, non-empty.
- File size does not exceed the limit for the source format (PNG, JPEG, SVG).
- `targetFormat` is required and one of `png` | `jpeg` | `svg`.
- Source format is determined by content/extension and must be PNG, JPEG, or SVG.
- The source → target pair must be supported:
  - `png → jpeg`
  - `jpeg → png`
  - `svg → png`
  - `svg → jpeg`
- The file must be a valid image of the corresponding format.
- SVG must be safe (no scripts, no external entities).
- For SVG → raster: the resulting dimensions (`width`, `height`) must not exceed the configured/hardcoded maximums.
- `quality` (if provided) — integer from 1 to 100.

**Logic/steps:**

1. Accept the file and parameters.
2. Determine the source format.
3. Check size against the source format's limit.
4. Verify the conversion direction is supported.
5. For raster formats (PNG/JPEG): decode the image; apply parameters as needed (quality for JPEG).
6. For SVG → raster: perform rasterization using `width`, `height`, `background`; verify resulting dimensions against maximums.
7. Encode the result in the target format.
8. Return the result as a streamed file.

**Responses:**

- **200 OK:** image in the target format, with `Content-Type` (e.g., `image/png`, `image/jpeg`, `image/svg+xml`) and `Content-Disposition: attachment; filename="converted.<ext>"`.
- **400 Bad Request:** invalid image, unsupported direction, invalid parameters, maximum dimensions exceeded.
- **413 Payload Too Large:** source format's size limit exceeded.
- **415 Unsupported Media Type:** unsupported file format.
- **401 Unauthorized:** unauthenticated request.

#### 10.3.2 List supported formats

**Operation:** `GET /api/images/convert/formats`

**Response:**

- **200 OK:** array of `{ source: string, target: string[] }`:
  - `{ source: "png", target: ["jpeg"] }`
  - `{ source: "jpeg", target: ["png"] }`
  - `{ source: "svg", target: ["png", "jpeg"] }`

**Validation:**

- Authorization (JWT valid).

### 10.4 Errors & Constraints

- Unsupported conversion direction (PNG/JPEG → SVG is permanently forbidden).
- Invalid or corrupted image file.
- Size limit exceeded (depends on source format, set by admin).
- Maximum dimensions exceeded during SVG rasterization (width/height).
- SVG rasterization errors (invalid dimensions, missing intrinsic size, unsupported/complex SVG features).
- SVG with unsafe content (scripts, external references) — reject.
- Protection against decompression bombs (very large output from a small input file).

### 10.5 Audit/Logging

- Log: `userId`, `sourceFormat`, `targetFormat`, `fileSize`, result (`success` / `error` + code), duration.
- Do NOT log image content.

### 10.6 Non-Functional Requirements

- **Security:** verify SVGs contain no active content; disallow external resources; limit pixel count/size during decoding; protect against decompression bombs.
- **Performance:** streaming for large images; conversion timeout (e.g., 30s); enforce maximum dimensions (width/height) for rasterization, whether admin-configured or hardcoded.
- **Reliability:** correct handling of the alpha channel (PNG); atomic responses.

---

## 11. Transformation History

### 11.1 Overview

**Purpose:** give users and administrators access to the history of completed transformations (files and images).

**Users/Roles:**

- **Self:** view only their own transformations.
- **Admin:** view any user's transformations.

**Context/Preconditions:**

- Authorization via access JWT (cookie).
- All transformations (file and image) are logged into a unified history store.

**Dependencies / related settings:**

- Transformation history storage (DB).
- Pagination (cursor-based or offset-based — pick one approach; cursor is recommended).
- History record fields are derived from audit data (see 11.5).

### 11.2 Scenarios

1. **User views their own history:** Self requests their own transformation list → receives a page of results.
2. **Admin views a specific user's history:** Admin requests history by `userId` → receives a page of results.
3. **Admin filters:** Admin sets filter parameters (type, format, status, date) → receives a filtered list.
4. **No permission:** an attempt to access another user's history without admin rights → 403.

### 11.3 Contract

#### 11.3.1 Get own transformation history

**Operation:** `GET /api/transformations/history`

**Query parameters:**

- `cursor: string | null` — pagination cursor (optional).
- `limit: number` — page size (default 20, max 100).
- `type: "file" | "image"` — transformation type (optional).
- `sourceFormat: string` — source format (optional: csv, json, xml, yaml, png, jpeg, svg).
- `targetFormat: string` — target format (optional).
- `status: "success" | "error"` — status (optional).
- `createdAtFrom: datetime` — period start (optional).
- `createdAtTo: datetime` — period end (optional).

**Output:**

- `items: TransformationHistoryItem[]`
- `nextCursor: string | null`

`TransformationHistoryItem`:

- `id: string`
- `type: "file" | "image"`
- `sourceFormat: string`
- `targetFormat: string`
- `status: "success" | "error"`
- `fileSize: number` — source file size in bytes.
- `durationMs: number` — transformation duration.
- `errorCode?: string` — error code, if `status = "error"`.
- `createdAt: datetime`

**Validation:**

- Authorization (JWT valid).
- User exists and is active.
- `limit` within allowed bounds.
- `type`, `sourceFormat`, `targetFormat`, `status` — valid values.
- `cursor` is valid.

**Logic/steps:**

1. Authorize the request.
2. Determine `userId` from the JWT.
3. Query the history store filtered by `userId = self`.
4. Return a paginated result.

**Responses:**

- **200 OK:** list of history records.
- **401 Unauthorized:** unauthenticated request.

#### 11.3.2 Get a specific user's transformation history (Admin)

**Operation:** `GET /admin/users/{userId}/transformations/history`

**Query parameters:** same as 11.3.1.

**Output:** same as 11.3.1.

**Validation:**

- Authorization (JWT valid).
- Check for the admin permission (e.g., `transformations.history.admin`).
- User with `userId` exists.
- Other parameters validated as in 11.3.1.

**Logic/steps:**

1. Authorize the request.
2. Check the admin permission.
3. Query the history store filtered by `userId = {userId}`.
4. Return a paginated result.

**Responses:**

- **200 OK:** list of records.
- **401 Unauthorized:** unauthenticated request.
- **403 Forbidden:** no admin permission.
- **404 Not Found:** user not found.

### 11.4 Errors & Constraints

- Attempt to access another user's history without admin permission.
- Invalid filter/pagination parameters.
- Rate limit on the history endpoint (especially for admin access).
- Do not expose other users' sensitive data (email, etc.) in history records.

### 11.5 Audit/Logging

- Log: `actorUserId`, `targetUserId` (for admin access), request parameters (excluding PII where possible), result (200/403/404), number of records returned.
- Do NOT log file/image contents.

### 11.6 Non-Functional Requirements

- **Security:** strict access checks: Self — own records only; Admin — permission-gated.
- **Performance:** pagination is mandatory; indexes in the history store on `userId`, `createdAt`, `type`, `status`.
- **Reliability:** idempotent responses for identical parameters.
- **Retention:** history retention period set by the administrator (e.g., 90 days — at the implementer's discretion).

---

## 12. Saving Transformation Results to Storage

### 12.1 Overview

**Purpose:** when performing a file/image transformation, allow the user to save the resulting file in storage. The file remains downloadable from the transformation history until the history cleanup period expires.

**Users/Roles:**

- **Self:** saves and downloads only their own files.
- **Admin:** can download any user's files.

**Context/Preconditions:**

- Authorization via access JWT (cookie).
- File (`POST /api/convert`) and image (`POST /api/images/convert`) transformation endpoints already exist.
- Transformation history is recorded for all operations (see [Transformation History](#11-transformation-history)).
- History cleanup period is set by the administrator (e.g., 90 days).

**Dependencies / related settings:**

- File storage: local, S3-like, Firebase, or other (implementation hidden behind an abstraction).
- Transformation history table/collection (linked to the file).
- Background process to purge expired records and files.
- Configuration: file retention period (matches the history cleanup period).

### 12.2 Scenarios

1. **Save result:** the user performs a transformation with `save=true` → the file is saved to storage, a history record is created with a file identifier.
2. **Download own file:** Self requests download of a saved file from their history → receives the file.
3. **Admin downloads another user's file:** Admin requests download of a file from a specific user's history → receives the file.
4. **Skip saving:** the user performs a transformation without `save` (or `save=false`) → the file is not saved; the history record is created without a file reference.
5. **Automatic cleanup:** once the retention period expires, the record and associated file are automatically deleted.

### 12.3 Contract

#### 12.3.1 Transformation request changes

**Operations:** `POST /api/convert` and `POST /api/images/convert`

**Additional input parameter (multipart/form-data):**

- `save: boolean` — flag to save the result. Default `false`. Optional.

**Validation:**

- `save` — if provided, must be a valid boolean (or the string `"true"`/`"false"`).
- All other validation follows the corresponding transformation's requirements.

**Logic/steps (in addition to existing logic):**

1. Perform the standard transformation.
2. If `save=true` and the transformation succeeded:
   - Save the resulting file to storage.
   - Obtain a unique file identifier.
   - Create a transformation history record with this identifier and metadata.
   - Set an expiration matching the history cleanup period.
3. Return the result as usual (streamed file). Saving must not block returning the file.
4. If `save=false` — the file is not saved; the history record is created without a file identifier (if history is recorded for all operations).

**Responses:**

- Responses for the transformation itself are unchanged (200, 400, 401, 413, 415, etc.). Saving is an additional server-side action.

#### 12.3.2 Download a saved file (Self)

**Operation:** `GET /api/transformations/history/{itemId}/download`

**Input:**

- `itemId: string` — transformation history record identifier.

**Validation:**

- Authorization (JWT valid).
- History record exists.
- The record belongs to the current user (`userId` from JWT matches the record's owner).
- The record has a saved file (`fileId` present).
- The file retention period has not expired.

**Logic/steps:**

1. Authorize the request.
2. Find the history record by `itemId`.
3. Verify the record's owner is the current user.
4. Verify `fileId` presence and expiration status.
5. Retrieve the file from storage by `fileId`.
6. Return the file as a stream.

**Responses:**

- **200 OK:** file, with `Content-Type` and `Content-Disposition: attachment; filename="<original-name>"`.
- **401 Unauthorized:** unauthenticated request.
- **403 Forbidden:** record does not belong to the user.
- **404 Not Found:** record not found, or the file is missing/expired.
- **410 Gone:** file deleted due to expiration (404 may be used instead, optionally).

#### 12.3.3 Download a saved file (Admin)

**Operation:** `GET /admin/users/{userId}/transformations/history/{itemId}/download`

**Input:**

- `userId: string` — owner's user identifier.
- `itemId: string` — history record identifier.

**Validation:**

- Authorization (JWT valid).
- Check the admin permission (`transformations.history.admin`).
- User with `userId` exists.
- The history record exists and belongs to the specified user.
- The record has a saved file and its retention period has not expired.

**Logic/steps (may vary depending on the chosen storage approach):**

1. Authorize the request.
2. Check the admin permission.
3. Find the history record by `itemId` and `userId`.
4. Verify `fileId` presence and expiration status.
5. Retrieve the file from storage.
6. Return the file as a stream.

**Responses:**

- **200 OK:** file.
- **401 Unauthorized:** unauthenticated request.
- **403 Forbidden:** no admin permission.
- **404 Not Found:** user or record not found, or the file is missing/expired.
- **410 Gone:** file deleted (optional).

### 12.4 Errors & Constraints

- File not found in storage (record/storage desynchronization).
- File expired and deleted.
- Attempt to download another user's file without admin permission.
- Saved file size limit exceeded.
- Storage errors (unavailability, write failure) — should return 500.

### 12.5 Audit/Logging

- Log: `userId`, `transformationId`, `fileId`, action (`save`, `download`), result (success/failure), file size, save/download duration.
- Do NOT log file contents.

### 12.6 Non-Functional Requirements

- **Security:** files are private; access is permission-gated (Self/Admin); no direct file links exposed; protection against IDOR; signed URLs recommended if using external storage (optional).
- **Performance:** streaming for downloads; limit on saved file size; asynchronous saving (if possible) to speed up the response.
- **Reliability:** idempotency — a repeated download request must return the same file while it exists; handle storage failures gracefully; TTL-based automatic deletion must be reliable (background process).
- **Retention:** file lifetime equals the history cleanup period; files are deleted together with their history record; cleanup mechanism is a background job (cron) or deferred deletion (e.g., TTL in S3).
- **Compatibility (optional, nice-to-have):** the storage abstraction should allow swapping backends (local, S3, Firebase) without changing business logic.

---

## 13. General Requirements for the Transformation Module

- Transformation modules must support easy integration and modification. Adding a new module must not require changes to existing contracts (interfaces). To achieve this flexibility, use abstract classes/interfaces and implement them in new services and controllers.
- The full history of all transformation operations must be persisted in the database with complete process information (input/output data, status, timestamps) and linked to the user.
- Optionally, provide the ability to save the resulting file to the application's storage, at the user's choice.
- File storage may be local or cloud-based, selectable at configuration time.

### Related resources

- OOP abstractions (abstract classes/interfaces) as the basis for the transformation module's extensibility.

---

## 14. Cross-Cutting Non-Functional Requirements

These requirements apply application-wide, across all modules described above.

### 14.1 Database Query Optimization

- Use indexes on frequently filtered/sorted columns (e.g., `userId`, `createdAt`, `status`, `email`).
- `SELECT` only the fields actually needed by the response (avoid `SELECT *` / over-fetching).
- Wrap multi-step writes in database transactions wherever atomicity is required (e.g., profile updates touching multiple tables, deletion cascades, save-on-transform flows).

### 14.2 Health Checks

- Expose a `GET /health` endpoint for monitoring/orchestration (e.g., load balancer or container health checks).
- Should report the status of critical dependencies (DB connectivity, cache, storage) where feasible, in addition to basic liveness.
- Must not require authentication.
- Should respond quickly and not perform expensive operations.

### 14.3 Rate Limiting

- Apply rate limiting across the API as protection against DDoS and brute-force attacks.
- Apply stricter limits to sensitive endpoints in particular: login, registration, OTP/magic-link send and confirm, password/email change, user deletion, and admin listing/history endpoints (see per-module rate-limit notes above).
- Rate limit configuration (thresholds, windows) should be centrally configurable rather than hardcoded per endpoint.

### 14.4 Input Validation

- Validate all incoming request data (body, query params, path params) using `class-validator` (or an equivalent schema/DTO-based validation approach).
- Reject requests with invalid/unexpected data with `400 Bad Request` before any business logic executes.
- Validation rules should be defined declaratively on DTOs/schemas per endpoint, consistent with the per-module contracts defined above.

### 14.5 CORS

- Restrict CORS to a configurable allowlist of trusted domains only — no wildcard (`*`) origins in production.
- Credentialed requests (cookies) require an explicit origin allowlist, since `Access-Control-Allow-Origin: *` cannot be combined with credentials.

### 14.6 Logging of Critical Events

- Log all critical events application-wide, including (in addition to the per-module audit requirements above):
  - Authentication events (login attempts, success/failure).
  - Errors (unhandled exceptions, 5xx responses).
  - Data-modifying operations (profile updates, email changes, deletions, RBAC changes).
- Logs must exclude secrets, full JWTs, passwords, and raw PII values, consistent with the per-module logging rules above.

### 14.7 Test Coverage

- Maintain test coverage of **≥ 80%**, combining:
  - Unit tests (business logic, validators, services in isolation).
  - Integration tests (endpoint-level, including DB/storage interactions).
- Coverage should be measured in CI and enforced as a merge gate.

### 14.8 API Documentation (OpenAPI / Swagger)

- Maintain up-to-date OpenAPI (Swagger) documentation for all endpoints.
- Documentation must be kept in sync with the actual contracts (request/response shapes, status codes, auth requirements) defined per module above — ideally generated from code/DTOs rather than maintained by hand.
- Swagger UI (or equivalent) should be available at least in non-production environments; exposure in production is a configuration decision.

---

## Open Decisions / Items Requiring Confirmation

The source specification explicitly flags a number of implementation choices left to the development team. These should be resolved and documented before or during implementation:

- **Registration:** whether unconfirmed registrations are stored as "pending registration" records or as inactive user accounts.
- **Registration/Login errors:** whether to disclose that an email is already registered, or return a neutral error for security reasons.
- **User deletion:** whether deletion completes synchronously or is enqueued as a background job.
- **User deletion endpoint:** `DELETE /users/{userId}` vs. `POST /users/{userId}/delete`.
- **Admin email change:** via the general `PATCH /users/{userId}` endpoint or a dedicated `PATCH /users/{userId}/email`.
- **Email-change confirmation:** whether a magic-link token alone is sufficient, or an active JWT session is also required.
- **User list:** whether to mask part of the email in listings.
- **Admin user list endpoint:** `GET /admin/users` vs. `GET /users` gated by an admin permission.
- **View profile:** the exact list of fields allowed per role/Self needs to be fixed via policy/configuration.
- **File/image transformation:** exact resolution rules for structurally ambiguous conversions (e.g., CSV↔JSON array-of-objects vs. array-of-arrays; XML attribute/element handling) are implementation-defined and should be documented in code.
- **History retention period:** exact number of days (e.g., 90) needs to be confirmed and made configurable.
- **Confirmation flow parameters:** OTP length/TTL/attempt limits/resend cooldown are given as recommended defaults (6 digits, 10 min TTL, 5 attempts, 60s cooldown) and should be confirmed as final or made configurable.
