import { App, Tags } from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack.js";
import { loadConfig } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { KnowledgeStack } from "../lib/knowledge-stack.js";
import { ObservabilityStack } from "../lib/observability-stack.js";
import { SafetyStack } from "../lib/safety-stack.js";

const app = new App();
const config = loadConfig(app);

// Region is a deployment parameter so a second regional cell can be added later.
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};
const prefix = `Phact-${config.stage}`;

const data = new DataStack(app, `${prefix}-Data`, { env, config });
new AuthStack(app, `${prefix}-Auth`, { env, config });
new SafetyStack(app, `${prefix}-Safety`, { env, config });
new KnowledgeStack(app, `${prefix}-Knowledge`, {
  env,
  config,
  knowledgeBucket: data.knowledgeBucket,
  key: data.key,
});
new ObservabilityStack(app, `${prefix}-Observability`, { env, config });

Tags.of(app).add("project", "phact");
Tags.of(app).add("stage", config.stage);
