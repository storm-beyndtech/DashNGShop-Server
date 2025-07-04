import { Worker, Job } from "bullmq";
import { LoginHistory } from "../models/LoginHistory";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
});

export class GeoWorker {
	private worker: Worker;

	constructor() {
		this.worker = new Worker("geo-location", this.processJob.bind(this), {
			connection: redis,
			concurrency: 3,
		});

		this.worker.on("completed", (job) => {
			console.log(`✅ Geo job ${job.id} completed`);
		});

		this.worker.on("failed", (job, err) => {
			console.error(`❌ Geo job ${job?.id} failed:`, err.message);
		});
	}

	private async processJob(job: Job) {
		const { loginEntryId, ipAddress } = job.data;

		try {
			console.log(`🌍 Processing geo for: ${loginEntryId}`);

			// Fetch location data
			const response = await fetch(`https://ipapi.co/${ipAddress}/json/`, {
				headers: { "User-Agent": "YourApp/1.0" },
			});

			if (!response.ok) throw new Error(`HTTP ${response.status}`);

			const data: any = await response.json();

			// Update database
			await LoginHistory.findByIdAndUpdate(loginEntryId, {
				location: {
					city: data.city || "Unknown",
					region: data.region || "Unknown",
					country: data.country_name || "Unknown",
				},
			});

			console.log(`✅ Updated location for: ${loginEntryId}`);
			return { success: true };
		} catch (error: any) {
			console.error("Geo processing failed:", error.message);
			throw error;
		}
	}

	async close() {
		await this.worker.close();
	}
}
