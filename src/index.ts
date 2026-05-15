import cookieParser from "cookie-parser";
import express, { type Request, type Response } from "express";
import { authRouter } from "./routes/auth.routes";
import { bookingRouter } from "./routes/booking.routes";
import { categoryRouter } from "./routes/category.routes";
import { equipmentRouter } from "./routes/equipment.routes";
import { notificationRouter } from "./routes/notification.routes";
import { paymentRouter } from "./routes/payment.routes";
import { supportQueryRouter } from "./routes/support-query.routes";
import { wishlistRouter } from "./routes/wishlist.routes";

const app = express();
const port = 8080;

app.use("/payments/razorpay/webhook", express.raw({ type: "*/*" }));
app.use(express.json());
app.use(cookieParser());

app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Hello from Bun + Express + TypeScript!" });
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
  console.log(`Listening on http://localhost:${port}...`);
});
