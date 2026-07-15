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

const swaggerPaths = {
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
};

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