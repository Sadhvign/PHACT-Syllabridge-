import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3vectors from "aws-cdk-lib/aws-s3vectors";
import { Construct } from "constructs";
import { PhactConfig } from "./config.js";

export interface KnowledgeStackProps extends StackProps {
  config: PhactConfig;
  knowledgeBucket: s3.IBucket;
  key: kms.IKey;
}

export const SOURCES_PREFIX = "sources/";
const EMBEDDING_DIMENSIONS = 1024;

export class KnowledgeStack extends Stack {
  constructor(scope: Construct, id: string, props: KnowledgeStackProps) {
    super(scope, id, props);
    const { config, knowledgeBucket, key } = props;

    const vectorBucketName = `phact-${config.stage}-vectors-${this.account}`;
    const vectorBucket = new s3vectors.CfnVectorBucket(this, "VectorBucket", {
      vectorBucketName,
    });

    const index = new s3vectors.CfnIndex(this, "VectorIndex", {
      vectorBucketName,
      indexName: "aspph-sources",
      dataType: "float32",
      dimension: EMBEDDING_DIMENSIONS,
      distanceMetric: "cosine",
      // Bedrock's text and metadata blobs exceed the 2 KB filterable-metadata cap.
      metadataConfiguration: {
        nonFilterableMetadataKeys: ["AMAZON_BEDROCK_TEXT", "AMAZON_BEDROCK_METADATA"],
      },
    });
    index.addResourceDependency(vectorBucket);

    const embeddingModelArn = `arn:${this.partition}:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`;

    const role = new iam.Role(this, "KnowledgeBaseRole", {
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com", {
        conditions: {
          StringEquals: { "aws:SourceAccount": this.account },
          ArnLike: {
            "aws:SourceArn": `arn:${this.partition}:bedrock:${this.region}:${this.account}:knowledge-base/*`,
          },
        },
      }),
    });
    role.addToPolicy(
      new iam.PolicyStatement({ actions: ["bedrock:InvokeModel"], resources: [embeddingModelArn] }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [knowledgeBucket.bucketArn],
        conditions: { StringLike: { "s3:prefix": [`${SOURCES_PREFIX}*`] } },
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [knowledgeBucket.arnForObjects(`${SOURCES_PREFIX}*`)],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({ actions: ["kms:Decrypt"], resources: [key.keyArn] }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3vectors:GetIndex",
          "s3vectors:PutVectors",
          "s3vectors:GetVectors",
          "s3vectors:DeleteVectors",
          "s3vectors:QueryVectors",
          "s3vectors:ListVectors",
        ],
        resources: [index.attrIndexArn],
      }),
    );

    const knowledgeBase = new bedrock.CfnKnowledgeBase(this, "KnowledgeBase", {
      name: `phact-${config.stage}-aspph-sources`,
      description: "Approved ASPPH sources that ground PHACT recommendations",
      roleArn: role.roleArn,
      knowledgeBaseConfiguration: {
        type: "VECTOR",
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn,
          embeddingModelConfiguration: {
            bedrockEmbeddingModelConfiguration: {
              dimensions: EMBEDDING_DIMENSIONS,
              embeddingDataType: "FLOAT32",
            },
          },
        },
      },
      storageConfiguration: {
        type: "S3_VECTORS",
        s3VectorsConfiguration: { indexArn: index.attrIndexArn },
      },
    });
    knowledgeBase.node.addDependency(role);

    const dataSource = new bedrock.CfnDataSource(this, "SourcesDataSource", {
      knowledgeBaseId: knowledgeBase.attrKnowledgeBaseId,
      name: "aspph-approved-sources",
      // Retired sources are deleted from S3; DELETE removes their vectors on the next sync.
      dataDeletionPolicy: "DELETE",
      dataSourceConfiguration: {
        type: "S3",
        s3Configuration: {
          bucketArn: knowledgeBucket.bucketArn,
          inclusionPrefixes: [SOURCES_PREFIX],
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: "FIXED_SIZE",
          fixedSizeChunkingConfiguration: { maxTokens: 400, overlapPercentage: 15 },
        },
      },
    });

    new CfnOutput(this, "KnowledgeBaseId", { value: knowledgeBase.attrKnowledgeBaseId });
    new CfnOutput(this, "KnowledgeDataSourceId", { value: dataSource.attrDataSourceId });
    new CfnOutput(this, "VectorBucketName", { value: vectorBucketName });
  }
}
