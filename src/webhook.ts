// stoa/src/webhook.ts — Webhook trigger handler
//
// Processes incoming webhook events and dispatches agents accordingly.
// In GitHub Actions, webhooks arrive via repository_dispatch events.

import { createLogger } from "./logger.js";
import { loadConfig } from "./config.js";
import { postMessage } from "./mesh.js";

const log = createLogger("webhook");

export interface WebhookEvent {
  source: string;
  event_type: string;
  payload: Record<string, unknown>;
  received_at: string;
}

export function processWebhook(event: WebhookEvent): string[] {
  const config = loadConfig();
  const triggered: string[] = [];

  log.info("Processing webhook", { source: event.source, type: event.event_type });

  for (const [agentName, agent] of Object.entries(config.agents)) {
    if (!agent.triggers) continue;

    for (const trigger of agent.triggers) {
      if (trigger.on !== "webhook") continue;

      // Match event type if specified
      if (trigger.type && trigger.type !== event.event_type) continue;

      // Dispatch via mesh message
      postMessage({
        from: "webhook",
        to: agentName,
        type: event.event_type,
        data: {
          source: event.source,
          payload: event.payload,
          received_at: event.received_at,
        },
      });

      triggered.push(agentName);
      log.info(`Webhook triggered agent: ${agentName}`, { event_type: event.event_type });
    }
  }

  return triggered;
}

export function createWebhookEvent(
  source: string,
  eventType: string,
  payload: Record<string, unknown>
): WebhookEvent {
  return {
    source,
    event_type: eventType,
    payload,
    received_at: new Date().toISOString(),
  };
}
