/* eslint-disable no-console -- a command-line script reports to the terminal. */
/**
 * Creates every index the models declare. Run on each deploy, before the API
 * and worker start:  npm run db:indexes  (built: node dist/scripts/syncIndexes.js)
 * Existing indexes are left alone; nothing is dropped.
 */
import { connectDatabase, disconnectDatabase } from "../config/database";
import { createMissingIndexes, findMissingIndexes, loadAllModels } from "../config/indexes";

const main = async () => {
  loadAllModels();
  await connectDatabase();
  try {
    const before = await findMissingIndexes();
    for (const item of before)
      console.log(`Creating ${item.indexes.length} index(es) on ${item.model}`);
    await createMissingIndexes();
    const after = await findMissingIndexes();
    if (after.length > 0) {
      console.error("Some indexes still don't exist:", JSON.stringify(after));
      process.exitCode = 1;
      return;
    }
    console.log(before.length === 0 ? "All indexes already exist." : "Indexes created.");
  } finally {
    await disconnectDatabase();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
