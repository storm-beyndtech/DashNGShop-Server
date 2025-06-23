// routes/users.ts
import express from 'express'
import { protect, restrictTo } from '../middleware/auth'
import { deleteUserById, getAllUsers, getUserById, updateUserById } from '@/controllers/userController'

const router = express.Router()

// All routes are protected and admin-only
router.use(protect)
router.use(restrictTo('admin'))

router.get('/', getAllUsers)
router.get('/:id', getUserById)
router.put('/:id', updateUserById)
router.delete('/:id', deleteUserById)

export default router
