import cookieParser from "cookie-parser";
import express, { type Request, type Response } from "express";
import { authRouter } from "./routes/auth.routes.js";
import { bookingRouter } from "./routes/booking.routes.js";
import { categoryRouter } from "./routes/category.routes.js";
import { equipmentRouter } from "./routes/equipment.routes.js";
import { notificationRouter } from "./routes/notification.routes.js";
import { paymentRouter } from "./routes/payment.routes.js";
import { supportQueryRouter } from "./routes/support-query.routes.js";
import { wishlistRouter } from "./routes/wishlist.routes.js";
import { initializeMailer } from "./lib/brevo-mailer.js";
import { initializeDatabase } from "./lib/db.js";
import { logger } from "./lib/logger.js";
import { initializeRedis } from "./lib/redis.js";
import { requestLogger } from "./middlewares/request-logger.middleware.js";
import swaggerUI from "swagger-ui-express";
import { swaggerSpec } from "../swagger.js";

const app = express();
const port = Number(process.env.PORT || 8080);

app.use("/payments/cashfree/webhook", express.raw({ type: "*/*" }));
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);

app.get("/", (req: Request, res: Response) => {
  res.json({ success: true, message: "Server is healthy and running fine!" });
});

// swagger docs
app.use("/docs", swaggerUI.serve, swaggerUI.setup(swaggerSpec));

app.use("/auth", authRouter);
app.use("/bookings", bookingRouter);
app.use("/categories", categoryRouter);
app.use("/equipment", equipmentRouter);
app.use("/notifications", notificationRouter);
app.use("/payments", paymentRouter);
app.use("/support-queries", supportQueryRouter);
app.use("/wishlists", wishlistRouter);

app.listen(port, async () => {
  logger.info("RentMart server starting up", {
    service: "server",
    action: "startup",
    port,
  });

  const mailerStatus = initializeMailer();
  logger.info("Mailer initialization completed", {
    service: "server",
    action: "initializeMailer",
    initialized: mailerStatus.initialized,
    status: mailerStatus.status,
  });

  const dbStatus = await initializeDatabase();
  logger.info("Database initialization completed", {
    service: "server",
    action: "initializeDatabase",
    connected: dbStatus.connected,
    status: dbStatus.status,
  });

  const redisStatus = await initializeRedis();
  logger.info("Redis initialization completed", {
    service: "server",
    action: "initializeRedis",
    connected: redisStatus.connected,
    status: redisStatus.status,
  });

  logger.info("Server is running", {
    service: "server",
    action: "listen",
    port,
    environment: process.env.NODE_ENV || "development",
  });
});
