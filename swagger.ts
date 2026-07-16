import type { Router } from "express";
import { authRouter } from "./src/routes/auth.routes.js";
import { bookingRouter } from "./src/routes/booking.routes.js";
import { categoryRouter } from "./src/routes/category.routes.js";
import { equipmentRouter } from "./src/routes/equipment.routes.js";
import { notificationRouter } from "./src/routes/notification.routes.js";
import { paymentRouter } from "./src/routes/payment.routes.js";
import { supportQueryRouter } from "./src/routes/support-query.routes.js";
import { wishlistRouter } from "./src/routes/wishlist.routes.js";


type OpenApiPathItem = Record<
    string,
    {
        summary: string;
        tags: string[];
        parameters?: Array<Record<string, unknown>>;
        requestBody?: Record<string, unknown>;
        responses: Record<string, { description: string }>;
    }
>;

type RouteSection = {
    basePath: string;
    tag: string;
    description: string;
    router: Router;
};

function toOpenApiPath(routePath: string) {
    return routePath
        .split("/")
        .map((segment) => {
            if (segment.startsWith(":")) {
                return `{${segment.slice(1)}}`;
            }

            return segment;
        })
        .join("/")
        .replace(/\/+/g, "/");
}

function joinPaths(basePath: string, routePath: string) {
    return toOpenApiPath(`${basePath}/${routePath}`.replace(/\/+/g, "/"));
}

function collectRouterPaths(basePath: string, tag: string, router: Router) {
    const paths: Record<string, OpenApiPathItem> = {};

    for (const layer of (router as Router & {
        stack?: Array<{
            route?: { path?: string | string[]; methods?: Record<string, boolean> };
        }>;
    }).stack ?? []) {
        if (!layer.route?.path || !layer.route.methods) {
            continue;
        }

        const routePaths = Array.isArray(layer.route.path)
            ? layer.route.path
            : [layer.route.path];

        for (const routePath of routePaths) {
            const openApiPath = joinPaths(basePath, routePath);
            paths[openApiPath] ??= {};

            for (const method of Object.keys(layer.route.methods)) {
                paths[openApiPath][method] = {
                    summary: `${method.toUpperCase()} ${openApiPath}`,
                    tags: [tag],
                    responses: {
                        200: {
                            description: "Success",
                        },
                    },
                };
            }
        }
    }

    return paths;
}

const routeSections: RouteSection[] = [
    {
        basePath: "/auth",
        tag: "Auth",
        description: "Registration, login, OTP, profile, and session endpoints.",
        router: authRouter,
    },
    {
        basePath: "/bookings",
        tag: "Bookings",
        description: "Booking lifecycle, approval, disputes, and payment actions.",
        router: bookingRouter,
    },
    {
        basePath: "/categories",
        tag: "Categories",
        description: "Category browsing and category administration endpoints.",
        router: categoryRouter,
    },
    {
        basePath: "/equipment",
        tag: "Equipment",
        description: "Equipment discovery, listing, moderation, and owner actions.",
        router: equipmentRouter,
    },
    {
        basePath: "/notifications",
        tag: "Notifications",
        description: "Notification feed and read-state updates.",
        router: notificationRouter,
    },
    {
        basePath: "/payments",
        tag: "Payments",
        description: "Payment webhook handling and payment-related retrieval.",
        router: paymentRouter,
    },
    {
        basePath: "/support-queries",
        tag: "Support Queries",
        description: "Support request submission and admin review endpoints.",
        router: supportQueryRouter,
    },
    {
        basePath: "/wishlists",
        tag: "Wishlists",
        description: "Wishlist save, remove, and listing operations.",
        router: wishlistRouter,
    },
];

function pathParameter(name: string, description: string) {
    return {
        name,
        in: "path",
        required: true,
        description,
        schema: {
            type: "string",
        },
    };
}

function queryParameter(
    name: string,
    description: string,
    schema: Record<string, unknown>,
) {
    return {
        name,
        in: "query",
        required: false,
        description,
        schema,
    };
}

function jsonRequestBody(schema: Record<string, unknown>, required = true) {
    return {
        required,
        content: {
            "application/json": {
                schema,
            },
        },
    };
}

function multipartRequestBody(schema: Record<string, unknown>, required = true) {
    return {
        required,
        content: {
            "multipart/form-data": {
                schema,
            },
        },
    };
}

function successResponse(description: string) {
    return {
        200: {
            description,
        },
    };
}

const bookingIdParameter = pathParameter("bookingId", "Unique booking identifier.");
const categoryIdParameter = pathParameter("id", "Unique category identifier.");
const equipmentIdParameter = pathParameter("id", "Unique equipment identifier.");
const notificationIdParameter = pathParameter("id", "Unique notification identifier.");
const supportQueryIdParameter = pathParameter("id", "Unique support query identifier.");
const wishlistEquipmentIdParameter = pathParameter(
    "equipmentId",
    "Unique equipment identifier.",
);

