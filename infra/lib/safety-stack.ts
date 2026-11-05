import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import { Construct } from "constructs";
import { PhactConfig } from "./config.js";

export interface SafetyStackProps extends StackProps {
  config: PhactConfig;
}

const BLOCKED_MESSAGE =
  "PHACT can only analyze course syllabi and curriculum material. Please check the text and try again.";

// Public health courses legitimately discuss violence, sexual health, and substance use,
// so those filters stay at LOW and only block clearly harmful content.
const CONTENT_FILTERS: bedrock.CfnGuardrail.ContentFilterConfigProperty[] = [
  { type: "HATE", inputStrength: "MEDIUM", outputStrength: "MEDIUM" },
  { type: "INSULTS", inputStrength: "MEDIUM", outputStrength: "MEDIUM" },
  { type: "SEXUAL", inputStrength: "LOW", outputStrength: "LOW" },
  { type: "VIOLENCE", inputStrength: "LOW", outputStrength: "LOW" },
  { type: "MISCONDUCT", inputStrength: "LOW", outputStrength: "LOW" },
  { type: "PROMPT_ATTACK", inputStrength: "HIGH", outputStrength: "NONE" },
];

const DENIED_TOPICS: bedrock.CfnGuardrail.TopicConfigProperty[] = [
  {
    name: "Off-topic content",
    type: "DENY",
    // Topic definitions must describe what to block; negated definitions match everything.
    definition:
      "Cooking recipes, product advertisements and sales promotions, sports scores, celebrity or entertainment gossip, and casual personal chat.",
    examples: [
      "Preheat the oven to 350 degrees and mix the flour with two eggs.",
      "Buy one get one free on all running shoes this weekend only.",
      "Who won the football game last night?",
    ],
  },
  {
    name: "Individual medical advice",
    type: "DENY",
    definition:
      "Requests for a diagnosis, treatment plan, or medication dosage for a specific individual person.",
    examples: [
      "What dose of amoxicillin should I give my 4 year old son?",
      "I have chest pain and a fever, what disease do I have?",
    ],
  },
  {
    name: "Academic dishonesty",
    type: "DENY",
    definition:
      "Requests to complete a student's graded work for them, impersonate a student, or evade plagiarism or AI-use detection.",
    examples: [
      "Write my final exam answers so I can submit them as my own.",
      "Rewrite this essay so the plagiarism checker will not detect it.",
    ],
  },
];

export class SafetyStack extends Stack {
  constructor(scope: Construct, id: string, props: SafetyStackProps) {
    super(scope, id, props);
    const { config } = props;

    // Applied to syllabus text before any model call. Not attached to agent output.
    const guardrail = new bedrock.CfnGuardrail(this, "InputGuardrail", {
      name: `phact-${config.stage}-input`,
      description: "Screens faculty-submitted syllabus text before AI analysis",
      blockedInputMessaging: BLOCKED_MESSAGE,
      blockedOutputsMessaging: BLOCKED_MESSAGE,
      contentPolicyConfig: { filtersConfig: CONTENT_FILTERS },
      topicPolicyConfig: { topicsConfig: DENIED_TOPICS },
    });

    // Guardrail versions are immutable; a policy change needs a new version resource.
    const version = new bedrock.CfnGuardrailVersion(this, "InputGuardrailVersion2", {
      guardrailIdentifier: guardrail.attrGuardrailId,
      description: "Input screening v2: positively defined off-topic policy",
    });

    new CfnOutput(this, "GuardrailId", { value: guardrail.attrGuardrailId });
    new CfnOutput(this, "GuardrailVersion", { value: version.attrVersion });
  }
}
