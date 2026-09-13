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
export type CustomAction = `custom.read.${string}`;
export type CustomCapability = {
  id: string; ghostId: string; provider: "custom"; resource: { connectionId: string };
  actions: CustomAction[]; createdAt: string; expiresAt: string;
  risk?: never; source?: never; approvalId?: never;
};
export type Web3Resource = { walletId: string; chainId: 11155111; recipient: string; maxValueWei: string; budgetWei: string };
export type Web3Action = "web3.balance.read" | "web3.transfer";
export type Web3Capability = { id: string; ghostId: string; provider: "web3"; resource: Web3Resource; actions: Web3Action[]; createdAt: string; expiresAt: string; risk?: never; source?: never; approvalId?: never };
export type Capability = GitHubCapability | AwsCapability | CustomCapability | Web3Capability;
export type GitHubCapability = {
  id: string; ghostId: string; provider: "github"; resource: Repository;
  actions: (GitHubAction | "github.admin.write")[]; createdAt: string; expiresAt: string;
  risk?: "HIGH"; source?: "ledger-hardware-approval"; approvalId?: string;
};
