import Redis from 'ioredis';

export async function testRedisConnection() {
  const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
});
  
  try {
    console.log('🔍 Testing Redis...');
    const pong = await redis.ping();
    console.log('✅ Redis connected:', pong);
    
    await redis.set('test', 'success');
    const result = await redis.get('test');
    console.log('✅ Read/write test:', result);
    
    await redis.del('test');
    return true;
  } catch (error:any) {
    console.error('❌ Redis test failed:', error.message);
    return false;
  } finally {
    await redis.quit();
  }
}