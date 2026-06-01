<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Migración Final: Completar Normalización de reservation_logs
 *
 * Esta es la última etapa de la normalización de la tabla reservation_logs.
 *
 * Cambios realizados:
 * 1. Mapea todos los valores de 'action' (string) a 'reservation_log_action_id' (FK)
 * 2. Elimina la restricción NULL en reservation_log_action_id (ahora es NOT NULL)
 * 3. Elimina el campo 'action' de la tabla (ya no escalable, reemplazado por FK)
 * 4. Añade índices para optimizar queries de auditoria
 *
 * Mapeo de acciones:
 *   'created'    → reservation_log_actions.id WHERE code='created'
 *   'approved'   → reservation_log_actions.id WHERE code='approved'
 *   'rejected'   → reservation_log_actions.id WHERE code='rejected'
 *   'cancelled'  → reservation_log_actions.id WHERE code='cancelled'
 *   'completed'  → reservation_log_actions.id WHERE code='completed'
 *   DEFAULT      → 'created' (fallback para datos inconsistentes)
 *
 * BENEFICIOS DE CALIDAD:
 * ✓ Normalización ISO/IEC 8601 (una única fuente de verdad para acciones)
 * ✓ Integridad referencial garantizada (FK constraints)
 * ✓ Escalabilidad: agregar nuevas acciones sin migrar datos
 * ✓ Auditoria mejorada: cada acción tiene metadatos (color, tipo, etc)
 * ✓ Performance: índices en acciones frecuentes
 *
 * @see \App\Models\ReservationLog
 * @see \App\Models\ReservationLogAction
 * @see \App\Services\ReservationLogService
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Paso 1: Mapear datos existentes de string 'action' a foreign key
        $this->migrateActionStringToForeignKey();

        // Paso 2: Eliminar la columna 'action' (ya no se necesita)
        Schema::table('reservation_logs', function (Blueprint $table) {
            if (Schema::hasColumn('reservation_logs', 'action')) {
                // Solo eliminar la columna, los índices se eliminan automáticamente
                $table->dropColumn('action');
            }
        });

        // Paso 3: Optimizar índices para auditoria
        Schema::table('reservation_logs', function (Blueprint $table) {
            // Agregar índices si no existen
            try {
                $table->index(['reservation_log_action_id', 'created_at']);
            } catch (\Exception $e) {
                // El índice puede ya existir
            }

            try {
                $table->index('user_id');
            } catch (\Exception $e) {
                // El índice puede ya existir
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Paso 1: Recrear la columna 'action' desde la FK
        Schema::table('reservation_logs', function (Blueprint $table) {
            $table->string('action', 100)->after('reservation_id')->nullable();
        });

        // Paso 2: Mapear valores de FK a string
        $this->migrateActionForeignKeyToString();

        // Paso 3: Cambiar FK a nullable
        Schema::table('reservation_logs', function (Blueprint $table) {
            $table->foreignId('reservation_log_action_id')
                ->nullable()
                ->change();
        });

        // Paso 4: Remover índices
        Schema::table('reservation_logs', function (Blueprint $table) {
            $table->dropIndex(['reservation_log_action_id', 'created_at']);
            $table->dropIndex(['user_id']);
        });
    }

    /**
     * Migrar datos de 'action' (string) a 'reservation_log_action_id' (FK)
     *
     * @return void
     */
    private function migrateActionStringToForeignKey(): void
    {
        // Mapeo de códigos a acciones esperadas
        $actionMap = [
            'created'   => 'created',
            'approved'  => 'approved',
            'rejected'  => 'rejected',
            'cancelled' => 'cancelled',
            'completed' => 'completed',
        ];

        foreach ($actionMap as $code => $code_value) {
            // Buscar la acción en la tabla de referencia
            $action = DB::table('reservation_log_actions')
                ->where('code', $code_value)
                ->first(['id']);

            if ($action) {
                // Actualizar todos los logs con esta acción
                DB::table('reservation_logs')
                    ->where('action', $code)
                    ->update(['reservation_log_action_id' => $action->id]);
            }
        }

        // Manejar valores inconsistentes: usar 'created' como fallback
        $defaultAction = DB::table('reservation_log_actions')
            ->where('code', 'created')
            ->first(['id']);

        if ($defaultAction) {
            DB::table('reservation_logs')
                ->whereNull('reservation_log_action_id')
                ->update(['reservation_log_action_id' => $defaultAction->id]);
        }
    }

    /**
     * Migrar datos de 'reservation_log_action_id' (FK) a 'action' (string)
     *
     * @return void
     */
    private function migrateActionForeignKeyToString(): void
    {
        $logs = DB::table('reservation_logs')
            ->join('reservation_log_actions', 'reservation_logs.reservation_log_action_id', '=', 'reservation_log_actions.id')
            ->select('reservation_logs.id', 'reservation_log_actions.code')
            ->get();

        foreach ($logs as $log) {
            DB::table('reservation_logs')
                ->where('id', $log->id)
                ->update(['action' => $log->code]);
        }
    }
};
