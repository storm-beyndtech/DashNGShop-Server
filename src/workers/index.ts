
import { GeoWorker } from './geoWorker';
import { EmailWorker } from './emailWorker';

export class WorkerManager {
  private geoWorker: GeoWorker;
  private emailWorker: EmailWorker;

  constructor() {
    this.geoWorker = new GeoWorker();
    this.emailWorker = new EmailWorker();
    
    console.log('🚀 Workers started');

    // Graceful shutdown
    process.on('SIGINT', this.shutdown.bind(this));
    process.on('SIGTERM', this.shutdown.bind(this));
  }

  private async shutdown() {
    console.log('📤 Shutting down workers...');
    await Promise.all([
      this.geoWorker.close(),
      this.emailWorker.close(),
    ]);
    console.log('✅ Workers closed');
    process.exit(0);
  }
}
