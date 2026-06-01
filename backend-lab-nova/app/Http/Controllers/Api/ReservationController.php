<?php

namespace App\Http\Controllers\Api;

use App\Models\Reservation;
use App\Models\ReservationStatus;
use App\Services\ReservationLogService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Carbon\Carbon;

class ReservationController extends Controller
{
    /**
     * Servicio para gestionar logs de reservas
     *
     * @var \App\Services\ReservationLogService
     */
    private ReservationLogService $logService;

    /**
     * Constructor: inyectar dependencias
     *
     * @param \App\Services\ReservationLogService $logService
     */
    public function __construct(ReservationLogService $logService)
    {
        $this->logService = $logService;
    }

    public function index(Request $request): JsonResponse
    {
        try {
            $user = $request->user();
            $perPage = $request->get('per_page', 15);

            // Estudiantes solo ven sus propias reservas
            if ($user->role->name === 'Estudiante') {
                $reservations = Reservation::with(['user', 'equipment.equipmentStatus', 'approver', 'reservationStatus'])
                    ->where('user_id', $user->id)
                    ->latest()
                    ->paginate($perPage);
            } else {
                $reservations = Reservation::with(['user', 'equipment.equipmentStatus', 'approver', 'reservationStatus'])
                    ->latest()
                    ->paginate($perPage);
            }

            return response()->json([
                'success' => true,
                'message' => 'Listado de reservas',
                'data' => $reservations->items(),
                'meta' => [
                    'total'        => $reservations->total(),
                    'per_page'     => $reservations->perPage(),
                    'current_page' => $reservations->currentPage(),
                    'last_page'    => $reservations->lastPage(),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al listar reservas', 'error' => $e->getMessage()], 500);
        }
    }

    public function store(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            $validated = $request->validate([
                'equipment_id' => 'required|exists:equipment,id',
                'user_id'      => 'nullable|integer|exists:users,id',
                'start_time'   => 'required|date',
                'end_time'     => 'required|date|after:start_time',
                'notes'        => 'nullable|string',
            ], [
                'equipment_id.required' => 'El equipo es obligatorio.',
                'equipment_id.exists'   => 'El equipo seleccionado no existe.',
                'user_id.exists'        => 'El usuario seleccionado no existe.',
                'start_time.required'   => 'La fecha de inicio es obligatoria.',
                'end_time.required'     => 'La fecha de fin es obligatoria.',
                'end_time.after'        => 'La hora final debe ser mayor a la inicial.',
            ]);

            $startTime = Carbon::parse($validated['start_time'])->setTimezone(config('app.timezone'));
            $now = now();

            // Permitir reservas con 1 minuto de margen para evitar problemas de precisión
            if ($startTime->isBefore($now->copy()->subMinute())) {
                return response()->json([
                    'success' => false,
                    'message' => 'No se permiten reservas en fechas pasadas.',
                ], 422);
            }

            if ($this->hasConflict((int) $validated['equipment_id'], $validated['start_time'], $validated['end_time'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'El equipo ya se encuentra reservado en el horario seleccionado.',
                ], 422);
            }

            // Admin/Encargado pueden crear reservas a nombre de otro usuario
            $isAdmin = in_array($user->role->name, ['Super Admin', 'Administrador', 'Encargado de Laboratorio']);
            if ($isAdmin && !empty($validated['user_id'])) {
                $targetUserId = (int) $validated['user_id'];
            } elseif (!$isAdmin && !empty($validated['user_id']) && $validated['user_id'] != $user->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'No tienes permiso para crear reservas para otros usuarios',
                ], 403);
            } else {
                $targetUserId = $user->id;
            }
            $validated['user_id'] = $targetUserId;

            // Obtener el ID del estado 'pending'
            $pendingStatus = ReservationStatus::where('code', 'pending')->first();
            if (!$pendingStatus) {
                return response()->json([
                    'success' => false,
                    'message' => 'Estado de reserva no disponible.',
                ], 500);
            }
            $validated['reservation_status_id'] = $pendingStatus->id;

            $reservation = Reservation::create($validated);
            $reservation->load(['user', 'equipment.equipmentStatus', 'reservationStatus']);

            // Registrar en auditoría usando el servicio
            $this->logService->logReservationAction(
                reservationId: $reservation->id,
                actionCode: 'created',
                userId: $request->user()->id,
                description: 'Reserva creada por estudiante'
            );

            return response()->json([
                'success' => true,
                'message' => 'Reserva creada exitosamente en estado pendiente.',
                'data'    => $reservation,
            ], 201);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al crear reserva', 'error' => $e->getMessage()], 500);
        }
    }