const paginationParameters = [
    queryParameter("page", "Page number.", {
        type: "integer",
        minimum: 1,
        default: 1,
    }),
    queryParameter("pageSize", "Items per page.", {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 10,
    }),
];

const allOperationOverrides: Record<string, OpenApiPathItem> = {
    "/auth/signup": {
        post: {
            summary: "Create a new owner or renter account",
            tags: ["Auth"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["role", "fullName", "email", "address", "password", "confirmPassword"],
                properties: {
                    role: {
                        type: "string",
                        enum: ["owner", "renter"],
                    },
                    fullName: {
                        type: "string",
                        minLength: 2,
                        maxLength: 50,
                        example: "Kanad Shee",
                    },
                    email: {
                        type: "string",
                        format: "email",
                        example: "kanad@example.com",
                    },
                    address: {
                        type: "string",
                        minLength: 2,
                        maxLength: 80,
                        example: "12 Market Road, Kolkata",
                    },
                    password: {
                        type: "string",
                        format: "password",
                        minLength: 8,
                        example: "StrongPass@123",
                    },
                    confirmPassword: {
                        type: "string",
                        format: "password",
                        minLength: 8,
                        example: "StrongPass@123",
                    },
                },
            }),
            responses: {
                201: {
                    description: "Account created successfully.",
                },
                400: {
                    description: "Invalid signup payload.",
                },
            },
        },
    },
    "/auth/signin": {
        post: {
            summary: "Sign in and receive an auth cookie",
            tags: ["Auth"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["email", "password"],
                properties: {
                    email: {
                        type: "string",
                        format: "email",
                        example: "kanad@example.com",
                    },
                    password: {
                        type: "string",
                        format: "password",
                        minLength: 8,
                        example: "StrongPass@123",
                    },
                    rememberMe: {
                        type: "boolean",
                        example: true,
                    },
                },
            }),
            responses: successResponse("Signed in successfully."),
        },
    },
    "/auth/mobile/signin": {
        post: {
            summary: "Sign in for mobile clients",
            tags: ["Auth"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["email", "password"],
                properties: {
                    email: {
                        type: "string",
                        format: "email",
                    },
                    password: {
                        type: "string",
                        format: "password",
                    },
                    rememberMe: {
                        type: "boolean",
                    },
                },
            }),
            responses: successResponse("Signed in successfully."),
        },
    },
    "/auth/verify-otp": {
        post: {
            summary: "Verify email OTP",
            tags: ["Auth"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["email", "otp"],
                properties: {
                    email: {
                        type: "string",
                        format: "email",
                    },
                    otp: {
                        type: "string",
                        minLength: 6,
                        maxLength: 6,
                        example: "123456",
                    },
                },
            }),
            responses: successResponse("OTP verified successfully."),
        },
    },
    "/auth/mobile/verify-otp": {
        post: {
            summary: "Verify email OTP for mobile clients",
            tags: ["Auth"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["email", "otp"],
                properties: {
                    email: {
                        type: "string",
                        format: "email",
                    },
                    otp: {
                        type: "string",
                        minLength: 6,
                        maxLength: 6,
                    },
                },
            }),
            responses: successResponse("OTP verified successfully."),
        },
    },
    "/auth/resend-otp": {
        post: {
            summary: "Resend account verification OTP",
            tags: ["Auth"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["email"],
                properties: {
                    email: {
                        type: "string",
                        format: "email",
                    },
                },
            }),
            responses: successResponse("OTP resent successfully."),
        },
    },
    "/auth/phone/start": {
        post: {
            summary: "Start phone verification for the current user",
            tags: ["Auth"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["phone"],
                properties: {
                    phone: {
                        type: "string",
                        example: "+919876543210",
                    },
                },
            }),
            responses: successResponse("Phone verification started successfully."),
        },
    },
    "/auth/phone/verify": {
        post: {
            summary: "Verify the current user's phone number",
            tags: ["Auth"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["phone", "code"],
                properties: {
                    phone: {
                        type: "string",
                        example: "+919876543210",
                    },
                    code: {
                        type: "string",
                        minLength: 4,
                        maxLength: 10,
                        example: "123456",
                    },
                },
            }),
            responses: successResponse("Phone number verified successfully."),
        },
    },
    "/auth/profile": {
        patch: {
            summary: "Update the current user's profile",
            tags: ["Auth"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["address"],
                properties: {
                    address: {
                        type: "string",
                        minLength: 2,
                        maxLength: 120,
                        example: "221B Baker Street",
                    },
                },
            }),
            responses: successResponse("Profile updated successfully."),
        },
    },
    "/auth/password": {
        patch: {
            summary: "Update the current user's password",
            tags: ["Auth"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["currentPassword", "newPassword", "confirmNewPassword"],
                properties: {
                    currentPassword: {
                        type: "string",
                        format: "password",
                    },
                    newPassword: {
                        type: "string",
                        format: "password",
                    },
                    confirmNewPassword: {
                        type: "string",
                        format: "password",
                    },
                },
            }),
            responses: successResponse("Password updated successfully."),
        },
    },
    "/auth/users": {
        get: {
            summary: "List users for admin review",
            tags: ["Auth"],
            parameters: [
                ...paginationParameters,
                queryParameter("search", "Search text.", {
                    type: "string",
                    maxLength: 100,
                }),
                queryParameter("role", "Role filter.", {
                    type: "string",
                    enum: ["ALL", "ADMIN", "OWNER", "RENTER"],
                }),
                queryParameter("verification", "Verification filter.", {
                    type: "string",
                    enum: ["ALL", "VERIFIED", "ACTION_REQUIRED"],
                }),
            ],
            responses: successResponse("Users fetched successfully."),
        },
    },
    "/auth/dashboard-metrics": {
        get: {
            summary: "Fetch admin dashboard metrics",
            tags: ["Auth"],
            responses: successResponse("Dashboard metrics fetched successfully."),
        },
    },
    "/auth/logout": {
        post: {
            summary: "Log out the current user",
            tags: ["Auth"],
            responses: successResponse("Logged out successfully."),
        },
    },
    "/auth/me": {
        get: {
            summary: "Fetch the current authenticated user",
            tags: ["Auth"],
            responses: successResponse("Current user fetched successfully."),
        },
    },
    "/bookings/": {
        post: {
            summary: "Create a booking request",
            tags: ["Bookings"],
            requestBody: jsonRequestBody({
                type: "object",
                required: [
                    "equipmentId",
                    "startDate",
                    "endDate",
                    "rentalDays",
                    "rentalFee",
                    "platformFee",
                    "damageWaiverFee",
                    "securityDeposit",
                    "totalAuthorized",
                ],
                properties: {
                    equipmentId: {
                        type: "string",
                        example: "eqp_123",
                    },
                    startDate: {
                        type: "string",
                        format: "date",
                        example: "2026-07-20",
                    },
                    endDate: {
                        type: "string",
                        format: "date",
                        example: "2026-07-22",
                    },
                    rentalDays: {
                        type: "integer",
                        minimum: 1,
                        example: 3,
                    },
                    rentalFee: {
                        type: "number",
                        minimum: 0,
                        example: 1500,
                    },
                    platformFee: {
                        type: "number",
                        minimum: 0,
                        example: 150,
                    },
                    damageWaiverFee: {
                        type: "number",
                        minimum: 0,
                        example: 100,
                    },
                    securityDeposit: {
                        type: "number",
                        minimum: 0,
                        example: 2000,
                    },
                    totalAuthorized: {
                        type: "number",
                        minimum: 0,
                        example: 3750,
                    },
                },
            }),
            responses: {
                201: {
                    description: "Booking request created successfully.",
                },
                400: {
                    description: "Invalid booking payload.",
                },
                401: {
                    description: "Unauthorized.",
                },
            },
        },
    },
    "/bookings/mine": {
        get: {
            summary: "List bookings for the authenticated renter",
            tags: ["Bookings"],
            parameters: paginationParameters,
            responses: {
                200: {
                    description: "Bookings fetched successfully.",
                },
                401: {
                    description: "Unauthorized.",
                },
            },
        },
    },
    "/bookings/owner": {
        get: {
            summary: "List bookings for the authenticated owner",
            tags: ["Bookings"],
            parameters: [
                ...paginationParameters,
                {
                    name: "group",
                    in: "query",
                    required: false,
                    schema: {
                        type: "string",
                        enum: [
                            "ALL",
                            "PENDING",
                            "AWAITING_PAYMENT",
                            "CONFIRMED",
                            "IN_PROGRESS",
                            "HISTORY",
                        ],
                    },
                    description: "Booking group filter.",
                },
            ],
            responses: {
                200: {
                    description: "Owner bookings fetched successfully.",
                },
                401: {
                    description: "Unauthorized.",
                },
            },
        },
    },
    "/bookings/admin": {
        get: {
            summary: "List bookings for admin review",
            tags: ["Bookings"],
            parameters: [
                ...paginationParameters,
                {
                    name: "search",
                    in: "query",
                    required: false,
                    schema: {
                        type: "string",
                        maxLength: 120,
                    },
                    description: "Search text.",
                },
                {
                    name: "status",
                    in: "query",
                    required: false,
                    schema: {
                        type: "string",
                        enum: [
                            "ALL",
                            "PENDING_OWNER_APPROVAL",
                            "PENDING_RENTER_PAYMENT",
                            "CONFIRMED",
                            "IN_PROGRESS",
                            "COMPLETED",
                            "CANCELLED",
                            "DISPUTED",
                        ],
                    },
                    description: "Booking status filter.",
                },
                {
                    name: "financialStatus",
                    in: "query",
                    required: false,
                    schema: {
                        type: "string",
                        enum: [
                            "ALL",
                            "PAYMENT_CAPTURED",
                            "MANUAL_SETTLEMENT_PENDING",
                            "MANUAL_SETTLEMENT_COMPLETE",
                            "PAYMENT_FAILED",
                            "DISPUTED",
                            "PAYMENT_PENDING",
                            "PAYMENT_PROCESSING",
                            "NONE",
                        ],
                    },
                    description: "Financial status filter.",
                },
                {
                    name: "ownerPayoutStatus",
                    in: "query",
                    required: false,
                    schema: {
                        type: "string",
                        enum: ["ALL", "PENDING", "PAID", "BLOCKED", "NONE"],
                    },
                    description: "Owner payout status filter.",
                },
                {
                    name: "depositRefundStatus",
                    in: "query",
                    required: false,
                    schema: {
                        type: "string",
                        enum: ["ALL", "PENDING", "REFUNDED", "SKIPPED", "BLOCKED", "NONE"],
                    },
                    description: "Deposit refund status filter.",
                },
                {
                    name: "needsAction",
                    in: "query",
                    required: false,
                    schema: {
                        type: "string",
                        enum: ["ALL", "ONLY_ACTION"],
                    },
                    description: "Show only actionable items.",
                },
            ],
            responses: {
                200: {
                    description: "Admin bookings fetched successfully.",
                },
                401: {
                    description: "Unauthorized.",
                },
            },
        },
    },
    "/bookings/{bookingId}/payment/order": {
        post: {
            summary: "Create a Cashfree order for a booking",
            tags: ["Bookings"],
            parameters: [bookingIdParameter],
            requestBody: jsonRequestBody({
                type: "object",
                additionalProperties: false,
            }, false),
            responses: {
                200: {
                    description: "Booking payment order created successfully.",
                },
            },
        },
    },
    "/bookings/{bookingId}/payment/verify": {
        post: {
            summary: "Verify a completed booking payment",
            tags: ["Bookings"],
            parameters: [bookingIdParameter],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["cashfreeOrderId"],
                properties: {
                    cashfreeOrderId: {
                        type: "string",
                        example: "order_123",
                    },
                },
            }),
            responses: {
                200: {
                    description: "Payment verification accepted.",
                },
            },
        },
    },
    "/bookings/{bookingId}/approve": {
        patch: {
            summary: "Approve a booking request",
            tags: ["Bookings"],
            parameters: [bookingIdParameter],
            responses: {
                200: {
                    description: "Booking approved successfully.",
                },
            },
        },
    },
    "/bookings/{bookingId}/reject": {
        patch: {
            summary: "Reject a booking request",
            tags: ["Bookings"],
            parameters: [bookingIdParameter],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["reason"],
                properties: {
                    reason: {
                        type: "string",
                        minLength: 5,
                        maxLength: 400,
                        example: "The requested dates are no longer available.",
                    },
                },
            }),
            responses: {
                200: {
                    description: "Booking rejected successfully.",
                },
            },
        },
    },
    "/bookings/{bookingId}/start": {
        patch: {
            summary: "Mark a booking as in progress",
            tags: ["Bookings"],
            parameters: [bookingIdParameter],
            responses: {
                200: {
                    description: "Booking marked in progress successfully.",
                },
            },
        },
    },
    "/bookings/{bookingId}/complete": {
        patch: {
            summary: "Mark a booking as complete",
            tags: ["Bookings"],
            parameters: [bookingIdParameter],
            responses: {
                200: {
                    description: "Booking completed successfully.",
                },
            },
        },
    },
    "/bookings/{bookingId}/dispute": {
        patch: {
            summary: "Dispute a booking",
            tags: ["Bookings"],
            parameters: [bookingIdParameter],
            requestBody: multipartRequestBody({
                type: "object",
                required: ["reason"],
                properties: {
                    reason: {
                        type: "string",
                        minLength: 5,
                        maxLength: 400,
                        example: "Equipment was returned damaged.",
                    },
                    photos: {
                        type: "array",
                        items: {
                            type: "string",
                            format: "binary",
                        },
                    },
                },
            }),
            responses: {
                200: {
                    description: "Booking disputed successfully.",
                },
            },
        },
    },
    "/bookings/{bookingId}/mark-owner-paid": {
        patch: {
            summary: "Mark the owner payout as paid",
            tags: ["Bookings"],
            parameters: [bookingIdParameter],
            requestBody: jsonRequestBody({
                type: "object",
                properties: {
                    reference: {
                        type: "string",
                        maxLength: 200,
                        example: "bank-transfer-001",
                    },
                },
            }, false),
            responses: {
                200: {
                    description: "Owner payout marked as paid successfully.",
                },
            },
        },
    },
    "/bookings/{bookingId}/mark-deposit-refunded": {
        patch: {
            summary: "Mark the deposit as refunded",
            tags: ["Bookings"],
            parameters: [bookingIdParameter],
            requestBody: jsonRequestBody({
                type: "object",
                properties: {
                    reference: {
                        type: "string",
                        maxLength: 200,
                        example: "refund-reference-001",
                    },
                },
            }, false),
            responses: {
                200: {
                    description: "Deposit marked as refunded successfully.",
                },
            },
        },
    },
    "/categories/": {
        post: {
            summary: "Create a category",
            tags: ["Categories"],
            requestBody: multipartRequestBody({
                type: "object",
                required: ["title", "description", "image"],
                properties: {
                    title: {
                        type: "string",
                        minLength: 2,
                        maxLength: 60,
                    },
                    description: {
                        type: "string",
                        minLength: 10,
                        maxLength: 1000,
                    },
                    image: {
                        type: "string",
                        format: "binary",
                    },
                },
            }),
            responses: successResponse("Category created successfully."),
        },
    },
    "/categories/{id}": {
        get: {
            summary: "Fetch a category by id",
            tags: ["Categories"],
            parameters: [categoryIdParameter],
            responses: successResponse("Category fetched successfully."),
        },
        patch: {
            summary: "Update a category",
            tags: ["Categories"],
            parameters: [categoryIdParameter],
            requestBody: multipartRequestBody({
                type: "object",
                required: ["title", "description"],
                properties: {
                    title: {
                        type: "string",
                        minLength: 2,
                        maxLength: 60,
                    },
                    description: {
                        type: "string",
                        minLength: 10,
                        maxLength: 1000,
                    },
                    image: {
                        type: "string",
                        format: "binary",
                    },
                },
            }),
            responses: successResponse("Category updated successfully."),
        },
        delete: {
            summary: "Delete a category",
            tags: ["Categories"],
            parameters: [categoryIdParameter],
            responses: successResponse("Category deleted successfully."),
        },
    },
    "/equipment/": {
        get: {
            summary: "List public equipment",
            tags: ["Equipment"],
            parameters: [
                queryParameter("categoryId", "Filter by category id.", {
                    type: "string",
                }),
                queryParameter("search", "Search text.", {
                    type: "string",
                    maxLength: 100,
                }),
                ...paginationParameters,
            ],
            responses: successResponse("Equipment fetched successfully."),
        },
        post: {
            summary: "Create a published equipment listing",
            tags: ["Equipment"],
            requestBody: multipartRequestBody({
                type: "object",
                required: ["title", "categoryId", "price", "deliveryRadius", "address", "images"],
                properties: {
                    title: {
                        type: "string",
                        minLength: 2,
                        maxLength: 100,
                    },
                    categoryId: {
                        type: "string",
                    },
                    price: {
                        type: "number",
                        minimum: 0.01,
                    },
                    deliveryRadius: {
                        type: "integer",
                        minimum: 1,
                    },
                    address: {
                        type: "string",
                        minLength: 5,
                        maxLength: 200,
                    },
                    description: {
                        type: "string",
                        maxLength: 2000,
                    },
                    images: {
                        type: "array",
                        items: {
                            type: "string",
                            format: "binary",
                        },
                    },
                },
            }),
            responses: successResponse("Equipment created successfully."),
        },
    },
    "/equipment/search-suggestions": {
        get: {
            summary: "Get public equipment search suggestions",
            tags: ["Equipment"],
            parameters: [
                queryParameter("q", "Search query.", {
                    type: "string",
                    minLength: 2,
                    maxLength: 100,
                }),
            ],
            responses: successResponse("Search suggestions fetched successfully."),
        },
    },
    "/equipment/featured": {
        get: {
            summary: "List featured equipment",
            tags: ["Equipment"],
            responses: successResponse("Featured equipment fetched successfully."),
        },
    },
    "/equipment/address-suggestions": {
        get: {
            summary: "Get owner address suggestions",
            tags: ["Equipment"],
            parameters: [
                queryParameter("input", "Address input.", {
                    type: "string",
                    minLength: 2,
                    maxLength: 200,
                }),
            ],
            responses: successResponse("Address suggestions fetched successfully."),
        },
    },
    "/equipment/address-details": {
        get: {
            summary: "Fetch address details from a place id",
            tags: ["Equipment"],
            parameters: [
                queryParameter("placeId", "External place identifier.", {
                    type: "string",
                }),
            ],
            responses: successResponse("Address details fetched successfully."),
        },
    },
    "/equipment/geocode": {
        post: {
            summary: "Geocode an equipment address",
            tags: ["Equipment"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["address"],
                properties: {
                    address: {
                        type: "string",
                        minLength: 5,
                        maxLength: 200,
                    },
                },
            }),
            responses: successResponse("Address geocoded successfully."),
        },
    },
    "/equipment/ai/listing-description": {
        post: {
            summary: "Generate an equipment listing description",
            tags: ["Equipment"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["title"],
                properties: {
                    title: {
                        type: "string",
                        minLength: 2,
                        maxLength: 100,
                    },
                    description: {
                        type: "string",
                        maxLength: 2000,
                    },
                },
            }),
            responses: successResponse("Listing description generated successfully."),
        },
    },
    "/equipment/drafts": {
        post: {
            summary: "Create an equipment draft",
            tags: ["Equipment"],
            requestBody: multipartRequestBody({
                type: "object",
                required: ["title", "categoryId", "price", "deliveryRadius", "address"],
                properties: {
                    title: {
                        type: "string",
                    },
                    categoryId: {
                        type: "string",
                    },
                    price: {
                        type: "number",
                    },
                    deliveryRadius: {
                        type: "integer",
                    },
                    address: {
                        type: "string",
                    },
                    description: {
                        type: "string",
                    },
                    images: {
                        type: "array",
                        items: {
                            type: "string",
                            format: "binary",
                        },
                    },
                },
            }),
            responses: successResponse("Draft created successfully."),
        },
    },
    "/equipment/mine": {
        get: {
            summary: "List the current owner's equipment",
            tags: ["Equipment"],
            parameters: [
                ...paginationParameters,
                queryParameter("tab", "Owner equipment tab.", {
                    type: "string",
                    enum: ["live", "pending", "draft"],
                }),
            ],
            responses: successResponse("Owner equipment fetched successfully."),
        },
    },
    "/equipment/{id}": {
        get: {
            summary: "Fetch public equipment by id",
            tags: ["Equipment"],
            parameters: [equipmentIdParameter],
            responses: successResponse("Equipment fetched successfully."),
        },
        patch: {
            summary: "Update an owner's equipment listing",
            tags: ["Equipment"],
            parameters: [equipmentIdParameter],
            requestBody: multipartRequestBody({
                type: "object",
                required: ["title", "categoryId", "price", "deliveryRadius", "address"],
                properties: {
                    title: {
                        type: "string",
                    },
                    categoryId: {
                        type: "string",
                    },
                    price: {
                        type: "number",
                    },
                    deliveryRadius: {
                        type: "integer",
                    },
                    address: {
                        type: "string",
                    },
                    description: {
                        type: "string",
                    },
                    retainedImageIds: {
                        oneOf: [
                            { type: "string" },
                            {
                                type: "array",
                                items: { type: "string" },
                            },
                        ],
                    },
                    images: {
                        type: "array",
                        items: {
                            type: "string",
                            format: "binary",
                        },
                    },
                },
            }),
            responses: successResponse("Equipment updated successfully."),
        },
        delete: {
            summary: "Delete an owner's equipment listing",
            tags: ["Equipment"],
            parameters: [equipmentIdParameter],
            responses: successResponse("Equipment deleted successfully."),
        },
    },
    "/equipment/{id}/submit": {
        patch: {
            summary: "Submit an equipment listing for review",
            tags: ["Equipment"],
            parameters: [equipmentIdParameter],
            requestBody: multipartRequestBody({
                type: "object",
                required: ["title", "categoryId", "price", "deliveryRadius", "address"],
                properties: {
                    title: { type: "string" },
                    categoryId: { type: "string" },
                    price: { type: "number" },
                    deliveryRadius: { type: "integer" },
                    address: { type: "string" },
                    description: { type: "string" },
                    retainedImageIds: {
                        oneOf: [
                            { type: "string" },
                            { type: "array", items: { type: "string" } },
                        ],
                    },
                    images: {
                        type: "array",
                        items: {
                            type: "string",
                            format: "binary",
                        },
                    },
                },
            }),
            responses: successResponse("Equipment submitted successfully."),
        },
    },
    "/equipment/admin/review-summaries": {
        get: {
            summary: "List admin review summary targets",
            tags: ["Equipment"],
            parameters: [
                ...paginationParameters,
                queryParameter("search", "Search text.", {
                    type: "string",
                    maxLength: 100,
                }),
            ],
            responses: successResponse("Admin review summary listings fetched successfully."),
        },
    },
    "/equipment/pending": {
        get: {
            summary: "List pending equipment for admin review",
            tags: ["Equipment"],
            parameters: [
                ...paginationParameters,
                queryParameter("search", "Search text.", {
                    type: "string",
                    maxLength: 100,
                }),
            ],
            responses: successResponse("Pending equipment fetched successfully."),
        },
    },
    "/equipment/{id}/review-summary/generate": {
        patch: {
            summary: "Generate a review summary for equipment",
            tags: ["Equipment"],
            parameters: [equipmentIdParameter],
            responses: successResponse("Review summary generated successfully."),
        },
    },
    "/equipment/{id}/review-summary/visibility": {
        patch: {
            summary: "Set review summary visibility",
            tags: ["Equipment"],
            parameters: [equipmentIdParameter],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["visible"],
                properties: {
                    visible: {
                        type: "boolean",
                        example: true,
                    },
                },
            }),
            responses: successResponse("Review summary visibility updated successfully."),
        },
    },
    "/equipment/{id}/approve": {
        patch: {
            summary: "Approve an equipment listing",
            tags: ["Equipment"],
            parameters: [equipmentIdParameter],
            responses: successResponse("Equipment approved successfully."),
        },
    },
    "/equipment/{id}/reject": {
        patch: {
            summary: "Reject an equipment listing",
            tags: ["Equipment"],
            parameters: [equipmentIdParameter],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["reason"],
                properties: {
                    reason: {
                        type: "string",
                        minLength: 5,
                        maxLength: 200,
                    },
                },
            }),
            responses: successResponse("Equipment rejected successfully."),
        },
    },
    "/equipment/{id}/reviews": {
        get: {
            summary: "List reviews for an equipment listing",
            tags: ["Equipment"],
            parameters: [equipmentIdParameter],
            responses: successResponse("Equipment reviews fetched successfully."),
        },
        post: {
            summary: "Create a review for an equipment listing",
            tags: ["Equipment"],
            parameters: [equipmentIdParameter],
            requestBody: multipartRequestBody({
                type: "object",
                required: ["rating", "title", "description"],
                properties: {
                    rating: {
                        type: "integer",
                        minimum: 1,
                        maximum: 5,
                    },
                    title: {
                        type: "string",
                        minLength: 2,
                        maxLength: 120,
                    },
                    description: {
                        type: "string",
                        minLength: 10,
                        maxLength: 2000,
                    },
                    photos: {
                        type: "array",
                        items: {
                            type: "string",
                            format: "binary",
                        },
                    },
                },
            }),
            responses: successResponse("Equipment review created successfully."),
        },
    },
    "/equipment/{id}/reviews/me": {
        patch: {
            summary: "Update the current user's review",
            tags: ["Equipment"],
            parameters: [equipmentIdParameter],
            requestBody: multipartRequestBody({
                type: "object",
                required: ["rating", "title", "description"],
                properties: {
                    rating: {
                        type: "integer",
                        minimum: 1,
                        maximum: 5,
                    },
                    title: {
                        type: "string",
                        minLength: 2,
                        maxLength: 120,
                    },
                    description: {
                        type: "string",
                        minLength: 10,
                        maxLength: 2000,
                    },
                    retainedPhotoIds: {
                        oneOf: [
                            { type: "string" },
                            { type: "array", items: { type: "string" } },
                        ],
                    },
                    photos: {
                        type: "array",
                        items: {
                            type: "string",
                            format: "binary",
                        },
                    },
                },
            }),
            responses: successResponse("Equipment review updated successfully."),
        },
    },
    "/notifications/me": {
        get: {
            summary: "List the current user's notifications",
            tags: ["Notifications"],
            parameters: paginationParameters,
            responses: successResponse("Notifications fetched successfully."),
        },
    },
    "/notifications/read-all": {
        patch: {
            summary: "Mark all notifications as read",
            tags: ["Notifications"],
            responses: successResponse("All notifications marked as read."),
        },
    },
    "/notifications/{id}/read": {
        patch: {
            summary: "Mark one notification as read",
            tags: ["Notifications"],
            parameters: [notificationIdParameter],
            responses: successResponse("Notification marked as read."),
        },
    },
    "/payments/cashfree/webhook": {
        post: {
            summary: "Process a Cashfree webhook event",
            tags: ["Payments"],
            requestBody: jsonRequestBody({
                type: "object",
                additionalProperties: true,
            }),
            responses: successResponse("Webhook processed successfully."),
        },
    },
    "/payments/admin/events": {
        get: {
            summary: "List Cashfree webhook events for admin",
            tags: ["Payments"],
            parameters: [
                ...paginationParameters,
                queryParameter("search", "Search text.", {
                    type: "string",
                    maxLength: 120,
                }),
                queryParameter("eventType", "Webhook event type.", {
                    type: "string",
                    maxLength: 120,
                }),
                queryParameter("status", "Processing status filter.", {
                    type: "string",
                    enum: ["ALL", "processed", "unprocessed", "unmatched"],
                }),
                queryParameter("linkState", "Link state filter.", {
                    type: "string",
                    enum: ["ALL", "LINKED", "UNLINKED"],
                }),
            ],
            responses: successResponse("Admin payment events fetched successfully."),
        },
    },
    "/support-queries/": {
        get: {
            summary: "List support queries for admin",
            tags: ["Support Queries"],
            parameters: [
                ...paginationParameters,
                queryParameter("search", "Search text.", {
                    type: "string",
                    maxLength: 100,
                }),
                queryParameter("role", "User role filter.", {
                    type: "string",
                    enum: ["ALL", "OWNER", "RENTER"],
                }),
                queryParameter("topic", "Support topic filter.", {
                    type: "string",
                    enum: [
                        "ALL",
                        "GENERAL_INQUIRY",
                        "LISTING_HELP",
                        "RENTAL_HELP",
                        "PAYMENT_HELP",
                        "ACCOUNT_HELP",
                    ],
                }),
            ],
            responses: successResponse("Support queries fetched successfully."),
        },
        post: {
            summary: "Create a support query",
            tags: ["Support Queries"],
            requestBody: jsonRequestBody({
                type: "object",
                required: ["topic", "message"],
                properties: {
                    topic: {
                        type: "string",
                        enum: [
                            "GENERAL_INQUIRY",
                            "LISTING_HELP",
                            "RENTAL_HELP",
                            "PAYMENT_HELP",
                            "ACCOUNT_HELP",
                        ],
                    },
                    message: {
                        type: "string",
                        minLength: 12,
                        maxLength: 2000,
                    },
                },
            }),
            responses: successResponse("Support query created successfully."),
        },
    },
    "/support-queries/{id}": {
        delete: {
            summary: "Resolve or delete a support query",
            tags: ["Support Queries"],
            parameters: [supportQueryIdParameter],
            responses: successResponse("Support query resolved successfully."),
        },
    },
    "/wishlists/mine": {
        get: {
            summary: "List the current renter's wishlist",
            tags: ["Wishlists"],
            responses: successResponse("Wishlist fetched successfully."),
        },
    },
    "/wishlists/{equipmentId}": {
        post: {
            summary: "Add an equipment listing to the wishlist",
            tags: ["Wishlists"],
            parameters: [wishlistEquipmentIdParameter],
            responses: successResponse("Wishlist item added successfully."),
        },
        delete: {
            summary: "Remove an equipment listing from the wishlist",
            tags: ["Wishlists"],
            parameters: [wishlistEquipmentIdParameter],
            responses: successResponse("Wishlist item removed successfully."),
        },
    },
};

