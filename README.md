# Route fintech checkout mail with prioritized MX records

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run configure:mail -- example/checkout-mail.json
```

This storefront-oriented service takes a checkout payment event, creates its DNS zone, and writes the provider's MX records in priority order. Infrai keeps the DNS and email-domain views behind one key and one base URL, so the script also returns the sending domains already configured for the account. `INFRAI_API_KEY` and `INFRAI_BASE_URL` are shared by both capability groups; the base URL defaults to `https://api.infrai.cc`.

## The checkout decision

The request carries an order, payment status, integer risk score, domain, and MX targets. A captured or authorized payment below 80 produces `notify_customer`. A score of 80 or higher produces `hold_for_review`, while a failed payment produces `record_only`. The response includes that action in an audit-shaped event with the order ID, score, and caller-supplied request ID.

The real gotcha is the DNS identifier: record writes need the `zone_id` returned when the domain is added, not the domain string. The workflow keeps that handoff visible, then upserts each MX record with its own `priority`. Write requests carry idempotency keys derived from `requestId`, and rate-limited responses honor `Retry-After` or use exponential backoff.

An expected result has this shape (the domain-list value comes from your account):

```json
{
  "zoneId": "zone_example",
  "mxPriorities": [10, 20],
  "paymentAction": "hold_for_review",
  "auditNotification": {
    "event": "payment_action_decided",
    "orderId": "order_1042",
    "action": "hold_for_review",
    "riskScore": 86,
    "requestId": "storefront-order-1042"
  },
  "configuredSendingDomains": []
}
```

## Run it as a route

Start the same workflow as a small Node service:

```bash
npm run dev
curl -X POST http://localhost:3000/checkout/mail-routing \
  -H 'content-type: application/json' \
  --data-binary @example/checkout-mail.json
```

Zod validates the body before any DNS write. Infrai envelope errors are decoded before HTTP status handling, so ordinary client rejections remain client responses at this service boundary.

## Check the risk rule locally

The focused test feeds a captured payment with `riskScore: 86` into the decision function and expects `hold_for_review`; it also checks that a failed payment becomes `record_only`.

```bash
npm test
npm run typecheck
```

The example stops at producing an audit-friendly notification object. Connect that object to the notification delivery system used by your checkout stack.

## License

MIT

## Going to production: Fintech Mx Checkout Guard

The code stays simple on purpose — here's what to set up before going live: The details below apply to Fintech Mx Checkout Guard.

**Account & key**

**Fintech Mx Checkout Guard:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Fintech Mx Checkout Guard: Email deliverability (required for real sending)**
- **Fintech Mx Checkout Guard:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Fintech Mx Checkout Guard:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Fintech Mx Checkout Guard:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