    public function show(int $id): JsonResponse
    {
        try {
            $reservation = Reservation::with(['user', 'equipment.equipmentStatus', 'approver', 'reservationStatus', 'logs'])->findOrFail($id);

            return response()->json(['success' => true, 'message' => 'Detalle de reserva', 'data' => $reservation]);
        } catch (ModelNotFoundException) {
            return response()->json(['success' => false, 'message' => 'Reserva no encontrada'], 404);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al consultar reserva', 'error' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, int $id): JsonResponse
    {
        try {
            $reservation = Reservation::findOrFail($id);

            $validated = $request->validate([
                'start_time' => 'sometimes|date',
                'end_time'   => 'sometimes|date|after:start_time',
                'notes'      => 'nullable|string',
            ]);

            $reservation->update($validated);

            return response()->json(['success' => true, 'message' => 'Reserva actualizada correctamente', 'data' => $reservation]);
        } catch (ModelNotFoundException) {
            return response()->json(['success' => false, 'message' => 'Reserva no encontrada'], 404);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al actualizar reserva', 'error' => $e->getMessage()], 500);
        }
    }

    public function destroy(int $id): JsonResponse
    {
        try {
            Reservation::findOrFail($id)->delete();

            return response()->json(['success' => true, 'message' => 'Reserva eliminada correctamente']);
        } catch (ModelNotFoundException) {
            return response()->json(['success' => false, 'message' => 'Reserva no encontrada'], 404);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al eliminar reserva', 'error' => $e->getMessage()], 500);
        }
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        try {
            $reservation = Reservation::findOrFail($id);

            // Verificar que no exista otra reserva aprobada o pendiente que se solape
            if ($this->hasConflict(
                $reservation->equipment_id,
                $reservation->start_time,
                $reservation->end_time,
                excludeId: $id
            )) {
                return response()->json([
                    'success' => false,
                    'message' => 'No se puede aprobar: el equipo ya tiene una reserva activa en el mismo horario.',
                ], 422);
            }

            // Obtener el estado 'approved'
            $approvedStatus = ReservationStatus::where('code', 'approved')->first();
            if (!$approvedStatus) {
                return response()->json([
                    'success' => false,
                    'message' => 'Estado de reserva no disponible.',
                ], 500);
            }

            $reservation->update([
                'reservation_status_id' => $approvedStatus->id,
                'approved_by'           => $request->user()->id,
                'approved_at'           => now(),
            ]);

            // Registrar en auditoría usando el servicio
            $this->logService->logReservationAction(
                reservationId: $reservation->id,
                actionCode: 'approved',
                userId: $request->user()->id,
                description: 'Reserva aprobada'
            );

            return response()->json(['success' => true, 'message' => 'Reserva aprobada', 'data' => $reservation]);
        } catch (ModelNotFoundException) {
            return response()->json(['success' => false, 'message' => 'Reserva no encontrada'], 404);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al aprobar reserva', 'error' => $e->getMessage()], 500);
        }
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        try {
            $request->validate(['reason' => 'required|string']);

            $reservation = Reservation::findOrFail($id);

            // Obtener el estado 'rejected'
            $rejectedStatus = ReservationStatus::where('code', 'rejected')->first();
            if (!$rejectedStatus) {
                return response()->json([
                    'success' => false,
                    'message' => 'Estado de reserva no disponible.',
                ], 500);
            }

            $reservation->update([
                'reservation_status_id' => $rejectedStatus->id,
                'rejection_reason'      => $request->reason,
            ]);

            // Registrar en auditoría usando el servicio
            $this->logService->logReservationAction(
                reservationId: $reservation->id,
                actionCode: 'rejected',
                userId: $request->user()->id,
                description: 'Reserva rechazada: ' . $request->reason
            );

            return response()->json(['success' => true, 'message' => 'Reserva rechazada', 'data' => $reservation]);
        } catch (ModelNotFoundException) {
            return response()->json(['success' => false, 'message' => 'Reserva no encontrada'], 404);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al rechazar reserva', 'error' => $e->getMessage()], 500);
        }
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        try {
            $user = $request->user();
            $reservation = Reservation::with(['reservationStatus', 'user', 'equipment.equipmentStatus'])->findOrFail($id);

            // Solo el propietario o admin/lab manager pueden cancelar
            if ($reservation->user_id !== $user->id && !in_array($user->role->name, ['Super Admin', 'Administrador', 'Encargado de Laboratorio'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'No tienes permiso para cancelar esta reserva'
                ], 403);
            }

            $currentStatusCode = $reservation->reservationStatus?->code;

            if ($currentStatusCode === 'approved') {
                return response()->json([
                    'success' => false,
                    'message' => 'No es posible cancelar una reserva aprobada.',
                ], 422);
            }

            if ($currentStatusCode !== 'pending') {
                return response()->json([
                    'success' => false,
                    'message' => 'Esta reserva no puede ser cancelada en su estado actual.',
                ], 400);
            }

            // Obtener el estado 'cancelled'
            $cancelledStatus = ReservationStatus::where('code', 'cancelled')->first();
            if (!$cancelledStatus) {
                return response()->json([
                    'success' => false,
                    'message' => 'Estado de reserva no disponible.',
                ], 500);
            }

            $reservation->update(['reservation_status_id' => $cancelledStatus->id]);

            // Registrar en auditoría usando el servicio
            $this->logService->logReservationAction(
                reservationId: $reservation->id,
                actionCode: 'cancelled',
                userId: $request->user()->id,
                description: 'Reserva cancelada'
            );

            return response()->json(['success' => true, 'message' => 'Reserva cancelada correctamente.', 'data' => $reservation]);
        } catch (ModelNotFoundException) {
            return response()->json(['success' => false, 'message' => 'Reserva no encontrada'], 404);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al cancelar reserva', 'error' => $e->getMessage()], 500);
        }
    }

    public function logs(int $id): JsonResponse
    {
        try {
            $logs = ReservationLog::with('user')
                ->where('reservation_id', $id)
                ->latest()
                ->get();

            return response()->json(['success' => true, 'data' => $logs]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al obtener logs', 'error' => $e->getMessage()], 500);
        }
    }

    public function availability(Request $request): JsonResponse
    {
        try {
            $request->validate([
                'equipment_id' => 'required|exists:equipment,id',
                'start_date'   => 'required|date',
                'end_date'     => 'required|date|after:start_date',
            ]);

            $conflict = $this->hasConflict(
                (int) $request->equipment_id,
                $request->start_date,
                $request->end_date
            );

            return response()->json(['available' => !$conflict]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al verificar disponibilidad', 'error' => $e->getMessage()], 500);
        }
    }

    public function nextAvailable(Request $request): JsonResponse
    {
        try {
            $request->validate([
                'equipment_id' => 'required|exists:equipment,id',
            ]);

            $equipmentId = (int) $request->equipment_id;
            $now = now()->setTimezone(config('app.timezone'));

            $statusIds = ReservationStatus::whereIn('code', ['pending', 'approved'])->pluck('id')->toArray();

            $nextReservation = Reservation::where('equipment_id', $equipmentId)
                ->whereIn('reservation_status_id', $statusIds)
                ->where('start_time', '>', $now)
                ->orderBy('start_time', 'asc')
                ->first();

            if (!$nextReservation) {
                return response()->json([
                    'is_available_now' => true,
                    'next_available' => [
                        'date' => $now->format('Y-m-d'),
                        'time' => $now->format('H:i'),
                        'duration_minutes' => 60,
                    ],
                    'reserved_until' => null,
                ]);
            }

            $endTime = $nextReservation->end_time;

            return response()->json([
                'is_available_now' => false,
                'next_available' => [
                    'date' => $endTime->format('Y-m-d'),
                    'time' => $endTime->format('H:i'),
                    'duration_minutes' => 60,
                ],
                'reserved_until' => $nextReservation->end_time->toIso8601String(),
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al obtener disponibilidad', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Verifica si existe alguna reserva activa que se superponga con el rango dado.
     * Cubre los 3 casos de solapamiento:
     *   1. La reserva existente empieza dentro del rango solicitado
     *   2. La reserva existente termina dentro del rango solicitado
     *   3. La reserva existente envuelve completamente el rango solicitado
     */
    private function hasConflict(int $equipmentId, string $start, string $end, ?int $excludeId = null): bool
    {
        // Convertir a Carbon y a la zona horaria de la aplicación
        $startTime = Carbon::parse($start)->setTimezone(config('app.timezone'));
        $endTime = Carbon::parse($end)->setTimezone(config('app.timezone'));

        // Obtener IDs de estados 'pending' y 'approved'
        $statusIds = ReservationStatus::whereIn('code', ['pending', 'approved'])->pluck('id')->toArray();

        return Reservation::where('equipment_id', $equipmentId)
            ->whereIn('reservation_status_id', $statusIds)
            ->when($excludeId, fn($q) => $q->where('id', '!=', $excludeId))
            ->where(function ($q) use ($startTime, $endTime) {
                $q->whereBetween('start_time', [$startTime, $endTime])
                  ->orWhereBetween('end_time', [$startTime, $endTime])
                  ->orWhere(function ($sub) use ($startTime, $endTime) {
                      // Reserva existente envuelve completamente el rango solicitado
                      $sub->where('start_time', '<=', $startTime)
                          ->where('end_time', '>=', $endTime);
                  });
            })->exists();
    }
}
