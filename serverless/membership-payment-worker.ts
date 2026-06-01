import { handleMembershipSubmission, type MembershipEnv } from "../functions/_lib/membershipSubmission";

export default {
  async fetch(request: Request, env: MembershipEnv) {
    return handleMembershipSubmission(request, env);
  },
};
