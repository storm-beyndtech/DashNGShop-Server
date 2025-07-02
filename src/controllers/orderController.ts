// controllers/orderController.ts
import Order from "../models/Order";
import { Request, Response } from "express";
import Product from "../models/Product";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { io } from "../index";
import crypto from "crypto";
import { verifyPaystackPayment } from "../utils/PaystackVerification";

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private (Admin/Staff)
export const getOrders = asyncHandler(async (req: Request, res: Response) => {
	const orders = await Order.find();

	res.status(200).json(orders);
});

// @desc    Get user orders
// @route   GET /api/orders/my
// @access  Private
export const getMyOrders = asyncHandler(async (req: Request, res: Response) => {
	const orders = await Order.find({ user: req.user?.id })
		.populate("items.product", "name images")
		.sort({ createdAt: -1 });

	res.status(200).json(orders);
});

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
export const getOrder = asyncHandler(async (req: Request, res: Response) => {
	const filter: any = { _id: req.params.id };

	// Non-admin users can only see their own orders
	if (req.user?.role === "customer") {
		filter.user = req.user.id;
	}

	const order = await Order.findOne(filter)
		.populate("user", "firstName lastName email")
		.populate("items.product", "name images");

	if (!order) {
		throw new AppError("Order not found", 404);
	}

	res.status(200).json(order);
});

// @desc    Verify Paystack payment
// @route   POST /api/orders/verify-payment
// @access  Private
export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
	const { reference, expectedAmount } = req.body;

	if (!reference) {
		throw new AppError("Payment reference is required", 400);
	}

	try {
		const verification = await verifyPaystackPayment(reference);

		if (!verification.success) {
			throw new AppError("Payment verification failed", 400);
		}

		// Check if payment amount matches expected amount
		const paidAmount = verification.data.amount;
		if (expectedAmount && paidAmount !== expectedAmount) {
			throw new AppError("Payment amount mismatch", 400);
		}

		// Check if payment status is successful
		if (verification.data.status !== "success") {
			throw new AppError("Payment was not successful", 400);
		}

		res.json({
			verified: true,
			data: verification.data,
			message: "Payment verified successfully",
		});
	} catch (error) {
		console.error("Payment verification error:", error);
		throw new AppError("Payment verification failed", 400);
	}
});

// @desc    Create order
// @route   POST /api/orders
// @access  Private
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
	const { userId, items, shippingAddress, billingAddress, paymentMethod, paymentDetails } = req.body;

	if (!items || items.length === 0) {
		throw new AppError("No order items provided", 400);
	}

	// For Paystack payments, we assume verification was done before this call
	// But we can still do a quick verification as a safety measure
	if (paymentMethod === "paystack" && paymentDetails?.reference) {
		try {
			const verification = await verifyPaystackPayment(paymentDetails.reference);
			if (!verification.success || verification.data.status !== "success") {
				throw new AppError("Invalid payment reference", 400);
			}
		} catch (error) {
			throw new AppError("Payment verification failed", 400);
		}
	}

	// Calculate totals and validate products
	let subtotal = 0;
	const orderItems = [];

	for (const item of items) {
		const product = await Product.findById(item.productId);

		if (!product) {
			throw new AppError(`Product ${item.productId} not found`, 404);
		}

		if (!product.inStock || product.stockCount < item.quantity) {
			throw new AppError(`Insufficient stock for ${product.name}`, 400);
		}

		const itemTotal = product.price * item.quantity;
		subtotal += itemTotal;

		orderItems.push({
			product: product._id,
			name: product.name,
			price: product.price,
			quantity: item.quantity,
			size: item.size,
			color: item.color,
			image: product.images[0],
		});

		// Update product stock
		product.stockCount -= item.quantity;
		if (product.stockCount === 0) {
			product.inStock = false;
		}
		await product.save();

		io.emit("inventory-updated", product); // Emit inventory update
	}

	// Calculate shipping and tax
	const shipping = subtotal > 50000 ? 0 : 2500;
	const tax = subtotal * 0.075; // 7.5% VAT
	const total = subtotal + shipping + tax;

	// Generate order number
	const orderNumber = `ORD-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

	const order = await Order.create({
		orderNumber,
		user: userId || undefined,
		items: orderItems,
		subtotal,
		shipping,
		tax,
		total,
		shippingAddress,
		billingAddress: billingAddress || shippingAddress,
		paymentMethod,
		paymentDetails,
		status: paymentMethod === "paystack" ? "confirmed" : "pending",
		paymentStatus: paymentMethod === "paystack" ? "paid" : "pending",
	});

	// Populate the order with product details
	await order.populate("items.product");

	// Emit real-time update
	io.emit("order-created", {
		orderId: order._id,
		orderNumber: order.orderNumber,
		total: order.total,
		status: order.status,
	});

	res.status(201).json(order);
});

// @desc    Update order status
// @route   PATCH /api/orders/:id/status
// @access  Private (Admin/Staff)
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
	const { status, trackingNumber } = req.body;

	const order = await Order.findByIdAndUpdate(
		req.params.id,
		{
			status,
			...(trackingNumber && { trackingNumber }),
			...(status === "delivered" && { deliveredAt: new Date() }),
		},
		{
			new: true,
			runValidators: true,
		},
	).populate("user", "firstName lastName email");

	if (!order) {
		throw new AppError("Order not found", 404);
	}

	// Emit real-time update
	io.emit("order-updated", {
		orderId: order._id,
		status: order.status,
	});

	res.status(200).json(order);
});

// @desc    Cancel order
// @route   PATCH /api/orders/:id/cancel
// @access  Private
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
	const { reason } = req.body;

	const filter: any = { _id: req.params.id };

	// Non-admin users can only cancel their own orders
	if (req.user?.role === "customer") {
		filter.user = req.user.id;
	}

	const order = await Order.findOne(filter);

	if (!order) {
		throw new AppError("Order not found", 404);
	}

	if (!["pending", "confirmed"].includes(order.status)) {
		throw new AppError("Order cannot be cancelled at this stage", 400);
	}

	// Restore product stock
	for (const item of order.items) {
		const product = await Product.findById(item.product);
		if (product) {
			product.stockCount += item.quantity;
			product.inStock = true;
			await product.save();
		}
	}

	order.status = "cancelled";
	order.cancelledAt = new Date();
	order.cancelReason = reason;
	await order.save();

	res.status(200).json(order);
});
