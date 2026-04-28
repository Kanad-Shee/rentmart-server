# Rentmart - AI Agent Architecture & Implementation Guide

**Context for AI Agents (Cursor, Copilot, etc.):**
This document serves as the master architectural blueprint for "Rentmart," a peer-to-peer heavy machinery rental marketplace. When generating code, database schemas, or API routes for this repository, strictly adhere to the workflows, RBAC rules, and technical specifications outlined below.

## 1. System Architecture & Tech Stack

- **Frontend:** Next.js (App Router), Tailwind CSS, Framer Motion.
- **Backend:** Express.js (Node.js), TypeScript.
- **Database:** Neon (Serverless Postgres) - Relational modeling.
- **Storage (Images):** Cloudinary CDN.
- **Payments & Deposits:** Stripe / Polar.
- **Mapping/Radius:** PostGIS (for Postgres location queries) or standard Haversine formula logic depending on scale.

## 2. Role-Based Access Control (RBAC)

The system has three distinct user roles. APIs and UI must strictly enforce these boundaries.

- **`RENTER`**: Can browse, filter by location radius, book equipment, pay, and leave reviews.
- **`OWNER`**: Can list equipment (requires KYC/Address), manage availability, accept/reject bookings, and view earnings.
- **`ADMIN`**: Platform moderators. Can access the verification queue, approve/reject machinery, handle disputes, and monitor platform metrics.

## 3. Authentication & KYC Workflow

1. **Initial Registration:** User signs up with Email, Password, Name, and selects their Role (`OWNER` or `RENTER`).
2. **Mobile/OTP Verification:** \* A mandatory step before an Owner can list or a Renter can book.
   - System generates a 6-digit OTP, saves it in the `otp_verifications` table with a 10-minute expiry.
   - OTP is sent via SMS gateway. User inputs OTP on the frontend.
   - Upon success, `mobile_verified` flag in the `Users` table is set to `TRUE`.
3. **KYC (Future Proofing):** Owners must provide Aadhar/ID details before their first listing is approved.

## 4. Equipment Listing & Verification Lifecycle

Equipment does _not_ go live immediately. It must be moderated.

1. **Owner Uploads:** Owner fills out Title, Category (1 of 4), Price, Delivery Radius, Location Coordinates, and uploads exactly 3 to 5 images.
2. **Cloudinary Pipeline:** \* Images are sent from client -> Express backend (using Multer).
   - Backend uploads to Cloudinary -> receives secure URLs.
   - Backend creates `Equipment` record with Cloudinary URLs stored as an array. Status set to `PENDING_VERIFICATION`.
3. **Admin Queue:** Equipment appears in the Admin Dashboard Verification Queue.
4. **Admin Action:** Admin reviews the 3-5 images.
   - If approved: Status changes to `ACTIVE`.
   - If rejected: Status changes to `REJECTED`, and a notification is sent to the Owner with the reason.

## 5. Booking & Protection Workflow

1. **Radius Check:** The frontend map and backend API must validate that the Renter's delivery location falls within the Owner's specified delivery radius (using geospatial queries).
2. **Checkout:** Renter pays the Rental Fee + Platform Protection Fee (non-refundable) + Security Deposit (authorized hold).
3. **Lifecycle:** `PENDING_APPROVAL` (Owner confirms) -> `CONFIRMED` -> `IN_PROGRESS` -> `COMPLETED` (or `DISPUTED`).

## 6. Proposed Database Schema (Neon Postgres)

Agents should use Prisma, Drizzle, or raw SQL based on the repo setup, adhering to this structure:

## 7. Notification System Architecture

1. `Trigger`: Backend service layer dispatches a notification creation event upon state changes (e.g., Admin clicks "Approve", Booking moves to "Confirmed").

2. `Delivery`: \* Real-time: Websockets (if implemented) or Polling from Next.js client.

3. `DB Persistence`: Written to the notifications table so users see them in the Notification Center.

## 8. Explicit Instructions for AI Agents

- `TypeScript First`: Always generate strictly typed interfaces for Express req/res and Next.js props.

- `Security`: Never expose sensitive fields (like password_hash or internal OTPs) in API responses.

- `Transactions`: Use Postgres database transactions when creating bookings to ensure payments and DB state stay perfectly synchronized.
