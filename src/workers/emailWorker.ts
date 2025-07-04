import { Worker, Job } from 'bullmq';
import { loginAlertMail } from '@/services/emailService';
import IORedis from 'ioredis';

const redis = new IORedis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
});


export class EmailWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('email', this.processJob.bind(this), {
      connection: redis,
      concurrency: 2,
    });

    this.worker.on('completed', (job) => {
      console.log(`✅ Email job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ Email job ${job?.id} failed:`, err.message);
    });
  }

  private async processJob(job: Job) {
    const { email, ipAddress } = job.data;
    
    try {
      console.log(`📧 Sending login alert to: ${email}`);
      
      // Use your existing loginAlertMail function
      await loginAlertMail(email, ipAddress);
      
      console.log(`✅ Login alert sent to: ${email}`);
      return { success: true };
      
    } catch (error:any) {
      console.error('Email sending failed:', error.message);
      throw error;
    }
  }

  async close() {
    await this.worker.close();
  }
}