function mergePathItems(
    base: Record<string, OpenApiPathItem>,
    overrides: Record<string, OpenApiPathItem>,
) {
    const merged: Record<string, OpenApiPathItem> = { ...base };

    for (const [path, operations] of Object.entries(overrides)) {
        merged[path] ??= {};

        for (const [method, operation] of Object.entries(operations)) {
            merged[path][method] = {
                ...(merged[path][method] ?? {}),
                ...operation,
            };
        }
    }

    return merged;
}

const swaggerPaths = mergePathItems({
    "/": {
        get: {
            summary: "Health check",
            tags: ["Health"],
            responses: {
                200: {
                    description: "Server is healthy",
                },
            },
        },
    },
    ...routeSections.reduce<Record<string, OpenApiPathItem>>((paths, section) => {
        return {
            ...paths,
            ...collectRouterPaths(section.basePath, section.tag, section.router),
        };
    }, {}),
}, allOperationOverrides);

export const swaggerSpec = {
    openapi: "3.0.0",
    info: {
        title: "Rentmart Server Docs",
        version: "1.0.0",
        description: "Automated Swagger Documentation for Testing APIs",
    },
    servers: [
        {
            url:
                process.env.NODE_ENV === "development"
                    ? "http://localhost:8080"
                    : "https://rentmart-server.onrender.com",
            description:
                process.env.NODE_ENV === "development"
                    ? "Development server"
                    : "Production Server",
        },
    ],
    tags: [
        {
            name: "Health",
            description: "Basic server status and readiness endpoints.",
        },
        ...routeSections.map((section) => ({
            name: section.tag,
            description: section.description,
        })),
    ],
    paths: swaggerPaths,
};
