<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable(['user_id', 'equipment_id', 'start_time', 'end_time', 'reservation_status_id', 'notes', 'rejection_reason', 'approved_by', 'approved_at'])]

/**
 * Model: Reservation (Reserva)
 *
 * Representa una reserva de equipo realizada por un usuario.
 *
 * @property int $id Identificador único
 * @property int $user_id ID del usuario que realiza la reserva
 * @property int $equipment_id ID del equipo reservado
 * @property \Illuminate\Support\Carbon $start_time Fecha y hora de inicio
 * @property \Illuminate\Support\Carbon $end_time Fecha y hora de fin
 * @property int|null $reservation_status_id ID del estado de la reserva
 * @property string|null $notes Notas adicionales de la reserva
 * @property string|null $rejection_reason Razón del rechazo (si aplica)
 * @property int|null $approved_by ID del usuario que aprobó la reserva
 * @property \Illuminate\Support\Carbon|null $approved_at Fecha de aprobación
 * @property \Illuminate\Support\Carbon|null $deleted_at Fecha de eliminación (soft delete)
 * @property \Illuminate\Support\Carbon $created_at Fecha de creación
 * @property \Illuminate\Support\Carbon $updated_at Fecha de última actualización
 *
 * @relationships
 * - user() : BelongsTo -> Usuario que hace la reserva
 * - equipment() : BelongsTo -> Equipo reservado
 * - reservationStatus() : BelongsTo -> Estado de la reserva
 * - approver() : BelongsTo -> Usuario que aprobó la reserva
 * - logs() : HasMany -> Historial de cambios
 *
 * @example
 * $reservation = Reservation::with(['user', 'equipment', 'reservationStatus'])->find(1);
 * $reservation->user->name; // Nombre del usuario
 * $reservation->reservationStatus->name; // "Pendiente", "Aprobada", etc.
 * $reservation->isPending(); // true si está en estado pendiente
 *
 * @see \App\Models\User
 * @see \App\Models\Equipment
 * @see \App\Models\ReservationStatus
 * @see \App\Models\ReservationLog
 */
class Reservation extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'reservations';

    /** Expone el código del estado como campo `status` en el JSON */
    protected $appends = ['status'];

    /**
     * Casting automático de tipos de atributos
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'start_time' => 'datetime',
            'end_time' => 'datetime',
            'approved_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
            'deleted_at' => 'datetime',
        ];
    }

    /**
     * Relación: Una reserva pertenece a un usuario
     *
     * @return BelongsTo<User>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Relación: Una reserva pertenece a un equipo
     *
     * @return BelongsTo<Equipment>
     */
    public function equipment(): BelongsTo
    {
        return $this->belongsTo(Equipment::class, 'equipment_id');
    }

    /**
     * Relación: Una reserva tiene un estado
     *
     * @return BelongsTo<ReservationStatus>
     */
    public function reservationStatus(): BelongsTo
    {
        return $this->belongsTo(ReservationStatus::class, 'reservation_status_id');
    }

    /**
     * Relación: Una reserva puede ser aprobada por un usuario (admin)
     *
     * @return BelongsTo<User>
     */
    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /**
     * Relación: Una reserva tiene muchos logs de cambios
     *
     * @return HasMany<ReservationLog>
     */
    public function logs(): HasMany
    {
        return $this->hasMany(ReservationLog::class);
    }

    /**
     * Scope: Obtener reservas pendientes de aprobación
     *
     * @param \Illuminate\Database\Eloquent\Builder $query
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public function scopePending($query)
    {
        return $query->whereHas('reservationStatus', fn($q) => $q->where('code', 'pending'));
    }

    /**
     * Scope: Obtener reservas aprobadas
     *
     * @param \Illuminate\Database\Eloquent\Builder $query
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public function scopeApproved($query)
    {
        return $query->whereHas('reservationStatus', fn($q) => $q->where('code', 'approved'));
    }

    /**
     * Scope: Obtener reservas rechazadas
     *
     * @param \Illuminate\Database\Eloquent\Builder $query
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public function scopeRejected($query)
    {
        return $query->whereHas('reservationStatus', fn($q) => $q->where('code', 'rejected'));
    }

    /**
     * Scope: Obtener reservas de un usuario específico
     *
     * @param \Illuminate\Database\Eloquent\Builder $query
     * @param int $userId ID del usuario
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public function scopeByUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    /**
     * Scope: Obtener reservas de un equipo específico
     *
     * @param \Illuminate\Database\Eloquent\Builder $query
     * @param int $equipmentId ID del equipo
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public function scopeByEquipment($query, $equipmentId)
    {
        return $query->where('equipment_id', $equipmentId);
    }

    /**
     * Verificar si la reserva está pendiente
     *
     * @return bool
     */
    public function isPending(): bool
    {
        return $this->reservationStatus?->code === 'pending';
    }

    /**
     * Verificar si la reserva está aprobada
     *
     * @return bool
     */
    public function isApproved(): bool
    {
        return $this->reservationStatus?->code === 'approved';
    }

    /**
     * Verificar si la reserva es terminada (no puede cambiar)
     *
     * @return bool
     */
    public function isTerminal(): bool
    {
        return $this->reservationStatus?->is_terminal ?? false;
    }

    public function getStatusName(): ?string
    {
        return $this->reservationStatus?->name;
    }

    /** Accessor: devuelve el code del estado (pending, approved, etc.) como campo `status` */
    public function getStatusAttribute(): ?string
    {
        return $this->reservationStatus?->code;
    }
}
