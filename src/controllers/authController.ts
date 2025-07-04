import { Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import User, { IUser } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { loginAlertMail, welcomeMail } from "@/services/emailService";
import { LoginHistory } from "@/models/LoginHistory";
import { addEmailJob, addGeoJob } from "@/queues";

// Helper function to generate JWT token
const generateToken = (userId: string) => {
	if (!process.env.JWT_SECRET) {
		throw new Error("JWT_SECRET is not defined in environment variables");
	}

	return jwt.sign({ userId }, process.env.JWT_SECRET as string, {
		expiresIn: "7d",
	});
};

// Send token response
const sendTokenResponse = (user: IUser, statusCode: number, res: Response) => {
	const token = generateToken(user._id.toString());

	const options = {
		expires: new Date(
			Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
		),
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict" as const,
	};

	res
		.status(statusCode)
		.cookie("token", token, options)
		.json({
			success: true,
			token,
			user: {
				id: user._id,
				firstName: user.firstName,
				lastName: user.lastName,
				username: user.username,
				email: user.email,
				role: user.role,
				avatar: user.avatar,
				phone: user.phone,
				addresses: user.addresses,
				preferences: user.preferences,
				wishlist: user.wishlist,
				lastLogin: user.lastLogin,
				createdAt: user.createdAt,
			},
		});
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = asyncHandler(async (req: Request, res: Response) => {
	const { firstName, lastName, email, password, username } = req.body;

	// Check if user exists
	const existingUser = await User.findOne({ email: email.toLowerCase() });
	if (existingUser) {
		throw new AppError("User already exists with this email", 400);
	}

	// Create user
	const user = await User.create({
		firstName: firstName.trim(),
		lastName: lastName.trim(),
		username: username.trim(),
		email: email.toLowerCase().trim(),
		password,
	});

	// Update last login
	user.lastLogin = new Date();
	await user.save();
	await welcomeMail(user.email);

	sendTokenResponse(user, 201, res);
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Please provide email and password", 400);
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

  if (!user || !user.isActive) {
    throw new AppError("Invalid credentials", 401);
  }

  const isMatch = await user.comparePassword(password);

  // Create login entry immediately
  const loginEntry = new LoginHistory({
    userId: user._id,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] || "Unknown",
    success: isMatch,
    method: "password",
  });
  await loginEntry.save();

  // Queue background jobs (don't wait)
  if (isMatch) {
    // Queue geo location job
    addGeoJob({
      loginEntryId: loginEntry.id.toString(),
      ipAddress: req.ip || 'unknown',
      userId: user._id.toString(),
    }).catch(err => console.error('Failed to queue geo job:', err));

    // Queue login alert email
    addEmailJob({
      email: user.email,
      ipAddress: req.ip || 'unknown',
    }).catch(err => console.error('Failed to queue email job:', err));
  }

  if (!isMatch) {
    throw new AppError("Invalid credentials", 401);
  }

  // Update user
  user.lastLogin = new Date();
  await user.save();

  sendTokenResponse(user, 200, res);
});

// @desc    Update password
// @route   PUT /api/auth/updatepassword
// @access  Private
export const updatePassword = asyncHandler(async (req: Request, res: Response) => {
	const { currentPassword, newPassword } = req.body;

	if (!currentPassword || !newPassword) {
		throw new AppError("Please provide current and new password", 400);
	}

	const user = await User.findById(req.user?.id).select("+password");

	if (!user) {
		throw new AppError("User not found", 404);
	}

	// Check current password
	const isMatch = await user.comparePassword(currentPassword);
	if (!isMatch) {
		throw new AppError("Current password is incorrect", 401);
	}

	user.password = newPassword;
	await user.save();

	sendTokenResponse(user, 200, res);
});

// @desc    Logout user / clear cookie
// @route   GET /api/auth/logout
// @access  Private
export const logout = asyncHandler(async (req: Request, res: Response) => {
	res.cookie("token", "none", {
		expires: new Date(Date.now() + 10 * 1000),
		httpOnly: true,
	});

	res.status(200).json({
		success: true,
		message: "Logged out successfully",
	});
});

// @desc    Add address
// @route   POST /api/auth/addresses
// @access  Private
export const addAddress = asyncHandler(async (req: Request, res: Response) => {
	const user = await User.findById(req.user?.id);

	if (!user) {
		throw new AppError("User not found", 404);
	}

	const { type, street, city, state, zipCode, country, isDefault } = req.body;

	const newAddress = {
		type,
		street,
		city,
		state,
		zipCode,
		country: country || "Nigeria",
		isDefault: isDefault || false,
	};

	// If this is set as default, make sure no other address of the same type is default
	if (isDefault) {
		user.addresses.forEach((address) => {
			if (address.type === type) {
				address.isDefault = false;
			}
		});
	}

	user.addresses.push(newAddress);
	await user.save();

	res.status(201).json({
		success: true,
		addresses: user.addresses,
	});
});

// @desc    Update address
// @route   PUT /api/auth/addresses/:addressId
// @access  Private
export const updateAddress = asyncHandler(async (req: Request, res: Response) => {
	const user = await User.findById(req.user?.id);

	if (!user) {
		throw new AppError("User not found", 404);
	}

	// Find address using find() method
	const address = user.addresses.find((addr) => addr._id?.toString() === req.params.addressId);
	if (!address) {
		throw new AppError("Address not found", 404);
	}

	// Update address fields
	Object.assign(address, req.body);

	// If this is set as default, make sure no other address of the same type is default
	if (req.body.isDefault) {
		user.addresses.forEach((addr) => {
			if (addr.type === address.type && addr._id!.toString() !== address._id!.toString()) {
				addr.isDefault = false;
			}
		});
	}

	await user.save();

	res.status(200).json({
		success: true,
		addresses: user.addresses,
	});
});

// @desc    Delete address
// @route   DELETE /api/auth/addresses/:addressId
// @access  Private
export const deleteAddress = asyncHandler(async (req: Request, res: Response) => {
	const user = await User.findById(req.user?.id);

	if (!user) {
		throw new AppError("User not found", 404);
	}

	const addressIndex = user.addresses.findIndex((addr) => addr._id?.toString() === req.params.addressId);

	if (addressIndex === -1) {
		throw new AppError("Address not found", 404);
	}

	user.addresses.splice(addressIndex, 1);
	await user.save();

	res.status(200).json({
		success: true,
		addresses: user.addresses,
	});
});
