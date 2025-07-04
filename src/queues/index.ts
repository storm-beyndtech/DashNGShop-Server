import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
});

// Create queues
export const geoQueue = new Queue('geo-location', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

export const emailQueue = new Queue('email', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
  },
});

// Queue functions (instead of separate service)
export async function addGeoJob(data: {
  loginEntryId: string;
  ipAddress: string;
  userId: string;
}) {
  return await geoQueue.add('process-geo', data, { delay: 1000 });
}

export async function addEmailJob(data: {
  email: string;
  ipAddress: string;
}) {
  return await emailQueue.add('login-alert', data, { priority: 1 });
}