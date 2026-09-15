import mongoose from "mongoose";
import { env, isProduction } from "./env";
import { logger } from "./logger";

mongoose.set("strictQuery", true);

const connection = mongoose.connection;

connection.on("connected", () => logger.info("MongoDB connected"));
connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
connection.on("reconnected", () => logger.info("MongoDB reconnected"));
connection.on("error", (error) => logger.error({ err: error }, "MongoDB connection error"));

export const connectDatabase = async (): Promise<void> => {
  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    // Build indexes automatically in dev; run index builds deliberately in production.
    autoIndex: !isProduction,
  });
};

export const disconnectDatabase = async (): Promise<void> => {
  if (connection.readyState !== mongoose.ConnectionStates.disconnected) {
    await connection.close();
    logger.info("MongoDB connection closed");
  }
};

export const isDatabaseHealthy = (): boolean =>
  connection.readyState === mongoose.ConnectionStates.connected;
