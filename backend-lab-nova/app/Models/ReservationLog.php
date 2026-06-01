<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Model: ReservationLog (Log de Reserva)
 *
 * Tabla de auditoría para registrar todos los cambios y acciones realizadas
 * sobre las reservas del sistema.
 *
 * MEJORAS DE CALIDAD (Normalización ISO):
 * - Usa Foreign Key en lugar de ENUM/string para 'action_type'
 * - Permite escalabilidad: agregar nuevas acciones sin modificar tablas
 * - Integridad referencial: garantiza consistencia de datos
 * - Auditoría mejorada: metadatos de acciones (color, tipo, descripción)
 *
 * @property int $id Identificador único del log
 * @property int $reservation_id ID de la reserva relacionada
 * @property int|null $user_id ID del usuario que realizó la acción
 * @property int $reservation_log_action_id ID del tipo de acción (FK)
 * @property string|null $description Descripción adicional del evento
 * @property \Illuminate\Support\Carbon $created_at Fecha de creación del log
 * @property \Illuminate\Support\Carbon $updated_at Fecha de última modificación
 * @property \Illuminate\Support\Carbon|null $deleted_at Fecha de eliminación (soft delete)
 *
 * @relationships
 * - reservation() : BelongsTo -> Reserva a la que pertenece este log
 * - user() : BelongsTo -> Usuario que realizó la acción
 * - action() : BelongsTo -> Tipo de acción realizada
 *
 * @example
 * $log = ReservationLog::with('action')->first();
 * echo $log->action->name;  // "Aprobada"
 * echo $log->action->color; // "#10b981"
 *
 * @see \App\Models\Reservation
 * @see \App\Models\User
 * @see \App\Models\ReservationLogAction
 * @see \App\Services\ReservationLogService
 */
class ReservationLog extends Model
{
    /**
     * Atributos que pueden ser asignados en masa
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'reservation_id',
        'user_id',
        'reservation_log_action_id',
        'description',
    ];

    /**
     * Casting automático de tipos de atributos
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * Relación: Un log pertenece a una reserva
     *
     * @return BelongsTo<Reservation>
     */
    public function reservation(): BelongsTo
    {
        return $this->belongsTo(Reservation::class, 'reservation_id');
    }

    /**
     * Relación: Un log pertenece a un usuario
     *
     * @return BelongsTo<User>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Relación: Un log está asociado a una acción
     *
     * Esta relación reemplaza el campo 'action' (string) para mejorar:
     * - Integridad referencial
     * - Escalabilidad
     * - Auditoria con metadatos
     *
     * @return BelongsTo<ReservationLogAction>
     */
    public function action(): BelongsTo
    {
        return $this->belongsTo(ReservationLogAction::class, 'reservation_log_action_id');
    }
}
