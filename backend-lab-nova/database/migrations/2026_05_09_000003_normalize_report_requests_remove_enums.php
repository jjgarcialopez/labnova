<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Migración: Normalizar tabla report_requests - Reemplazar ENUMs por Foreign Keys
 *
 * Esta migración:
 * 1. Migra datos del ENUM 'type' a report_type_id
 * 2. Migra datos del ENUM 'status' a report_status_id
 * 3. Elimina ambas columnas ENUM (no escalables)
 *
 * Antes:
 *   type ENUM('reservations', 'equipment_usage', 'user_activity') - hardcodeado
 *   status ENUM('pending', 'processing', 'completed', 'failed') - hardcodeado
 *
 * Después:
 *   report_type_id BIGINT FOREIGN KEY (escalable)
 *   report_status_id BIGINT FOREIGN KEY (escalable)
 *
 * @see \App\Models\ReportRequest
 * @see \App\Models\ReportType
 * @see \App\Models\ReportStatus
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('report_requests', function (Blueprint $table) {
            // Agregar foreign key para tipos de reporte
            if (!Schema::hasColumn('report_requests', 'report_type_id')) {
                $table->unsignedBigInteger('report_type_id')->nullable()->after('user_id');
                $table->foreign('report_type_id')
                    ->references('id')
                    ->on('report_types')
                    ->nullOnDelete();
            }

            // Agregar foreign key para estados de reporte
            if (!Schema::hasColumn('report_requests', 'report_status_id')) {
                $table->unsignedBigInteger('report_status_id')->nullable()->after('end_date');
                $table->foreign('report_status_id')
                    ->references('id')
                    ->on('report_statuses')
                    ->nullOnDelete();
            }
        });

        // Migrar tipo de reporte (type → report_type_id)
        DB::statement('
            UPDATE report_requests
            SET report_type_id = (
                SELECT id FROM report_types
                WHERE report_types.code = report_requests.type
                LIMIT 1
            )
            WHERE type IS NOT NULL
        ');

        // Establecer por defecto si no fue migrado
        DB::statement('
            UPDATE report_requests
            SET report_type_id = 1
            WHERE report_type_id IS NULL
        ');

        // Migrar estado de reporte (status → report_status_id)
        DB::statement('
            UPDATE report_requests
            SET report_status_id = (
                SELECT id FROM report_statuses
                WHERE report_statuses.code = report_requests.status
                LIMIT 1
            )
            WHERE status IS NOT NULL
        ');

        // Establecer por defecto si no fue migrado
        DB::statement('
            UPDATE report_requests
            SET report_status_id = 1
            WHERE report_status_id IS NULL
        ');

        // Eliminar columnas ENUM (no escalables)
        Schema::table('report_requests', function (Blueprint $table) {
            // Simplemente eliminar las columnas - los índices se eliminarán automáticamente
            $table->dropColumn(['type', 'status']);
        });

        // Agregar índices para optimización
        Schema::table('report_requests', function (Blueprint $table) {
            $table->index('report_type_id');
            $table->index('report_status_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('report_requests', function (Blueprint $table) {
            // Recrear columnas ENUM para rollback
            $table->enum('type', ['reservations', 'equipment_usage', 'user_activity'])
                ->after('user_id');

            $table->enum('status', ['pending', 'processing', 'completed', 'failed'])
                ->default('pending')
                ->after('end_date');

            // Migrar datos de vuelta
            DB::statement('
                UPDATE report_requests
                SET type = (
                    SELECT code FROM report_types
                    WHERE report_types.id = report_requests.report_type_id
                    LIMIT 1
                )
                WHERE report_type_id IS NOT NULL
            ');

            DB::statement('
                UPDATE report_requests
                SET status = (
                    SELECT code FROM report_statuses
                    WHERE report_statuses.id = report_requests.report_status_id
                    LIMIT 1
                )
                WHERE report_status_id IS NOT NULL
            ');

            // Eliminar foreign keys e índices
            $table->dropIndex(['report_type_id']);
            $table->dropIndex(['report_status_id']);
            $table->dropForeign(['report_type_id']);
            $table->dropForeign(['report_status_id']);
            $table->dropColumn(['report_type_id', 'report_status_id']);
        });
    }
};
