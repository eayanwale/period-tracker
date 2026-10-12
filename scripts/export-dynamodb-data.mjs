#!/usr/bin/env node
// One-time export of the logged dates from DynamoDB into a JSON file the
// new self-hosted server can import on first boot (see
// ../server/index.js's maybeImportSeed). Run this with your own AWS
// credentials BEFORE `terraform destroy`-ing the old backend, if you
// want to keep your logged history.
//
// Usage:
//   cd scripts
//   npm install
//   node export-dynamodb-data.mjs > ../seed.json
//
// Then copy seed.json to wherever the new instance's volume is mounted,
// as the file SEED_PATH points at (default /data/seed.json).

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const PROJECT_NAME = process.env.PROJECT_NAME || 'period-tracker';
const TABLE_NAME = process.env.TABLE_NAME || `${PROJECT_NAME}-logs`;

const client = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(client);

const items = [];
let ExclusiveStartKey;
do {
  const result = await ddb.send(new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey }));
  items.push(...(result.Items || []));
  ExclusiveStartKey = result.LastEvaluatedKey;
} while (ExclusiveStartKey);

const seed = items
  .map((item) => ({ date: item.date, createdAt: item.createdAt }))
  .sort((a, b) => a.date.localeCompare(b.date));

process.stderr.write(`exported ${seed.length} date(s) from table "${TABLE_NAME}" in ${REGION}\n`);
process.stdout.write(JSON.stringify(seed, null, 2) + '\n');
