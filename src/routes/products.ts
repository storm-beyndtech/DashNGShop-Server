// routes/products.ts
import express from 'express'
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductStock,
  getProductCategories
} from '../controllers/productController'
import { protect, restrictTo } from '../middleware/auth'

const router = express.Router()

// Public routes
router.get('/', getProducts)
router.get('/:id', getProduct)
router.get('/categories', getProductCategories)

// Protected routes
router.use(protect) // All routes after this middleware are protected

// Admin/Staff only routes
router.post('/', restrictTo('admin', 'salesrep', 'storekeeper'), createProduct)
router.put('/:id', restrictTo('admin', 'salesrep', 'storekeeper'), updateProduct)
router.delete('/:id', restrictTo('admin', 'storekeeper'), deleteProduct)
router.patch('/:id/stock', restrictTo('admin', 'salesrep', 'storekeeper'), updateProductStock)

export default router
