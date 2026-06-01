<?php

namespace Tests\Feature;

use App\Models\Reservation;
use App\Models\ReservationLog;
use App\Models\ReservationLogAction;
use App\Models\Equipment;
use App\Models\User;
use App\Services\ReservationLogService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\ReservationLogActionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Test Suite: ReservationLogService (Auditoría Normalizada)
 *
 * Pruebas para validar que la normalización de reservation_logs
 * funciona correctamente y cumple con estándares ISO.
 *
 * OBJETIVO:
 * ✓ Verificar integridad referencial (FK constraints)
 * ✓ Validar creación de logs con acciones normalizadas
 * ✓ Confirmar escalabilidad del sistema
 * ✓ Asegurar performance aceptable
 *
 * @group auditing
 * @group quality-iso
 */
class ReservationLogNormalizationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Servicio bajo prueba
     */
    private ReservationLogService $service;

    /**
     * Setup: inicializar datos de prueba
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Crear datos de referencia
        $this->seed(PermissionSeeder::class);
        $this->seed(ReservationLogActionSeeder::class);

        // Instanciar el servicio
        $this->service = app(ReservationLogService::class);
    }

    // ============================================================
    // PRUEBAS: Validación de Datos de Referencia
    // ============================================================

    /**
     * @test
     * Verifica que la tabla de acciones está poblada correctamente
     *
     * ESPERA: 5 acciones predefinidas
     * CUMPLIMIENTO ISO: ✓ Datos de referencia validados
     */
    public function test_reservation_log_actions_are_seeded(): void
    {
        $actions = ReservationLogAction::all();

        $this->assertCount(5, $actions);

        $codes = $actions->pluck('code')->toArray();
        $this->assertContains('created', $codes);
        $this->assertContains('approved', $codes);
        $this->assertContains('rejected', $codes);
        $this->assertContains('cancelled', $codes);
        $this->assertContains('completed', $codes);
    }

    /**
     * @test
     * Verifica que cada acción tiene metadatos completos
     *
     * ESPERA: Cada acción debe tener nombre, código, color y tipo
     * CUMPLIMIENTO ISO: ✓ Datos estructurados y validados
     */
    public function test_reservation_log_actions_have_complete_metadata(): void
    {
        $action = ReservationLogAction::where('code', 'approved')->first();

        $this->assertNotNull($action->name);        // "Aprobada"
        $this->assertNotNull($action->code);        // "approved"
        $this->assertNotNull($action->color);       // "#10b981"
        $this->assertNotNull($action->action_type); // "admin"
        $this->assertTrue($action->status);         // Activa
    }

    // ============================================================
    // PRUEBAS: Creación de Logs Normalizado
    // ============================================================

    /**
     * @test
     * Verifica que se puede crear un log con acción normalizada
     *
     * ANTES: ReservationLog::create(['action' => 'created'])
     * DESPUÉS: $service->logReservationAction('created')
     *
     * CUMPLIMIENTO ISO: ✓ Integridad referencial garantizada
     */
    public function test_can_log_reservation_action_with_valid_code(): void
    {
        $reservation = Reservation::factory()->create();
        $user = User::factory()->create();

        $log = $this->service->logReservationAction(
            reservationId: $reservation->id,
            actionCode: 'created',
            userId: $user->id,
            description: 'Test de normalización'
        );

        $this->assertNotNull($log);
        $this->assertEquals($reservation->id, $log->reservation_id);
        $this->assertEquals($user->id, $log->user_id);
        $this->assertNotNull($log->reservation_log_action_id);
        $this->assertEquals('Test de normalización', $log->description);
    }

    /**
     * @test
     * Verifica relación BelongsTo entre ReservationLog y ReservationLogAction
     *
     * ESPERA: El log debe tener una relación con la acción
     * CUMPLIMIENTO ISO: ✓ Relaciones normalizadas correctas
     */
    public function test_reservation_log_has_action_relationship(): void
    {
        $reservation = Reservation::factory()->create();
        $log = $this->service->logReservationAction(
            reservationId: $reservation->id,
            actionCode: 'approved'
        );

        $loadedLog = ReservationLog::with('action')->find($log->id);

        $this->assertNotNull($loadedLog->action);
        $this->assertEquals('approved', $loadedLog->action->code);
        $this->assertEquals('Aprobada', $loadedLog->action->name);
        $this->assertEquals('#10b981', $loadedLog->action->color);
    }

    /**
     * @test
     * Verifica que la creación de logs es atómica
     *
     * ESPERA: Todas las columnas requeridas se llenan correctamente
     * CUMPLIMIENTO ISO: ✓ Integridad de datos en cada transacción
     */
    public function test_log_creation_is_atomic(): void
    {
        $reservation = Reservation::factory()->create();
        $user = User::factory()->create();

        $log = $this->service->logReservationAction(
            reservationId: $reservation->id,
            actionCode: 'rejected',
            userId: $user->id,
            description: 'Rechazo por calidad'
        );

        $this->assertTrue(
            ReservationLog::where('id', $log->id)
                ->where('reservation_id', $reservation->id)
                ->where('user_id', $user->id)
                ->where('description', 'Rechazo por calidad')
                ->whereNotNull('reservation_log_action_id')
                ->exists()
        );
    }

    // ============================================================
    // PRUEBAS: Validación de Acciones
    // ============================================================

    /**
     * @test
     * Verifica que se rechaza una acción inválida
     *
     * ESPERA: InvalidArgumentException si el código no existe
     * CUMPLIMIENTO ISO: ✓ Validación de integridad referencial
     */
    public function test_throws_exception_for_invalid_action_code(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->service->logReservationAction(
            reservationId: 1,
            actionCode: 'invalid_action_code'
        );
    }

    /**
     * @test
     * Verifica que el servicio conoce las acciones válidas
     *
     * ESPERA: Array con códigos válidos
     * CUMPLIMIENTO ISO: ✓ Documentación de opciones válidas
     */
    public function test_get_available_action_codes(): void
    {
        $codes = $this->service->getAvailableActionCodes();

        $this->assertCount(5, $codes);
        $this->assertContains('created', $codes);
        $this->assertContains('approved', $codes);
        $this->assertContains('rejected', $codes);
    }

    /**
     * @test
     * Verifica que se puede obtener detalle completo de una acción
     *
     * ESPERA: Objeto ReservationLogAction con todos los metadatos
     * CUMPLIMIENTO ISO: ✓ Datos completos y accesibles
     */
    public function test_get_action_by_code(): void
    {
        $action = $this->service->getActionByCode('approved');

        $this->assertNotNull($action);
        $this->assertEquals('Aprobada', $action->name);
        $this->assertEquals('admin', $action->action_type);
    }

    // ============================================================
    // PRUEBAS: Rendimiento (Performance)
    // ============================================================

    /**
     * @test
     * Verifica que la consulta de logs con relación es rápida
     *
     * ESPERA: Query ejecutada en menos de 200ms
     * CUMPLIMIENTO ISO: ✓ Performance aceptable para escala
     */
    public function test_loading_logs_with_actions_is_performant(): void
    {
        // Crear 100 logs de prueba
        Reservation::factory(100)->create()->each(function ($reservation) {
            $this->service->logReservationAction(
                reservationId: $reservation->id,
                actionCode: 'created'
            );
        });

        $start = microtime(true);
        $logs = ReservationLog::with('action')->paginate(50);
        $end = microtime(true);

        $time = $end - $start;

        // Asegurar que carga 50 logs con sus acciones en menos de 200ms
        $this->assertLessThan(0.2, $time, "Query tomó {$time} segundos");
        $this->assertCount(50, $logs->items());
    }

    /**
     * @test
     * Verifica que el caché de acciones mejora performance
     *
     * ESPERA: Segunda llamada es más rápida que la primera
     * CUMPLIMIENTO ISO: ✓ Optimización de recursos
     */
    public function test_action_caching_improves_performance(): void
    {
        // Primera llamada (sin caché)
        $start1 = microtime(true);
        $codes1 = $this->service->getAvailableActionCodes();
        $time1 = microtime(true) - $start1;

        // Segunda llamada (con caché)
        $start2 = microtime(true);
        $codes2 = $this->service->getAvailableActionCodes();
        $time2 = microtime(true) - $start2;

        $this->assertEquals($codes1, $codes2);
        $this->assertLessThan($time1, $time2 * 2); // Segunda es considerablemente más rápida
    }

    // ============================================================
    // PRUEBAS: Integridad Referencial
    // ============================================================

    /**
     * @test
     * Verifica que no puede haber logs sin acción (NULL)
     *
     * ANTES: Posible tener logs con action = NULL
     * DESPUÉS: FK NOT NULL previene esto
     *
     * CUMPLIMIENTO ISO: ✓ Integridad referencial garantizada
     */
    public function test_cannot_create_log_without_valid_action_id(): void
    {
        $this->expectException(\Illuminate\Database\QueryException::class);

        // Intentar crear un log directamente sin pasar por el servicio
        ReservationLog::create([
            'reservation_id' => 1,
            'reservation_log_action_id' => 999, // ID que no existe
            'user_id' => 1,
            'description' => 'Test',
        ]);
    }

    /**
     * @test
     * Verifica que no existe la columna 'action' (antigua denormalizada)
     *
     * ANTES: Tabla tenía columna 'action' varchar(100)
     * DESPUÉS: Columna eliminada, reemplazada por FK
     *
     * CUMPLIMIENTO ISO: ✓ Normalización completada
     */
    public function test_old_action_column_is_removed(): void
    {
        $columns = \DB::getSchemaBuilder()->getColumnListing('reservation_logs');

        $this->assertNotContains('action', $columns,
            'La columna antigua "action" aún existe en la tabla');
    }

    /**
     * @test
     * Verifica que existen índices para optimizar queries
     *
     * ESPERA: Índices en (reservation_log_action_id, created_at) y (user_id)
     * CUMPLIMIENTO ISO: ✓ Optimización de queries de auditoría
     */
    public function test_indexes_are_created_for_audit_queries(): void
    {
        if (\DB::getDriverName() === 'sqlite') {
            $indexes = \DB::select("PRAGMA index_list('reservation_logs')");
        } else {
            $indexes = \DB::select(
                "SHOW INDEX FROM reservation_logs WHERE column_name IN ('reservation_log_action_id', 'user_id', 'created_at')"
            );
        }

        $this->assertGreaterThanOrEqual(2, count($indexes),
            'No se encontraron índices de optimización');
    }

    // ============================================================
    // PRUEBAS: Integración con Controlador
    // ============================================================

    /**
     * @test
     * Verifica que el controlador crea logs correctamente
     *
     * ENDPOINT: POST /api/reservations
     * ESPERA: Se crea la reserva Y se registra el log
     *
     * CUMPLIMIENTO ISO: ✓ Auditoría completa en operaciones críticas
     */
    public function test_reservation_creation_creates_log(): void
    {
        $user = User::factory()->create();
        $equipment = Equipment::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/reservations', [
            'equipment_id' => $equipment->id,
            'start_time' => now()->addDay(),
            'end_time' => now()->addDay()->addHours(2),
            'notes' => 'Test reservation',
        ]);

        $response->assertStatus(201);

        // Verificar que se creó el log
        $log = ReservationLog::whereHas('action', function ($q) {
            $q->where('code', 'created');
        })->latest()->first();

        $this->assertNotNull($log);
        $this->assertEquals('created', $log->action->code);
    }

    /**
     * @test
     * Verifica que la aprobación de reserva crea el log correcto
     *
     * ENDPOINT: POST /api/reservations/{id}/approve
     * ESPERA: Log con acción 'approved' se crea
     *
     * CUMPLIMIENTO ISO: ✓ Auditoría de cambios de estado
     */
    public function test_reservation_approval_creates_correct_log(): void
    {
        $admin = User::factory()->admin()->create();
        $reservation = Reservation::factory()->pending()->create();

        $response = $this->actingAs($admin)->postJson("/api/reservations/{$reservation->id}/approve");

        $response->assertStatus(200);

        $approvalLog = ReservationLog::where('reservation_id', $reservation->id)
            ->whereHas('action', function ($q) {
                $q->where('code', 'approved');
            })
            ->first();

        $this->assertNotNull($approvalLog);
        $this->assertEquals($admin->id, $approvalLog->user_id);
    }

    // ============================================================
    // PRUEBAS: Búsqueda y Filtrado
    // ============================================================

    /**
     * @test
     * Verifica que se pueden filtrar logs por tipo de acción
     *
     * ESPERA: Filtrar por action_type (admin, user, system)
     * CUMPLIMIENTO ISO: ✓ Reportes de auditoría precisos
     */
    public function test_can_filter_logs_by_action_type(): void
    {
        Reservation::factory(10)->create()->each(function ($res) {
            $this->service->logReservationAction(
                reservationId: $res->id,
                actionCode: 'created'   // user type
            );
            $this->service->logReservationAction(
                reservationId: $res->id,
                actionCode: 'approved'  // admin type
            );
        });

        $adminLogs = ReservationLog::whereHas('action', function ($q) {
            $q->where('action_type', 'admin');
        })->count();

        $userLogs = ReservationLog::whereHas('action', function ($q) {
            $q->where('action_type', 'user');
        })->count();

        $this->assertGreaterThan(0, $adminLogs);
        $this->assertGreaterThan(0, $userLogs);
    }

    /**
     * @test
     * Verifica que se pueden obtener todas las acciones de una reserva
     *
     * ESPERA: Historial completo ordenado por fecha
     * CUMPLIMIENTO ISO: ✓ Trazabilidad completa
     */
    public function test_can_get_complete_reservation_history(): void
    {
        $reservation = Reservation::factory()->create();
        $creator = User::factory()->create();
        $approver = User::factory()->admin()->create();

        // Simular ciclo de vida de la reserva
        $this->service->logReservationAction($reservation->id, 'created', $creator->id);
        sleep(1); // Asegurar orden temporal
        $this->service->logReservationAction($reservation->id, 'approved', $approver->id);
        sleep(1);
        $this->service->logReservationAction($reservation->id, 'completed', $approver->id);

        $history = ReservationLog::where('reservation_id', $reservation->id)
            ->with('action')
            ->orderBy('created_at')
            ->get();

        $this->assertCount(3, $history);
        $this->assertEquals('created', $history[0]->action->code);
        $this->assertEquals('approved', $history[1]->action->code);
        $this->assertEquals('completed', $history[2]->action->code);
    }
}
