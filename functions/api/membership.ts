import { handleMembershipSubmission, type MembershipEnv } from "../_lib/membershipSubmission";

export async function onRequest({ request, env }: { request: Request; env: MembershipEnv }) {
  return handleMembershipSubmission(request, env);
}
