import { cleanExpiredAuditRecords } from "../functions/_lib/auditRetention";
import type { D1Database } from "../functions/_lib/studentRecords";

type Env = { STUDENT_DB: D1Database };

export default {
  async scheduled(controller: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil(cleanExpiredAuditRecords(env.STUDENT_DB, {
      now: new Date(controller.scheduledTime),
      source: "scheduled_audit_cleanup",
      actorIdentifier: "audit_retention_worker",
      requestId: crypto.randomUUID(),
    }));
  },
};
