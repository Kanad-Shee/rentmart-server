import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const db = new PrismaClient({ adapter });

export { db };

export async function initializeDatabase(): Promise<{
  status: string;
  connected: boolean;
}> {
  try {
    await db.$queryRaw`SELECT 1`;
    return {
      status: "Connected to PostgreSQL database",
      connected: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: `Failed to connect to database: ${errorMessage}`,
      connected: false,
    };
  }
}
