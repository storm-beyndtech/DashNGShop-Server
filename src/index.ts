import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { createServer } from "http";
import { Server } from "socket.io";
import rateLimit from "express-rate-limit";

import { connectDatabase } from "./config/database";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import productRoutes from "./routes/products";
import orderRoutes from "./routes/orders";
import userRoutes from "./routes/users";
import uploadRoutes from "./routes/upload";
import { initSocket } from "./utils/socket";
import { verifyTransporter } from "./config/email";
import { testRedisConnection } from "./utils/testRedis";
import { WorkerManager } from "./workers";
import { emailQueue, geoQueue } from "./queues";

const app = express();
const server = createServer(app);
export const io = new Server(server, {
	cors: {
		origin: process.env.CLIENT_URL || "http://localhost:3000",
		methods: ["GET", "POST"],
	},
});

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(
	helmet({
		crossOriginEmbedderPolicy: false,
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
				fontSrc: ["'self'", "https://fonts.gstatic.com"],
				imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://images.unsplash.com"],
				scriptSrc: ["'self'"],
				connectSrc: ["'self'", "https://api.cloudinary.com"],
			},
		},
	}),
);

// Rate limiting
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
	message: "Too many requests from this IP, please try again later.",
	standardHeaders: true,
	legacyHeaders: false,
});

app.use(limiter);

// CORS configuration
app.use(
	cors({
		origin: process.env.CLIENT_URL || "http://localhost:3000",
	}),
);

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/users", userRoutes);
app.use("/api/upload", uploadRoutes);

// Socket.IO for real-time features
initSocket(io);

// 404 handler
app.use("*", (req, res) => {
	res.status(404).json({
		success: false,
		message: "Route not found",
	});
});

// Global error handler
app.use(errorHandler);

// Health check endpoint
app.get("/health", (req, res) => {
	res.status(200).json({
		status: "OK",
		timestamp: new Date().toISOString(),
		environment: process.env.NODE_ENV || "development",
	});
});

// Queue status
app.get("/health/queues", async (req, res) => {
	try {
		const geoStats = await geoQueue.getJobCounts();
		const emailStats = await emailQueue.getJobCounts();

		res.json({
			success: true,
			data: { geoLocation: geoStats, email: emailStats },
		});
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message });
	}
});

// Database connection and server startup
const startServer = async () => {
	try {
		await connectDatabase();
		await verifyTransporter();
		console.log("✅ Database connected successfully");

		// Test Redis
		const redisOk = await testRedisConnection();
		if (!redisOk) throw new Error("Redis connection failed");
		console.log("✅ Redis connected");

		// Start workers
		new WorkerManager();

		server.listen(PORT, () => {
			console.log(`🚀 Server running on port ${PORT}`);
			console.log(`📱 Environment: ${process.env.NODE_ENV || "development"}`);
			console.log(`🌐 CORS enabled for: ${process.env.CLIENT_URL || "http://localhost:3000"}`);
		});
	} catch (error) {
		console.error("❌ Failed to start server:", error);
		process.exit(1);
	}
};

// Graceful shutdown
process.on("SIGTERM", () => {
	console.log("SIGTERM received, shutting down gracefully");
	server.close(() => {
		console.log("Process terminated");
	});
});

process.on("SIGINT", () => {
	console.log("SIGINT received, shutting down gracefully");
	server.close(() => {
		console.log("Process terminated");
	});
});

startServer();
export default app;
