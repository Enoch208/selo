import { createHash } from "node:crypto";
import { z } from "zod";

export const releases = ["broken-v1", "fixed-v2"] as const;
export type Release = (typeof releases)[number];

export const orderSchema = z.strictObject({
  sku: z.string().regex(/^[a-z0-9-]{1,40}$/),
  quantity: z.number().int().min(1).max(10),
});
export type Order = z.infer<typeof orderSchema>;

export const exampleOrder: Order = { sku: "demo-widget", quantity: 1 };

export const orderInputSchema = {
  type: "object",
  required: ["sku", "quantity"],
  properties: {
    sku: { type: "string", pattern: "^[a-z0-9-]{1,40}$" },
    quantity: { type: "integer", minimum: 1, maximum: 10 },
  },
  additionalProperties: false,
};

export const receiptSchema = {
  type: "object",
  required: ["orderId", "receiptId", "fulfilled"],
  properties: {
    orderId: { type: "string", pattern: "^ord_[0-9a-f]{24}$" },
    receiptId: { type: "string", pattern: "^rcpt_[0-9a-f]{24}$" },
    fulfilled: { const: true },
  },
};

export const exampleReceipt = {
  orderId: "ord_3f9a1c2e7b4d5a6f8e0b1c2d",
  receiptId: "rcpt_9b8a7c6d5e4f3a2b1c0d9e8f",
  sku: exampleOrder.sku,
  quantity: exampleOrder.quantity,
  fulfilled: true,
};

const idFor = (prefix: string, paymentSignature: string): string =>
  `${prefix}_${createHash("sha256").update(`${prefix}:${paymentSignature}`).digest("hex").slice(0, 24)}`;

export function fulfil(release: Release, order: Order, paymentSignature: string) {
  const orderId = idFor("ord", paymentSignature);
  const receiptId = idFor("rcpt", paymentSignature);
  const { sku, quantity } = order;
  if (release === "broken-v1") {
    return { orderId, receipt_id: receiptId, sku, quantity, fulfilled: true, release };
  }
  return { orderId, receiptId, sku, quantity, fulfilled: true, release };
}
