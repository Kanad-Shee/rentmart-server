# Rentmart Server

Backend API for the Rentmart marketplace. This service powers authentication, equipment onboarding, booking lifecycle management, payment event ingestion, support-query storage, notifications, and admin operations for the platform.

## Overview

Rentmart's server is built with Bun, Express, TypeScript, Prisma, PostgreSQL, Redis, and Zod. The codebase follows a layered structure:

- `routes` define HTTP endpoints and access rules
- `controllers` adapt requests to service calls
- `services` hold marketplace business logic
- `validators` enforce input contracts with Zod
- `middlewares` protect routes, validate access, and limit abuse
- `lib` contains infrastructure integrations such as Prisma, Redis, Razorpay, Cloudinary, Twilio, Nodemailer, and Mapbox

## Core Responsibilities

| Area | What it does | Main modules |
| --- | --- | --- |
| Identity and access | Handles sign-up, sign-in, OTP verification, password updates, profile updates, role-aware auth, and verification gating | `auth.routes.ts`, `auth.service.ts`, `auth.middleware.ts` |
| Marketplace catalog | Manages equipment categories, listing creation, listing images, moderation, and public marketplace browsing | `category.*`, `equipment.*`, `image-upload.middleware.ts` |
| Booking lifecycle | Supports request submission, owner approval, renter payment flow, rental state changes, and dispute markers | `booking.*` |
| Payments and reconciliation | Accepts Razorpay webhooks, stores raw event payloads, maps payment data back to bookings, and exposes admin event visibility | `payment.routes.ts`, `payment.controller.ts`, `booking.service.ts` |
| Notifications | Creates user-facing events around approvals, bookings, verification, and account changes | `notification.*` |
| Support operations | Accepts owner/renter contact queries and exposes them to the admin queue | `support-query.*` |
| Wishlist | Stores renter saved equipment for later review | `wishlist.*` |

## Tech Stack

| Layer | Tooling | Why it is used here |
| --- | --- | --- |
| Runtime | Bun | Fast local development, native TypeScript execution, simple scripts |
| HTTP server | Express 5 | Mature routing and middleware composition |
| Language | TypeScript | Strong contracts across routes, services, and Prisma models |
| ORM / DB access | Prisma + `@prisma/adapter-pg` | Typed queries and schema-driven data modeling on PostgreSQL |
| Database | PostgreSQL | Durable relational model for users, listings, bookings, payments, and support queries |
| Validation | Zod | Safe parsing of body, query, and route params before service logic runs |
| Auth | JWT + cookies | Supports authenticated sessions and role-aware route protection |
| Password hashing | `bcryptjs` | Secure password storage |
| Rate limiting | Redis | Tracks request windows and protects sensitive flows from abuse |
| Payments | Razorpay | Booking payment capture and webhook-driven reconciliation |
| Uploads | Multer + Cloudinary helpers | Listing/category image intake and storage pipeline |
| Email | Nodemailer | OTP and transactional email delivery |
| SMS / phone | Twilio | Mobile verification and phone-related workflows |
| Maps / geocoding | Mapbox | Address normalization and location search support |

## Request Lifecycle

| Step | Backend behavior | Safety checks |
| --- | --- | --- |
| 1. Request enters route | Express route matches endpoint | Route-level middleware order is explicit |
| 2. Validation | `validateRequest()` parses `body`, `query`, or `params` with Zod | Malformed input returns `400` before business logic |
| 3. Authentication | `authenticateUser` resolves user from cookie or bearer token | Invalid or expired JWT returns `401` |
| 4. Authorization | `requireRole`, `requireVerifiedEmail`, `requireVerifiedMobile` gate access | Prevents cross-role misuse and incomplete verification flows |
| 5. Service execution | Controllers delegate to services | Business rules stay centralized and reusable |
| 6. Persistence | Prisma writes to PostgreSQL; Redis stores rate-limit counters | Strong typing and structured storage |
| 7. Response | Consistent JSON payloads with `success`, `message`, and `data` | Predictable client consumption |

## Domain Model

| Model | Purpose | Key relationships |
| --- | --- | --- |
| `User` | Platform identity for owner, renter, or admin | Links to listings, bookings, notifications, support queries, wishlist |
| `OtpVerification` | Email/login OTP workflow | Belongs to a user |
| `Category` | Marketplace taxonomy | Owns many `Equipment` rows |
| `Equipment` | Published or moderated machine listing | Belongs to owner and category; connects to images, bookings, notifications |
| `EquipmentImage` | Ordered listing imagery | Belongs to one equipment item |
| `Booking` | Rental lifecycle plus finance state | Links renter, owner, equipment, and payment references |
| `RazorpayWebhookEvent` | Raw payment event archive | Stores payload JSON for reconciliation/debugging |
| `Notification` | User-facing event feed | Belongs to a user, optionally an equipment item |
| `SupportQuery` | Contact/support submissions | Belongs to a user and captures topic + message |
| `WishlistItem` | Saved marketplace equipment | Links renter and equipment |

