import assert from "node:assert/strict";
import test from "node:test";
import { decidePaymentAction } from "../src/payment_mail_workflow.js";

test("a captured high-risk checkout is held for review", () => {
  const action = decidePaymentAction({
    orderId: "order_1042",
    amountMinor: 15900,
    currency: "USD",
    status: "captured",
    riskScore: 86
  });

  assert.equal(action, "hold_for_review");
});

test("a failed payment is recorded without a customer notification", () => {
  const action = decidePaymentAction({
    orderId: "order_1043",
    amountMinor: 4900,
    currency: "USD",
    status: "failed",
    riskScore: 12
  });

  assert.equal(action, "record_only");
});
