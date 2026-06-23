export const up = async (db) => {
  const members = db.collection("members");
  await members.bulkWrite([
    { updateMany: { filter: { memberTerm: "life" }, update: { $set: { memberTerm: "Life" } } } },
    { updateMany: { filter: { memberTerm: "annual" }, update: { $set: { memberTerm: "Annual" } } } },
  ]);
  await members.updateMany(
    { memberStatus: "payment pending" },
    { $set: { memberStatus: "Payment pending" } },
  );
  await members.updateMany(
    { membershipType: { $exists: true }, membershipArrangement: { $exists: false } },
    { $rename: { membershipType: "membershipArrangement" } },
  );
  await members.updateMany(
    { membershipType: { $exists: true } },
    { $unset: { membershipType: "" } },
  );
};

export const down = async (db) => {
  const members = db.collection("members");
  await members.updateMany(
    { membershipArrangement: { $exists: true }, membershipType: { $exists: false } },
    { $rename: { membershipArrangement: "membershipType" } },
  );
  await members.updateMany(
    { memberStatus: "Payment pending" },
    { $set: { memberStatus: "payment pending" } },
  );
  await members.bulkWrite([
    { updateMany: { filter: { memberTerm: "Life" }, update: { $set: { memberTerm: "life" } } } },
    { updateMany: { filter: { memberTerm: "Annual" }, update: { $set: { memberTerm: "annual" } } } },
  ]);
};
