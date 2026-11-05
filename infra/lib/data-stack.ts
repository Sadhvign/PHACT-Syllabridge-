import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { PhactConfig } from "./config.js";

export interface DataStackProps extends StackProps {
  config: PhactConfig;
}

export class DataStack extends Stack {
  readonly key: kms.Key;
  readonly knowledgeBucket: s3.Bucket;
  readonly uploadsBucket: s3.Bucket;
  readonly exportsBucket: s3.Bucket;
  readonly communityBucket: s3.Bucket;
  readonly syllabiTable: dynamodb.Table;
  readonly analysesTable: dynamodb.Table;
  readonly sourcesTable: dynamodb.Table;
  readonly communityTable: dynamodb.Table;
  readonly feedbackTable: dynamodb.Table;
  readonly auditTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.key = new kms.Key(this, "DataKey", {
      alias: `alias/phact-${config.stage}-data`,
      description: "Encrypts PHACT buckets and tables",
      enableKeyRotation: true,
      removalPolicy: config.removalPolicy,
    });

    const browserCors: s3.CorsRule[] = [
      {
        allowedOrigins: config.allowedOrigins,
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
        allowedHeaders: ["*"],
        exposedHeaders: ["ETag"],
        maxAge: 3000,
      },
    ];

    const bucket = (id: string, extra: Partial<s3.BucketProps> = {}) =>
      new s3.Bucket(this, id, {
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: this.key,
        bucketKeyEnabled: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
        removalPolicy: config.removalPolicy,
        autoDeleteObjects: config.autoDeleteObjects,
        ...extra,
      });

    // Approved ASPPH sources that ground the knowledge base. Never holds user uploads.
    this.knowledgeBucket = bucket("KnowledgeBucket", { versioned: true, cors: browserCors });
    // Private per-user syllabus uploads under users/{userId}/.
    this.uploadsBucket = bucket("UploadsBucket", {
      cors: browserCors,
      lifecycleRules: [
        { abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
    });
    this.exportsBucket = bucket("ExportsBucket", {
      cors: browserCors,
      lifecycleRules: [{ expiration: Duration.days(7) }],
    });
    // Opt-in shared repository open to all member institutions.
    this.communityBucket = bucket("CommunityBucket", { versioned: true });

    const table = (id: string, partitionKey: string, sortKey?: string) =>
      new dynamodb.Table(this, id, {
        partitionKey: { name: partitionKey, type: dynamodb.AttributeType.STRING },
        sortKey: sortKey
          ? { name: sortKey, type: dynamodb.AttributeType.STRING }
          : undefined,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
        encryptionKey: this.key,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
        removalPolicy: config.removalPolicy,
      });

    this.syllabiTable = table("SyllabiTable", "userId", "syllabusId");
    this.analysesTable = table("AnalysesTable", "userId", "analysisId");
    this.sourcesTable = table("SourcesTable", "sourceId");
    // Shares and repository submissions. groupKey lists them per university or recipient inbox.
    this.communityTable = table("CommunityTable", "itemId");
    this.communityTable.addGlobalSecondaryIndex({
      indexName: "byGroup",
      partitionKey: { name: "groupKey", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });
    this.feedbackTable = table("FeedbackTable", "userId", "feedbackId");
    // Review decisions and source changes; holds identifiers only, never syllabus text.
    this.auditTable = table("AuditTable", "scope", "eventId");

    const outputs: Record<string, string> = {
      DataKeyArn: this.key.keyArn,
      KnowledgeBucketName: this.knowledgeBucket.bucketName,
      UploadsBucketName: this.uploadsBucket.bucketName,
      ExportsBucketName: this.exportsBucket.bucketName,
      CommunityBucketName: this.communityBucket.bucketName,
      SyllabiTableName: this.syllabiTable.tableName,
      AnalysesTableName: this.analysesTable.tableName,
      SourcesTableName: this.sourcesTable.tableName,
      CommunityTableName: this.communityTable.tableName,
      FeedbackTableName: this.feedbackTable.tableName,
      AuditTableName: this.auditTable.tableName,
    };
    for (const [name, value] of Object.entries(outputs)) {
      new CfnOutput(this, name, { value });
    }
  }
}
