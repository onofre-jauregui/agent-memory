/**
 * A neutral, append-only log of decisions the guardrail layer made. Useful
 * for after-the-fact audits without coupling to any specific datastore.
 */

export type ComplianceSeverity = "info" | "warning" | "error" | "critical";

export interface ComplianceEvent {
  event_type: string;
  severity: ComplianceSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface ComplianceSink {
  log(event: ComplianceEvent): Promise<void> | void;
}

/** Build a well-formed event without persisting it. */
export function buildEvent(
  event_type: string,
  severity: ComplianceSeverity,
  message: string,
  metadata?: Record<string, unknown>
): ComplianceEvent {
  return {
    event_type,
    severity,
    message,
    metadata,
    timestamp: new Date().toISOString(),
  };
}
