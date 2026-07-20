import type { PrismaClient } from "@wakyak/database";

export async function blockedProfileIds(
  database: PrismaClient,
  profileId: string,
): Promise<string[]> {
  const rows = await database.block.findMany({
    where: {
      OR: [{ blockerProfileId: profileId }, { blockedProfileId: profileId }],
    },
    select: { blockerProfileId: true, blockedProfileId: true },
  });
  return [
    ...new Set(
      rows.map((row) =>
        row.blockerProfileId === profileId
          ? row.blockedProfileId
          : row.blockerProfileId,
      ),
    ),
  ];
}

export async function profilesAreBlocked(
  database: PrismaClient,
  first: string,
  second: string,
): Promise<boolean> {
  return (
    (await database.block.count({
      where: {
        OR: [
          { blockerProfileId: first, blockedProfileId: second },
          { blockerProfileId: second, blockedProfileId: first },
        ],
      },
    })) > 0
  );
}
