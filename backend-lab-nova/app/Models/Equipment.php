<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable(['category_id', 'name', 'code', 'description', 'stock', 'equipment_status_id', 'is_active'])]
#[Hidden([])]

/**
 * Model: Equipment (Equipo)
 *
 * Representa un equipo disponible en el laboratorio que puede ser reservado.
 *
 * @property int $id Identificador único
 * @property int|null $category_id ID de la categoría
 * @property string $name Nombre del equipo
 * @property string $code Código único del equipo
 * @property string|null $description Descripción del equipo
 * @property int $stock Cantidad disponible en inventario
 * @property int|null $equipment_status_id ID del estado del equipo
 * @property bool $is_active Indica si el equipo está activo
 * @property \Illuminate\Support\Carbon|null $deleted_at Fecha de eliminación (soft delete)
 * @property \Illuminate\Support\Carbon $created_at Fecha de creación
 * @property \Illuminate\Support\Carbon $updated_at Fecha de última actualización
 *
 * @relationships
 * - category() : BelongsTo -> Categoría del equipo
 * - status() : BelongsTo -> Estado actual del equipo
 * - images() : HasMany -> Imágenes del equipo
 * - reservations() : HasMany -> Reservas de este equipo
 *
 * @example
 * $equipment = Equipment::with(['category', 'status'])->find(1);
 * $equipment->name; // Nombre del equipo
 * $equipment->status->name; // "Disponible"
 * $equipment->reservations()->approved()->get(); // Reservas aprobadas
 *
 * @see \App\Models\Category
 * @see \App\Models\EquipmentStatus
 * @see \App\Models\EquipmentImage
 * @see \App\Models\Reservation
 */
class Equipment extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * Nombre de la tabla en la base de datos
     *
     * @var string
     */
    protected $table = 'equipment';

    /**
     * Casting automático de tipos de atributos
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'stock' => 'integer',
            'is_active' => 'boolean',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
            'deleted_at' => 'datetime',
        ];
    }

    /**
     * Relación: Un equipo pertenece a una categoría
     *
     * @return BelongsTo<Category>
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'category_id');
    }

    /**
     * Relación: Un equipo tiene un estado
     *
     * @return BelongsTo<EquipmentStatus>
     */
    public function equipmentStatus(): BelongsTo
    {
        return $this->belongsTo(EquipmentStatus::class, 'equipment_status_id');
    }

    /**
     * Relación: Un equipo tiene muchas imágenes
     *
     * @return HasMany<EquipmentImage>
     */
    public function images(): HasMany
    {
        return $this->hasMany(EquipmentImage::class);
    }

    /**
     * Relación: Un equipo tiene muchas reservas
     *
     * @return HasMany<Reservation>
     */
    public function reservations(): HasMany
    {
        return $this->hasMany(Reservation::class);
    }

    /**
     * Scope: Obtener solo equipos activos
     *
     * @param \Illuminate\Database\Eloquent\Builder $query
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /**
     * Scope: Obtener solo equipos disponibles
     *
     * @param \Illuminate\Database\Eloquent\Builder $query
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public function scopeAvailable($query)
    {
        return $query->whereHas('equipmentStatus', fn($q) => $q->where('code', 'available'));
    }

    /**
     * Scope: Filtrar por categoría
     *
     * @param \Illuminate\Database\Eloquent\Builder $query
     * @param int $categoryId ID de la categoría
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public function scopeByCategory($query, $categoryId)
    {
        return $query->where('category_id', $categoryId);
    }

    /**
     * Verificar si el equipo está disponible
     *
     * @return bool
     */
    public function isAvailable(): bool
    {
        return $this->equipmentStatus?->code === 'available' && $this->is_active;
    }

    /**
     * Obtener el nombre del estado del equipo
     *
     * @return string|null
     */
    public function getStatusName(): ?string
    {
        return $this->equipmentStatus?->name;
    }
}
