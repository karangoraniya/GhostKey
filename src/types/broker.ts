export const githubActions = ["github.repo.read", "github.issue.create"] as const;
export type GitHubAction = typeof githubActions[number];
export type GhostIdentity = { id: string; name: string; createdAt: string; expiresAt: string };
export type Repository = { owner: string; repo: string };
export const awsActions = ["aws.s3.list", "aws.s3.read"] as const;
export const awsForbiddenActions = ["aws.s3.write", "aws.s3.delete"] as const;
export type AwsAction = typeof awsActions[number];
export type AwsCapability = {
  id: string; ghostId: string; provider: "aws"; resource: { service: "s3"; bucket: string };
  actions: AwsAction[]; createdAt: string; expiresAt: string;
  risk?: never; source?: never; approvalId?: never;
};
export type Capability = GitHubCapability | AwsCapability;
export type GitHubCapability = {
  id: string; ghostId: string; provider: "github"; resource: Repository;
  actions: (GitHubAction | "github.admin.write")[]; createdAt: string; expiresAt: string;
  risk?: "HIGH"; source?: "ledger-hardware-approval"; approvalId?: string;
};
