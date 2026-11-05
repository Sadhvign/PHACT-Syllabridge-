import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { PhactConfig } from "./config.js";

export const FACULTY_GROUP = "faculty";
export const ADMIN_GROUP = "aspph-admin";

export interface AuthStackProps extends StackProps {
  config: PhactConfig;
}

export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const { config } = props;

    // Hackathon build is standalone: users are provisioned by admins, not self-registered.
    // A MyASPPH OIDC/SAML provider can be federated into this pool later.
    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `phact-${config.stage}-users`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: false, mutable: true },
        familyName: { required: false, mutable: true },
      },
      customAttributes: {
        institution: new cognito.StringAttribute({ mutable: true, maxLen: 256 }),
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      deletionProtection: config.stage === "prod",
      removalPolicy: config.removalPolicy,
    });

    new cognito.CfnUserPoolGroup(this, "FacultyGroup", {
      userPoolId: this.userPool.userPoolId,
      groupName: FACULTY_GROUP,
      description: "Faculty at ASPPH member schools and programs",
      precedence: 10,
    });
    new cognito.CfnUserPoolGroup(this, "AdminGroup", {
      userPoolId: this.userPool.userPoolId,
      groupName: ADMIN_GROUP,
      description: "ASPPH staff who govern knowledge sources and community content",
      precedence: 1,
    });

    this.userPoolClient = this.userPool.addClient("WebClient", {
      userPoolClientName: `phact-${config.stage}-web`,
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(1),
      enableTokenRevocation: true,
    });

    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
  }
}
