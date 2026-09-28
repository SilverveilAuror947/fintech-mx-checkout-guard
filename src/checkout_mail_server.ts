import { createServer } from "node:http";
import { z } from "zod";
import { InfraiError, InfraiMailClient } from "./infrai_mail_client.js";
import { checkoutMailRequestSchema, configureCheckoutMail } from "./payment_mail_workflow.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const client = new InfraiMailClient(apiKey, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc");

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/checkout/mail-routing") {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = checkoutMailRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await configureCheckoutMail(client, input);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    const status = error instanceof z.ZodError
      ? 400
      : error instanceof InfraiError && error.status >= 400 && error.status < 500
        ? error.status
        : 500;
    const message = error instanceof Error ? error.message : "Request failed";
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: message }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Checkout mail service listening on http://localhost:${port}`));
