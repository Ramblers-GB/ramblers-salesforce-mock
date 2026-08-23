export const up = async (db) => {
  const collections = await db.listCollections({ name: "scenarios" }).toArray();
  if (collections.length > 0) {
    await db.collection("scenarios").drop();
  }
};

export const down = async () => {
  // The incremental-delta scenario feature was removed with the legacy #209 model, so there is nothing to restore.
};
