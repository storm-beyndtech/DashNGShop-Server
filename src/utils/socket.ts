// server/socket.ts
import { Server } from 'socket.io'

export const initSocket = (io: Server) => {
  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id)

    // Handle room joins
    socket.on('join-room', (room: string) => {
      socket.join(room)
      console.log(`📦 Socket ${socket.id} joined room: ${room}`)
    })

    // Inventory change event from admin (broadcast to everyone except sender)
    socket.on('inventory-update', (product) => {
      socket.broadcast.emit('inventory:updated', product)
    })

    // Order status change from admin or system (notify client)
    socket.on('order-update', ({ orderId, status }) => {
      socket.broadcast.emit('order:status-changed', { orderId, status })
    })

    socket.on('disconnect', () => {
      console.log('❌ User disconnected:', socket.id)
    })
  })
}