## Route Surface

| Prefix | Purpose |
| --- | --- |
| `/auth` | Identity, OTP, profile, password, session |
| `/bookings` | Booking creation, approval, payment state, transaction workflow |
| `/categories` | Category browsing and admin category management |
| `/equipment` | Public listings, owner listings, moderation, uploads |
| `/notifications` | Notification feed and read-state updates |
| `/payments` | Razorpay webhook ingestion and admin raw event retrieval |
| `/support-queries` | Contact form submission and admin review queue |
| `/wishlists` | Renter save/remove wishlist flows |

## Business Logic Highlights

### Authentication Flow

| Stage | Logic |
| --- | --- |
| Registration / login | User starts auth flow through OTP-driven endpoints |
| Token issuance | Server signs JWT with issuer metadata and stores/accepts it via cookie or bearer token |
| Request resolution | Middleware re-hydrates the user from token and database state |
| Verification gates | Some protected actions require verified email or verified mobile before proceeding |

### Listing Moderation Flow

| Stage | Logic |
| --- | --- |
| Owner draft | Listing can begin as draft or pending-verification asset |
| Image intake | Upload middleware validates and processes listing imagery |
| Admin review | Listing is approved or rejected with moderation metadata |
| Public publish | Only active listings appear in public marketplace surfaces |

### Booking and Payment Flow

| Stage | Logic |
| --- | --- |
| Booking request | Renter submits rental request against a listing |
| Owner decision | Owner approves or rejects within the configured window |
| Payment required | Booking moves into renter payment state |
| Payment webhook | Razorpay webhook enters `/payments/razorpay/webhook` with raw body support |
| Financial reconciliation | Booking stores payment IDs, payout states, refund states, and finance timestamps |
| Admin ops | Admin can view ledger data and raw payment events for reconciliation |

### Support Query Flow

| Stage | Logic |
| --- | --- |
| Contact submission | Owner or renter sends a support query |
| Database persistence | Query is stored in PostgreSQL with role and topic metadata |
| Admin review | Admin retrieves queue for action in dashboard surfaces |

## Security and Reliability

| Concern | Current implementation |
| --- | --- |
| Input validation | Zod schemas protect request body, query, and params |
| SQL injection resistance | Prisma is used for typed DB access; no string-built SQL path is required for normal flows |
| Auth boundary | JWT verification checks issuer and required claims before user resolution |
| Role isolation | `requireRole()` restricts admin-only and role-specific endpoints |
| Verification gating | Email/mobile middleware blocks sensitive actions until verification completes |
| Abuse protection | Redis-backed rate limiter adds `429` enforcement and retry metadata |
| Webhook compatibility | Razorpay webhook route uses `express.raw()` so signature-sensitive payloads are preserved |
| Password safety | Passwords are stored as hashes, not plain text |

## Environment Groups

The server uses several environment groups. Exact variable names live in `src/configs` and `src/lib`.

| Group | Examples of what belongs here |
| --- | --- |
| Database | PostgreSQL connection settings for Prisma |
| Auth | JWT secrets, issuer, cookie/session config |
| Redis | Host, port, auth, cache connection config |
| SMTP | Mail host, port, username, password, sender identity |
| Twilio | SMS credentials for phone verification |
| Cloudinary | Image upload account and signing details |
| Mapbox | Geocoding/search token |
| Razorpay | Payment API keys and webhook secret |

## Folder Structure

```text
server/
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ src/
│  ├─ configs/
│  ├─ controllers/
│  ├─ lib/
│  ├─ middlewares/
│  ├─ routes/
│  ├─ services/
│  ├─ tests/
│  ├─ types/
│  ├─ validators/
│  └─ index.ts
├─ tsconfig.json
└─ package.json
```

## Development

```bash
bun install
bun run dev
```

## Build and Run

```bash
bun run build
bun run start
```

## Testing

```bash
bun test
```

## Notes for Contributors

- Keep route handlers thin and move business logic into `services`.
- Add or update Zod validators before introducing new request shapes.
- Protect new privileged endpoints with both auth and role middleware.
- If a new feature touches booking finance or webhook ingestion, update both the structured `Booking` fields and the raw event visibility story so admin reconciliation remains complete.
