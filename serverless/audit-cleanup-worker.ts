import { cleanExpiredAuditRecords } from "../functions/_lib/auditRetention";
import { scrubExpiredAdminAuggiePayloads } from "../functions/_lib/adminAuggie";
import type { D1Database } from "../functions/_lib/studentRecords";

type Env = { STUDENT_DB: D1Database };

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ) {
    const scheduledAt = new Date(controller.scheduledTime);
    context.waitUntil(
      Promise.all([
        cleanExpiredAuditRecords(env.STUDENT_DB, {
          now: scheduledAt,
          source: "scheduled_audit_cleanup",
          actorIdentifier: "audit_retention_worker",
          requestId: crypto.randomUUID(),
        }),
        scrubExpiredAdminAuggiePayloads(
          env.STUDENT_DB,
          scheduledAt.toISOString(),
          1_000,
        ),
      ]),
    );
  },
};
