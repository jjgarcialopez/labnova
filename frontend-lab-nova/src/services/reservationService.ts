import apiClient from './api'
import { Reservation, ReservationLog, PaginatedResponse } from '../types'

export const reservationService = {
  // GET /reservations → { success, data: [...], meta: { total, per_page, current_page, last_page } }
  getAllReservations: async (page = 1, perPage = 10): Promise<PaginatedResponse<Reservation>> => {
    const response = await apiClient.get('/reservations', {
      params: { page, per_page: perPage },
    })
    const meta = response.data.meta ?? {}
    return {
      data: response.data.data ?? [],
      current_page: meta.current_page ?? page,
      last_page: meta.last_page ?? 1,
      per_page: meta.per_page ?? perPage,
      total: meta.total ?? 0,
    }
  },

  // GET /reservations/:id → { success, data: {...} }
  getReservationById: async (id: number): Promise<Reservation> => {
    const response = await apiClient.get(`/reservations/${id}`)
    return response.data.data
  },

  // POST /reservations → { success, data: {...} }
  // Backend validates: equipment_id, start_time, end_time, notes, user_id (admin only)
  createReservation: async (data: {
    equipment_id: number
    start_time: string
    end_time: string
    notes?: string
    user_id?: number
  }): Promise<Reservation> => {
    const response = await apiClient.post('/reservations', data)
    return response.data.data
  },

  // PUT /reservations/:id → { success, data: {...} }
  updateReservation: async (id: number, data: {
    start_time?: string
    end_time?: string
    notes?: string
  }): Promise<Reservation> => {
    const response = await apiClient.put(`/reservations/${id}`, data)
    return response.data.data
  },

  // POST /reservations/:id/approve
  approveReservation: async (id: number): Promise<Reservation> => {
    const response = await apiClient.post(`/reservations/${id}/approve`)
    return response.data.data
  },

  // POST /reservations/:id/reject
  rejectReservation: async (id: number, reason: string): Promise<Reservation> => {
    const response = await apiClient.post(`/reservations/${id}/reject`, { reason })
    return response.data.data
  },

  // POST /reservations/:id/cancel
  cancelReservation: async (id: number): Promise<Reservation> => {
    const response = await apiClient.post(`/reservations/${id}/cancel`)
    return response.data.data
  },

  // GET /reservations/:id/logs → { success, data: [...] }
  getReservationLogs: async (reservationId: number): Promise<ReservationLog[]> => {
    const response = await apiClient.get(`/reservations/${reservationId}/logs`)
    return response.data.data ?? []
  },

  // GET /reservations/availability
  checkAvailability: async (equipmentId: number, startDate: string, endDate: string): Promise<boolean> => {
    const response = await apiClient.get('/reservations/availability', {
      params: { equipment_id: equipmentId, start_date: startDate, end_date: endDate },
    })
    return response.data.available
  },

  // GET /reservations/next-available
  getNextAvailable: async (equipmentId: number): Promise<{
    is_available_now: boolean
    next_available: { date: string; time: string; duration_minutes: number }
    reserved_until: string | null
  }> => {
    const response = await apiClient.get('/reservations/next-available', {
      params: { equipment_id: equipmentId },
    })
    return response.data
  },
}
