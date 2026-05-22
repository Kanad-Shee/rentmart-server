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

const app = express();
const port = 8080;

app.use("/payments/cashfree/webhook", express.raw({ type: "*/*" }));
app.use(express.json());
app.use(cookieParser());

app.get("/", (req: Request, res: Response) => {
  res.json({ success: true, message: "Server is healthy and running fine!" });
});

app.use("/auth", authRouter);
app.use("/bookings", bookingRouter);
app.use("/categories", categoryRouter);
app.use("/equipment", equipmentRouter);
app.use("/notifications", notificationRouter);
app.use("/payments", paymentRouter);
app.use("/support-queries", supportQueryRouter);
app.use("/wishlists", wishlistRouter);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
