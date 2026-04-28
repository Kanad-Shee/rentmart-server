import express, { type Request, type Response } from "express";

const app = express();
const port = 3000;

app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Hello from Bun + Express + TypeScript!" });
});

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}...`);
});
