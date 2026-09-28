import { z } from "zod";
import { InfraiMailClient } from "./infrai_mail_client.js";

export const checkoutMailRequestSchema = z.object({
  requestId: z.string().min(8).max(100),
  domain: z.string().min(3).max(253),
  mxRecords: z.array(z.object({
    content: z.string().min(3),
    priority: z.number().int().min(0).max(65535)
  })).min(1).max(5),
  payment: z.object({
    orderId: z.string().min(1),
    amountMinor: z.number().int().positive(),
    currency: z.string().length(3),
    status: z.enum(["authorized", "captured", "failed"]),
    riskScore: z.number().int().min(0).max(100)
  })
});

export type CheckoutMailRequest = z.infer<typeof checkoutMailRequestSchema>;
export type PaymentAction = "notify_customer" | "hold_for_review" | "record_only";

export function decidePaymentAction(payment: CheckoutMailRequest["payment"]): PaymentAction {
  if (payment.status === "failed") return "record_only";
  if (payment.riskScore >= 80) return "hold_for_review";
  return "notify_customer";
}

export async function configureCheckoutMail(
  client: InfraiMailClient,
  input: CheckoutMailRequest
) {
  const zoneId = await client.addDnsDomain(input.domain, input.requestId);
  const records = [...input.mxRecords].sort((a, b) => a.priority - b.priority);

  for (const record of records) {
    await client.upsertMxRecord({
      zoneId,
      name: input.domain,
      content: record.content,
      priority: record.priority,
      requestId: input.requestId
    });
  }

  const action = decidePaymentAction(input.payment);
  const configuredSendingDomains = await client.listSendingDomains();
  return {
    zoneId,
    mxPriorities: records.map((record) => record.priority),
    paymentAction: action,
    auditNotification: {
      event: "payment_action_decided",
      orderId: input.payment.orderId,
      action,
      riskScore: input.payment.riskScore,
      requestId: input.requestId
    },
    configuredSendingDomains
  };
}
