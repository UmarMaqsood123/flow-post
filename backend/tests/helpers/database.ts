import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll } from "vitest";
import { mailOutbox } from "../../src/utils/mailer.util";

/** Registers hooks that run the suite against an isolated in-memory MongoDB. */
export const useTestDatabase = () => {
  let mongo: MongoMemoryServer | undefined;

  beforeAll(async () => {
    // First launch of a freshly downloaded mongod can be slow (e.g. macOS binary scanning).
    mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
    await mongoose.connect(mongo.getUri());
    // Build indexes (unique email, TTL) before tests rely on them.
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  });

  afterEach(async () => {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
    );
    mailOutbox.length = 0;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });
};
