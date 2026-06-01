import React, { useEffect, useState, useCallback, useRef } from 'react'
import { reservationService } from '../services/reservationService'
import { equipmentService } from '../services/equipmentService'
import { userService } from '../services/userService'
import { useAuth } from '../hooks'
import { usePermissions } from '../hooks/usePermissions'
import { useToast } from '../hooks/useToast'
import { Reservation, Equipment, User } from '../types'
import { Modal } from '../components/common/Modal'
import { ToastContainer } from '../components/common/Toast'
import { ProtectedButton, IfCan } from '../components/ProtectedFeature'

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Reservation['status'], string> = {
  pending:   'Pendiente',
  approved:  'Aprobada',
  rejected:  'Rechazada',
  cancelled: 'Cancelada',
  completed: 'Completada',
}

const STATUS_STYLES: Record<Reservation['status'], string> = {
  pending:   'bg-yellow-50 text-yellow-700 border border-yellow-200',
  approved:  'bg-green-50 text-green-700 border border-green-200',
  rejected:  'bg-red-50 text-red-700 border border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border border-gray-200',
  completed: 'bg-blue-50 text-blue-700 border border-blue-200',
}

const STATUS_DOT: Record<Reservation['status'], string> = {
  pending:   'bg-yellow-400',
  approved:  'bg-green-500',
  rejected:  'bg-red-500',
  cancelled: 'bg-gray-400',
  completed: 'bg-blue-500',
}

// ─── Form type ────────────────────────────────────────────────────────────────

interface ReservationForm {
  equipment_id: string
  user_id:      string
  start_date:   string
  start_hour:   string
  end_date:     string
  end_hour:     string
  notes:        string
}

const EMPTY_FORM: ReservationForm = {
  equipment_id: '',
  user_id:      '',
  start_date:   '',
  start_hour:   '08:00',
  end_date:     '',
  end_hour:     '09:00',
  notes:        '',
}

/** Combina date + hour → ISO 8601 UTC */
const toDateTime = (date: string, hour: string) => {
  if (!date || !hour) return ''
  return new Date(`${date}T${hour}:00`).toISOString()
}

/** Opciones de tiempo cada 15 min: 07:00 → 22:00 */
const TIME_OPTIONS = Array.from({ length: 61 }, (_, i) => {
  const totalMins = 7 * 60 + i * 15
  const h = String(Math.floor(totalMins / 60)).padStart(2, '0')
  const m = String(totalMins % 60).padStart(2, '0')
  return `${h}:${m}`
})

const getAvailableTimeOptions = (selectedDate: string): string[] => {
  const today = new Date().toISOString().split('T')[0]
  const isToday = selectedDate === today

  if (!isToday) return TIME_OPTIONS

  const now = new Date()
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return TIME_OPTIONS.filter(time => time > currentTime)
}

// ─── Image helpers ────────────────────────────────────────────────────────────

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '')

