// controllers/productController.ts
import { Request, Response } from "express";
import Product from "../models/Product";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";

// @desc    Get all products
// @route   GET /api/products
// @access  Public
export const getProducts = asyncHandler(async (req: Request, res: Response) => {
	const products = await Product.find();
	res.status(200).json(products);
});

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
export const getProduct = asyncHandler(async (req: Request, res: Response) => {
	const product = await Product.findOne({
		_id: req.params.id,
		isActive: true,
	});

	if (!product) {
		throw new AppError("Product not found", 404);
	}

	res.status(200).json(product);
});

// @desc    Get all products for admin (includes inactive)
// @route   GET /api/admin/products
// @access  Private (Admin/Staff)
export const getAdminProducts = asyncHandler(async (req: Request, res: Response) => {
	const products = await Product.find();
	res.status(200).json(products);
});

// @desc    Create product
// @route   POST /api/products
// @access  Private (Admin/Staff)
export const createProduct = asyncHandler(async (req: Request, res: Response) => {
	const product = await Product.create(req.body);

	res.status(201).json(product);
});

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private (Admin/Staff)
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
	const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
		new: true,
		runValidators: true,
	});

	if (!product) {
		throw new AppError("Product not found", 404);
	}

	res.status(200).json(product);
});

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private (Admin)
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
	const product = await Product.findById(req.params.id);

	if (!product) {
		throw new AppError("Product not found", 404);
	}

	// Soft delete - just mark as inactive
	product.isActive = false;
	await product.save();

	res.status(200).json({
		success: true,
		message: "Product deleted successfully",
	});
});

// @desc    Update product stock
// @route   PATCH /api/products/:id/stock
// @access  Private (Admin/Staff)
export const updateProductStock = asyncHandler(async (req: Request, res: Response) => {
	const { stockCount } = req.body;

	const product = await Product.findByIdAndUpdate(
		req.params.id,
		{
			stockCount,
			inStock: stockCount > 0,
		},
		{
			new: true,
			runValidators: true,
		},
	);

	if (!product) {
		throw new AppError("Product not found", 404);
	}

	res.status(200).json(product);
});

// @desc    Get all unique categories
// @route   GET /api/products/categories
// @access  Public
export const getProductCategories = asyncHandler(async (req: Request, res: Response) => {
	const categories = await Product.distinct("category", { isActive: true });

	res.status(200).json(categories);
});
