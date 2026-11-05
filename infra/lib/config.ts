import { RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface PhactConfig {
  /** Deployment stage, e.g. "dev" or "prod". Prefixes every stack and named resource. */
  stage: string;
  /** Browser origins allowed to call the API and to PUT/GET presigned S3 URLs. */
  allowedOrigins: string[];
  /** Non-prod stages delete data on stack removal so environments can be torn down cleanly. */
  removalPolicy: RemovalPolicy;
  autoDeleteObjects: boolean;
}

export function loadConfig(scope: Construct): PhactConfig {
  const stage = String(scope.node.tryGetContext("stage") ?? "dev");
  const allowedOrigins = scope.node.tryGetContext("allowedOrigins") as
    | string[]
    | undefined;
  const isProd = stage === "prod";

  return {
    stage,
    allowedOrigins: allowedOrigins ?? ["http://localhost:5173"],
    removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    autoDeleteObjects: !isProd,
  };
}