const normalizeImageUrl = (url?: string | null): string | null => {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`
}

const getEquipmentImage = (eq: Equipment): string | null =>
  normalizeImageUrl(
    eq.images?.find(i => i.is_primary)?.image_url
    ?? eq.images?.[0]?.image_url
    ?? null
  )

// ─── Small components ─────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: Reservation['status'] }> = ({ status }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[status]}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
    {STATUS_LABELS[status]}
  </span>
)

const FieldError: React.FC<{ msg?: string }> = ({ msg }) =>
  msg ? (
    <p className="flex items-center gap-1 text-red-500 text-xs mt-1">
      <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      {msg}
    </p>
  ) : null

// ─── Main component ───────────────────────────────────────────────────────────

const ReservationsPage: React.FC = () => {
  const { user }  = useAuth()
  const perms     = usePermissions()
  const toast     = useToast()

  const [reservations, setReservations] = useState<Reservation[]>([])
  const [equipment,    setEquipment]    = useState<Equipment[]>([])
  const [users,        setUsers]        = useState<User[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)

  const [currentPage,  setCurrentPage]  = useState(1)
  const [totalPages,   setTotalPages]   = useState(1)
  const [total,        setTotal]        = useState(0)
  const [filterStatus, setFilterStatus] = useState('all')

  const [showModal,  setShowModal]  = useState(false)
  const [form,       setForm]       = useState<ReservationForm>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ReservationForm, string>>>({})

  const [availabilityStatus, setAvailabilityStatus] =
    useState<'unknown' | 'checking' | 'available' | 'unavailable' | 'past'>('unknown')
  const availabilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [equipmentAvailability, setEquipmentAvailability] = useState<{
    is_available_now: boolean
    next_available: { date: string; time: string; duration_minutes: number }
    reserved_until: string | null
  } | null>(null)
  const [checkingEquipmentAvailability, setCheckingEquipmentAvailability] = useState(false)

  const [rejectModal,   setRejectModal]   = useState<{ id: number } | null>(null)
  const [rejectReason,  setRejectReason]  = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const [detailReservation, setDetailReservation] = useState<Reservation | null>(null)

  // ── Derived role flags ─────────────────────────────────────────────────────

  const isAdmin   = perms.isAdmin() || perms.isSuperAdmin() || perms.isLabManager()
  const isStudent = perms.isStudent()

  const pageTitle   = isStudent ? 'Mis Reservas' : 'Gestión de Reservas'

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadReservations = useCallback(async (page: number) => {
    try {
      setLoading(true)
      const res = await reservationService.getAllReservations(page, 10)
      setReservations(res.data ?? [])
      setTotal(res.total)
      setTotalPages(res.last_page)
      setCurrentPage(res.current_page)
    } catch {
      toast.error('No se pudo cargar la lista de reservas.')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadEquipment = useCallback(async () => {
    try {
      const res = await equipmentService.getAllEquipment()
      setEquipment((res.data ?? []).filter((e) => e.status === 'available' && e.is_active !== false))
    } catch {
      // no crítico
    }
  }, [])

  const loadUsers = useCallback(async () => {
    if (!perms.isAdmin() && !perms.isSuperAdmin()) return
    try {
      const res = await userService.getAllUsers()
      setUsers(res.data ?? [])
    } catch {
      // no crítico
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadReservations(1)
    loadEquipment()
    loadUsers()
  }, [loadReservations, loadEquipment, loadUsers])

  // ── Availability check ─────────────────────────────────────────────────────

  useEffect(() => {
    const start = toDateTime(form.start_date, form.start_hour)
    const end   = toDateTime(form.end_date,   form.end_hour)

    if (!form.equipment_id || !start || !end || start >= end) {
      setAvailabilityStatus('unknown')
      return
    }

    // Detectar horario pasado con el mismo margen de 1 minuto que usa el backend
    if (new Date(start).getTime() < Date.now() - 60_000) {
      setAvailabilityStatus('past')
      return
    }

    if (availabilityTimer.current) clearTimeout(availabilityTimer.current)
    setAvailabilityStatus('checking')

    availabilityTimer.current = setTimeout(async () => {
      try {
        const available = await reservationService.checkAvailability(
          Number(form.equipment_id), start, end
        )
        setAvailabilityStatus(available ? 'available' : 'unavailable')
      } catch {
        setAvailabilityStatus('unknown')
      }
    }, 600)

    return () => {
      if (availabilityTimer.current) clearTimeout(availabilityTimer.current)
    }
  }, [form.equipment_id, form.start_date, form.start_hour, form.end_date, form.end_hour])

  // ── Equipment availability check ───────────────────────────────────────────

  useEffect(() => {
    if (!form.equipment_id) {
      setEquipmentAvailability(null)
      return
    }

    const fetchAvailability = async () => {
      try {
        setCheckingEquipmentAvailability(true)
        const data = await reservationService.getNextAvailable(Number(form.equipment_id))
        setEquipmentAvailability(data)

        // Auto-fill date and hour if equipment is available
        if (data.is_available_now) {
          const now = new Date()
          const dateStr = now.toISOString().split('T')[0]
          const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
          setForm(prev => ({
            ...prev,
            start_date: dateStr,
            start_hour: timeStr,
            end_hour: String((now.getHours() + 1) % 24).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
          }))
        } else if (data.next_available) {
          setForm(prev => ({
            ...prev,
            start_date: data.next_available.date,
            start_hour: data.next_available.time,
            end_hour: String(parseInt(data.next_available.time.split(':')[0]) + 1).padStart(2, '0') + ':' + data.next_available.time.split(':')[1],
          }))
        }
      } catch {
        setEquipmentAvailability(null)
      } finally {
        setCheckingEquipmentAvailability(false)
      }
    }

    fetchAvailability()
  }, [form.equipment_id])

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = filterStatus === 'all'
    ? reservations
    : reservations.filter((r) => r.status === filterStatus)

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const errors: Partial<Record<keyof ReservationForm, string>> = {}
    const start = toDateTime(form.start_date, form.start_hour)
    const end   = toDateTime(form.end_date,   form.end_hour)
    if (!form.equipment_id) errors.equipment_id = 'Selecciona un equipo'
    if (!form.start_date)   errors.start_date   = 'La fecha de inicio es requerida'
    if (!form.end_date)     errors.end_date     = 'La fecha de fin es requerida'
    if (start && end && start >= end)
      errors.end_date = 'La hora de finalización debe ser posterior a la hora de inicio'
    if (start && new Date(start).getTime() < Date.now() - 60_000)
      errors.start_date = 'No se permiten reservas en horarios ya transcurridos.'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!validate()) return
    if (availabilityStatus === 'past') {
      toast.error('No se permiten reservas en horarios ya transcurridos.')
      return
    }
    if (availabilityStatus === 'checking') {
      toast.warning('Verificando disponibilidad, por favor espera un momento.')
      return
    }
    if (availabilityStatus === 'unavailable') {
      toast.error('El equipo ya se encuentra reservado en el horario seleccionado.')
      return
    }
    const start = toDateTime(form.start_date, form.start_hour)
    const end   = toDateTime(form.end_date,   form.end_hour)

    try {
      setSaving(true)
      await reservationService.createReservation({
        equipment_id: Number(form.equipment_id),
        start_time:   start,
        end_time:     end,
        notes:        form.notes || undefined,
        user_id:      isAdmin && form.user_id ? Number(form.user_id) : undefined,
      })
      toast.success('Tu solicitud de reserva ha sido enviada y se encuentra en estado Pendiente.')
      setShowModal(false)
      setForm(EMPTY_FORM)
      setAvailabilityStatus('unknown')
      loadReservations(currentPage)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo crear la reserva.')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async (id: number) => {
    try {
      setActionLoading(id)
      await reservationService.approveReservation(id)
      toast.success('Estado de la reserva actualizado exitosamente.')
      loadReservations(currentPage)
    } catch {
      toast.error('No se pudo aprobar la reserva.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async () => {
    if (!rejectModal) return
    if (!rejectReason.trim()) {
      toast.warning('El motivo de rechazo es obligatorio.')
      return
    }
    try {
      setActionLoading(rejectModal.id)
      await reservationService.rejectReservation(rejectModal.id, rejectReason)
      setRejectModal(null)
      setRejectReason('')
      toast.success('Reserva rechazada.')
      loadReservations(currentPage)
    } catch {
      toast.error('No se pudo rechazar la reserva.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancel = async (id: number) => {
    try {
      setActionLoading(id)
      await reservationService.cancelReservation(id)
      toast.success('La reserva ha sido cancelada correctamente.')
      loadReservations(currentPage)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo cancelar la reserva.')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Date formatters ────────────────────────────────────────────────────────

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

  const fmtTime = (d: string) =>
    new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

  const fmtDateTime = (d: string) =>
    new Date(d).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />

      <div className="space-y-5">

        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{pageTitle}</h1>
            <p className="text-gray-400 text-sm mt-0.5">{total} reserva{total !== 1 ? 's' : ''} en total</p>
          </div>
          <IfCan permission={{ module: 'reservations', action: 'create' }}>
            <button
              onClick={() => {
                setForm({ ...EMPTY_FORM })
                setFormErrors({})
                setAvailabilityStatus('unknown')
                setShowModal(true)
              }}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nueva Reserva
            </button>
          </IfCan>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-2">
          {(['all', 'pending', 'approved', 'rejected', 'cancelled', 'completed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filterStatus === s
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? 'Todas' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
              <svg className="w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="font-medium text-gray-500">
                {filterStatus !== 'all'
                  ? `No hay reservas con estado "${STATUS_LABELS[filterStatus as Reservation['status']]}"`
                  : 'No hay reservas aún'}
              </p>
              {filterStatus === 'all' && (
                <p className="text-sm">Crea la primera reserva con el botón de arriba.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 font-medium">#</th>
                    {/* Admin ve "Estudiante", estudiante no ve esa columna */}
                    {!isStudent && <th className="px-5 py-3 font-medium">Estudiante</th>}
                    <th className="px-5 py-3 font-medium">Equipo</th>
                    <th className="px-5 py-3 font-medium">Fecha Solicitud</th>
                    <th className="px-5 py-3 font-medium">Fecha Reserva</th>
                    <th className="px-5 py-3 font-medium">Hora</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((r) => {
                    const eqImg = r.equipment ? getEquipmentImage(r.equipment) : null
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">#{r.id}</td>

                        {!isStudent && (
                          <td className="px-5 py-3.5 font-medium text-gray-800">
                            {r.user
                              ? `${r.user.name}${r.user.last_name ? ' ' + r.user.last_name : ''}`
                              : `Usuario #${r.user_id}`}
                          </td>
                        )}

                        {/* Equipo con thumbnail circular */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden shrink-0">
                              {eqImg
                                ? <img src={eqImg} alt={r.equipment?.name} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center">
                                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                              }
                            </div>
                            <span className="text-gray-600">{r.equipment?.name ?? `Equipo #${r.equipment_id}`}</span>
                          </div>
                        </td>

                        <td className="px-5 py-3.5 text-gray-500 text-xs">{fmtDate(r.created_at)}</td>
                        <td className="px-5 py-3.5 text-gray-500 text-xs">{fmtDate(r.start_time)}</td>
                        <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">
                          {fmtTime(r.start_time)} – {fmtTime(r.end_time)}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setDetailReservation(r)}
                              className="text-gray-400 hover:text-blue-600 text-xs font-medium transition-colors"
                            >
                              Ver
                            </button>
                            {r.status === 'pending' && (
                              <>
                                <ProtectedButton
                                  permission={{ module: 'reservations', action: 'edit' }}
                                  onClick={() => handleApprove(r.id)}
                                  disabled={actionLoading === r.id}
                                  className="text-green-600 hover:text-green-800 text-xs font-medium disabled:opacity-40 transition-colors"
                                >
                                  Aprobar
                                </ProtectedButton>
                                <ProtectedButton
                                  permission={{ module: 'reservations', action: 'edit' }}
                                  onClick={() => { setRejectModal({ id: r.id }); setRejectReason('') }}
                                  disabled={actionLoading === r.id}
                                  className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40 transition-colors"
                                >
                                  Rechazar
                                </ProtectedButton>
                              </>
                            )}
                            {r.status === 'pending' && (
                              r.user_id === user?.id ? (
                                <button
                                  onClick={() => handleCancel(r.id)}
                                  disabled={actionLoading === r.id}
                                  className="text-orange-500 hover:text-orange-700 text-xs font-medium disabled:opacity-40 transition-colors"
                                >
                                  Cancelar
                                </button>
                              ) : (
                                <ProtectedButton
                                  permission={{ module: 'reservations', action: 'edit' }}
                                  onClick={() => handleCancel(r.id)}
                                  disabled={actionLoading === r.id}
                                  className="text-orange-500 hover:text-orange-700 text-xs font-medium disabled:opacity-40 transition-colors"
                                >
                                  Cancelar
                                </ProtectedButton>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Página {currentPage} de {totalPages} — {total} reservas</span>
            <div className="flex gap-2">
              <button
                onClick={() => loadReservations(currentPage - 1)}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                ← Anterior
              </button>
              <button
                onClick={() => loadReservations(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Nueva Reserva ─────────────────────────────────────────────── */}
      {showModal && (
        <Modal title="Nueva Reserva" onClose={() => setShowModal(false)}>
          <div className="space-y-4">

            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 flex gap-3">
              <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-blue-700 leading-relaxed">
                Toda reserva inicia en estado <strong>pendiente</strong>. Solo se pueden reservar equipos disponibles y en fechas futuras.
              </p>
            </div>

            {/* Selector de usuario — solo para admin/superadmin */}
            {(perms.isAdmin() || perms.isSuperAdmin()) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Usuario / Estudiante <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white transition-colors ${
                    formErrors.user_id ? 'border-red-400 bg-red-50' : 'border-gray-200'
                  }`}
                >
                  <option value="">Asignar a mí mismo</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.last_name ? ' ' + u.last_name : ''} — {u.role?.name ?? ''}
                    </option>
                  ))}
                </select>
                <FieldError msg={formErrors.user_id} />
              </div>
            )}

            {/* Equipo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Equipo <span className="text-red-400">*</span>
              </label>
              <select
                value={form.equipment_id}
                onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white transition-colors ${
                  formErrors.equipment_id ? 'border-red-400 bg-red-50' : 'border-gray-200'
                }`}
              >
                <option value="">Seleccionar equipo disponible…</option>
                {equipment.map((eq) => {
                  const catName = eq.category?.name ?? ''
                  return (
                    <option key={eq.id} value={eq.id}>
                      {eq.name}{catName ? ` · ${catName}` : ''}{eq.stock != null ? ` · Stock: ${eq.stock}` : ''}
                    </option>
                  )
                })}
              </select>
              <FieldError msg={formErrors.equipment_id} />

              {/* Vista previa del equipo seleccionado */}
              {form.equipment_id && (() => {
                const sel = equipment.find(e => String(e.id) === form.equipment_id)
                if (!sel) return null
                const img = getEquipmentImage(sel)
                return (
                  <div className="mt-2 flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 overflow-hidden shrink-0">
                      {img
                        ? <img src={img} alt={sel.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{sel.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {sel.category?.name && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 font-medium">
                            {sel.category.name}
                          </span>
                        )}
                        {sel.stock != null && (
                          <span className="text-xs text-gray-500">Stock: {sel.stock}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {equipment.length === 0 && (
                <p className="flex items-center gap-1 text-amber-600 text-xs mt-1">
                  <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  No hay equipos disponibles en este momento.
                </p>
              )}
            </div>

            {/* Disponibilidad del equipo */}
            {form.equipment_id && (
              <div>
                {checkingEquipmentAvailability ? (
                  <div className="flex items-center justify-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="animate-spin">
                      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                    <span className="text-sm text-blue-700 font-medium">Verificando disponibilidad...</span>
                  </div>
                ) : equipmentAvailability ? (
                  <div className={`p-4 rounded-lg border ${
                    equipmentAvailability.is_available_now
                      ? 'bg-green-50 border-green-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {equipmentAvailability.is_available_now ? (
                          <>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-2 h-2 rounded-full bg-green-500"></span>
                              <p className="text-sm font-semibold text-green-700">Disponible ahora</p>
                            </div>
                            <p className="text-xs text-green-600">
                              Puedes usar este equipo a partir de ahora. La fecha y hora han sido auto-rellenadas.
                            </p>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              <p className="text-sm font-semibold text-amber-700">Próximo disponible</p>
                            </div>
                            <p className="text-xs text-amber-600 mb-2">
                              Próximo slot: <strong>{equipmentAvailability.next_available.date}</strong> a las{' '}
                              <strong>{equipmentAvailability.next_available.time}</strong>
                            </p>
                            <p className="text-xs text-amber-600">
                              La fecha y hora han sido auto-rellenadas con el próximo horario disponible.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Fecha y hora de inicio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hora de Inicio <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  min={new Date().toISOString().slice(0, 10)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors ${
                    formErrors.start_date ? 'border-red-400 bg-red-50' : 'border-gray-200'
                  }`}
                />
                <select
                  value={form.start_hour}
                  onChange={(e) => setForm({ ...form, start_hour: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <option value="">Seleccionar hora...</option>
                  {getAvailableTimeOptions(form.start_date).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <FieldError msg={formErrors.start_date} />
            </div>

            {/* Fecha y hora de fin */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hora de Fin <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  min={form.start_date || new Date().toISOString().slice(0, 10)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors ${
                    formErrors.end_date ? 'border-red-400 bg-red-50' : 'border-gray-200'
                  }`}
                />
                <select
                  value={form.end_hour}
                  onChange={(e) => setForm({ ...form, end_hour: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <option value="">Seleccionar hora...</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <FieldError msg={formErrors.end_date} />
            </div>

            {/* Indicador de disponibilidad */}
            {availabilityStatus !== 'unknown' && (
              <div className={`flex items-center gap-2.5 text-xs px-4 py-3 rounded-lg border ${
                availabilityStatus === 'checking'
                  ? 'bg-gray-50 border-gray-200 text-gray-500'
                  : availabilityStatus === 'available'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {availabilityStatus === 'checking' && (
                  <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {availabilityStatus === 'available' && (
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {(availabilityStatus === 'unavailable' || availabilityStatus === 'past') && (
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className="font-medium">
                  {availabilityStatus === 'checking'    && 'Verificando disponibilidad…'}
                  {availabilityStatus === 'available'   && 'Equipo disponible en el horario seleccionado'}
                  {availabilityStatus === 'unavailable' && 'El equipo ya se encuentra reservado en el horario seleccionado'}
                  {availabilityStatus === 'past'        && 'El horario seleccionado ya ha transcurrido. Elige una hora futura.'}
                </span>
              </div>
            )}

            {/* Notas */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                placeholder="Propósito o detalles adicionales…"
              />
            </div>

            {/* Acciones */}
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || availabilityStatus === 'unavailable' || availabilityStatus === 'checking' || availabilityStatus === 'past'}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Creando…
                  </>
                ) : 'Crear Reserva'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Rechazar ──────────────────────────────────────────────────── */}
      {rejectModal && (
        <Modal title="Rechazar Reserva" onClose={() => setRejectModal(null)} size="sm">
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 flex gap-3">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs text-red-700">Esta acción no se puede deshacer. Se registrará en el historial de auditoría.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motivo del rechazo <span className="text-red-400">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                placeholder="Indica el motivo…"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRejectModal(null)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading !== null}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading !== null ? 'Rechazando…' : 'Confirmar Rechazo'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Detalle ───────────────────────────────────────────────────── */}
      {detailReservation && (
        <Modal title={`Reserva #${detailReservation.id}`} onClose={() => setDetailReservation(null)}>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">ID Reserva</p>
                <p className="text-gray-800 font-medium">#{detailReservation.id}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Equipo</p>
                <p className="text-gray-800 font-medium">
                  {detailReservation.equipment?.name ?? `#${detailReservation.equipment_id}`}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Fecha Solicitud</p>
                <p className="text-gray-700">{fmtDateTime(detailReservation.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Fecha Reserva</p>
                <p className="text-gray-700">{fmtDate(detailReservation.start_time)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Hora</p>
                <p className="text-gray-700">{fmtTime(detailReservation.start_time)} – {fmtTime(detailReservation.end_time)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Estado</p>
                <StatusBadge status={detailReservation.status} />
              </div>
            </div>

            {detailReservation.rejection_reason && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                <p className="text-xs text-red-400 uppercase font-semibold tracking-wide mb-1">Motivo de rechazo</p>
                <p className="text-red-700 text-xs">{detailReservation.rejection_reason}</p>
              </div>
            )}

            {detailReservation.notes && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Notas</p>
                <p className="text-gray-700">{detailReservation.notes}</p>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setDetailReservation(null)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export default ReservationsPage
