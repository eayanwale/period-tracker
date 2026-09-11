// Lambda handler for the period tracker API.
// Deliberately tiny: this stores/retrieves raw period start dates for one
// couple. All the prediction math happens client-side in cycle.js — this
// is just shared storage so both phones see the same log.
//
// Routes (API Gateway HTTP API, payload format 2.0):
//   GET    /logs        -> list all logged dates
//   POST   /logs         { date: 'YYYY-MM-DD' } -> add a date
//   DELETE /logs/{date}  -> remove a date
//
// Auth: a shared passcode sent as the 'x-passcode' header, checked against
// an environment variable. This is intentionally lightweight (two known
// users, not a public product) — not a substitute for real auth if this
// ever grows beyond a private gift project.

import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME;
const COUPLE_ID = process.env.COUPLE_ID || 'shared';
const PASSCODE = process.env.PASSCODE;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      // CORS is also handled at the API Gateway level, but Lambda errors
      // (thrown before reaching the integration response) need headers too.
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method;
    const path = event.rawPath || '';
    const headers = event.headers || {};
    const passcode = headers['x-passcode'] || headers['X-Passcode'];

    if (!PASSCODE || passcode !== PASSCODE) {
      return jsonResponse(401, { error: 'Invalid or missing passcode' });
    }

    if (method === 'GET' && path === '/logs') {
      const result = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'coupleId = :cid',
          ExpressionAttributeValues: { ':cid': COUPLE_ID },
        })
      );
      const dates = (result.Items || []).map((item) => item.date).sort();
      return jsonResponse(200, { dates });
    }

    if (method === 'POST' && path === '/logs') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { date } = body;
      if (!date || !DATE_RE.test(date)) {
        return jsonResponse(400, { error: "Expected body { date: 'YYYY-MM-DD' }" });
      }
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            coupleId: COUPLE_ID,
            date,
            createdAt: new Date().toISOString(),
          },
        })
      );
      return jsonResponse(201, { ok: true, date });
    }

    if (method === 'DELETE' && path.startsWith('/logs/')) {
      const date = decodeURIComponent(path.replace('/logs/', ''));
      if (!DATE_RE.test(date)) {
        return jsonResponse(400, { error: 'Invalid date in path' });
      }
      await ddb.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { coupleId: COUPLE_ID, date },
        })
      );
      return jsonResponse(200, { ok: true, date });
    }

    return jsonResponse(404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: 'Internal error' });
  }
};
