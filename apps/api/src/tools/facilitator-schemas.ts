import { z } from "zod";

const paginationSchema = z.looseObject({
  limit: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const resourceRecordSchema = z.looseObject({
  id: z.string(),
  resourceUrl: z.string(),
  method: z.string(),
  description: z.string().optional(),
  merchantId: z.string().optional(),
  accepts: z.array(z.unknown()),
  discoveryInfo: z.unknown().optional(),
  settleCount: z.number().optional(),
  firstSeen: z.string().optional(),
  lastSeen: z.string().optional(),
});

export const resourcesPageSchema = z.looseObject({
  items: z.array(resourceRecordSchema),
  pagination: paginationSchema,
});

export const merchantRecordSchema = z.looseObject({
  id: z.string(),
  addresses: z.record(z.string(), z.string()),
  resourceCount: z.number().optional(),
  totalSettlements: z.number().optional(),
  networks: z.array(z.string()).optional(),
  firstSeen: z.string().optional(),
  lastSeen: z.string().optional(),
});

export const merchantsPageSchema = z.looseObject({
  items: z.array(merchantRecordSchema),
  pagination: paginationSchema,
});

export const leaderboardRowSchema = z.looseObject({
  rank: z.number(),
  address: z.string(),
  label: z.string().nullable().optional(),
  sub: z.string().nullable().optional(),
  bazaar: z.boolean().optional(),
  challenge: z.boolean().optional(),
  blocked: z
    .looseObject({ reason: z.string().optional(), since: z.string().optional() })
    .optional(),
  volume: z.number(),
  settles: z.number(),
});

export const leaderboardPageSchema = z.looseObject({
  items: z.array(leaderboardRowSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative().optional(),
});

export type ResourceRecord = z.infer<typeof resourceRecordSchema>;
export type MerchantRecord = z.infer<typeof merchantRecordSchema>;
export type LeaderboardRow = z.infer<typeof leaderboardRowSchema>;
