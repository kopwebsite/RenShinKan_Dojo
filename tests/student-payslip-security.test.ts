import { describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../functions/api/records/payment-proofs/[id]";

function environment(dojoId: string) {
  const bucketGet = vi.fn(async () => ({
    body: "private payslip",
    httpEtag: '"test-etag"',
  }));
  const db = {
    prepare(query: string) {
      return {
        bind() {
          return {
            async first<T>() {
              if (query.includes("FROM students")) return {
                id: "student-1", public_student_id: dojoId === "dojo-rsk" ? "RSK-6901" : "CMU-6901",
                display_name: "Test Student", dojo_id: dojoId,
              } as T;
              if (query.includes("FROM student_access_sessions")) return { id: "access-1" } as T;
              if (query.includes("FROM payment_proofs")) return {
                id: "proof-12345678", payment_type: "renshinkan_monthly", object_key: "payment-proofs/test.jpg",
                content_type: "image/jpeg", original_filename: "payslip.jpg",
              } as T;
              return null;
            },
            async run() { return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
  return { env: { STUDENT_DB: db, MEDIA_BUCKET: { get: bucketGet } }, bucketGet };
}

function request(studentId: string) {
  return new Request("https://renshinkandojo.org/api/records/payment-proofs/proof-12345678", {
    headers: {
      Origin: "https://renshinkandojo.org",
      Authorization: `Bearer ${"a".repeat(48)}`,
      "X-Student-ID": studentId,
    },
  });
}

describe("student payslip file authorization", () => {
  it("never serves RenShinKan monthly payslips to a student from another dojo", async () => {
    const { env, bucketGet } = environment("dojo-cmu");
    const response = await onRequestGet({ request: request("CMU-6901"), env, params: { id: "proof-12345678" } } as never);
    expect(response.status).toBe(404);
    expect(bucketGet).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: "This payslip is unavailable." });
  });

  it("serves an owned RenShinKan payslip through the authenticated private route", async () => {
    const { env, bucketGet } = environment("dojo-rsk");
    const response = await onRequestGet({ request: request("RSK-6901"), env, params: { id: "proof-12345678" } } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(bucketGet).toHaveBeenCalledOnce();
  });
});
