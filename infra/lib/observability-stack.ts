import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { PhactConfig } from "./config.js";

export interface ObservabilityStackProps extends StackProps {
  config: PhactConfig;
}

/**
 * CloudWatch log group + alarms for PHACT API/agent EMF metrics.
 * App logs must never include syllabus text, prompts, or Guardrail assessments —
 * only IDs, codes, counts, and durations (see backend app/observability.py).
 */
export class ObservabilityStack extends Stack {
  readonly apiLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { config } = props;
    const ns = "PHACT";

    this.apiLogGroup = new logs.LogGroup(this, "ApiLogGroup", {
      logGroupName: `/aws/phact/${config.stage}/api`,
      retention: config.stage === "prod" ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
      removalPolicy: config.removalPolicy,
    });

    const http5xx = new cloudwatch.Metric({
      namespace: ns,
      metricName: "Http5xx",
      statistic: "Sum",
      period: Duration.minutes(5),
    });
    const workerCrash = new cloudwatch.Metric({
      namespace: ns,
      metricName: "WorkerCrash",
      statistic: "Sum",
      period: Duration.minutes(5),
    });
    const analysisFailed = new cloudwatch.Metric({
      namespace: ns,
      metricName: "AnalysisFinished",
      dimensionsMap: { Status: "FAILED" },
      statistic: "Sum",
      period: Duration.minutes(15),
    });
    const guardrailBlocked = new cloudwatch.Metric({
      namespace: ns,
      metricName: "InputBlocked",
      statistic: "Sum",
      period: Duration.minutes(15),
    });
    const bedrockErrors = new cloudwatch.Metric({
      namespace: ns,
      metricName: "BedrockInvoke",
      dimensionsMap: { Result: "error" },
      statistic: "Sum",
      period: Duration.minutes(5),
    });

    new cloudwatch.Alarm(this, "Http5xxAlarm", {
      alarmName: `phact-${config.stage}-http-5xx`,
      alarmDescription: "PHACT API 5xx responses elevated",
      metric: http5xx,
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, "WorkerCrashAlarm", {
      alarmName: `phact-${config.stage}-worker-crash`,
      alarmDescription: "PHACT analysis worker crashed",
      metric: workerCrash,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, "AnalysisFailedAlarm", {
      alarmName: `phact-${config.stage}-analysis-failed`,
      alarmDescription: "PHACT analyses finishing as FAILED",
      metric: analysisFailed,
      threshold: 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, "BedrockErrorAlarm", {
      alarmName: `phact-${config.stage}-bedrock-errors`,
      alarmDescription: "Bedrock invoke errors for PHACT agents",
      metric: bedrockErrors,
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const dashboard = new cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: `phact-${config.stage}-ops`,
    });
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "HTTP requests (by status class)",
        left: [
          new cloudwatch.Metric({
            namespace: ns,
            metricName: "HttpRequest",
            statistic: "Sum",
            period: Duration.minutes(5),
          }),
          http5xx,
        ],
      }),
      new cloudwatch.GraphWidget({
        title: "Agent / Bedrock",
        left: [
          new cloudwatch.Metric({
            namespace: ns,
            metricName: "BedrockInvoke",
            statistic: "Sum",
            period: Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: ns,
            metricName: "BedrockLatency",
            statistic: "p95",
            period: Duration.minutes(5),
          }),
          bedrockErrors,
        ],
      }),
      new cloudwatch.GraphWidget({
        title: "Safety (codes only — no content)",
        left: [
          new cloudwatch.Metric({
            namespace: ns,
            metricName: "GuardrailDecision",
            statistic: "Sum",
            period: Duration.minutes(5),
          }),
          guardrailBlocked,
          new cloudwatch.Metric({
            namespace: ns,
            metricName: "PiiScrub",
            statistic: "Sum",
            period: Duration.minutes(5),
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: "Analysis lifecycle",
        left: [
          new cloudwatch.Metric({
            namespace: ns,
            metricName: "AnalysisQueued",
            statistic: "Sum",
            period: Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: ns,
            metricName: "AnalysisFinished",
            statistic: "Sum",
            period: Duration.minutes(5),
          }),
          analysisFailed,
          workerCrash,
        ],
      }),
    );

    new CfnOutput(this, "ApiLogGroupName", { value: this.apiLogGroup.logGroupName });
    new CfnOutput(this, "OpsDashboardName", { value: dashboard.dashboardName });
    new CfnOutput(this, "MetricNamespace", { value: ns });
  }
}
