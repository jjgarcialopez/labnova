<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\PermissionController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\EquipmentController;
use App\Http\Controllers\Api\ReservationController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\ReportRequestController;
use App\Models\Gender;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

Route::middleware('auth:sanctum')->group(function () {

    Route::post('/logout', [AuthController::class, 'logout']);

    // Datos de referencia accesibles para todos los roles autenticados
    Route::get('/genders', fn() => response()->json(Gender::orderBy('sort_order')->get(['id', 'name', 'code'])));

    // Perfil del usuario autenticado
    Route::get('/profile',             [AuthController::class, 'profile']);
    Route::put('/profile',             [AuthController::class, 'updateProfile']);
    Route::post('/profile/password',   [AuthController::class, 'changePassword']);

    // Users - Solo Super Admin y Administrador
    Route::prefix('users')->middleware('permission:users,view')->group(function () {
        Route::get('/general-data', [UserController::class, 'getGeneralData']);
        Route::get('/', [UserController::class, 'index']);
        Route::get('/{id}', [UserController::class, 'show']);
        Route::post('/', [UserController::class, 'store'])->middleware('permission:users,create');
        Route::put('/{id}', [UserController::class, 'update'])->middleware('permission:users,edit');
        Route::delete('/{id}', [UserController::class, 'destroy'])->middleware('permission:users,delete');
    });

    // Permissions - Solo Super Admin y Administrador
    Route::prefix('permissions')->middleware('permission:users,view')->group(function () {
        Route::post('/general-data', [PermissionController::class, 'index']);
        Route::get('/roles/{role}', [PermissionController::class, 'getRolePermissions']);
        Route::post('/roles/{role}/assign', [PermissionController::class, 'assignPermissions'])->middleware('permission:users,edit');
    });

    // Categories - Admin y Encargado Lab
    Route::prefix('categories')->middleware('permission:equipment,view')->group(function () {
        Route::get('/', [CategoryController::class, 'index']);
        Route::get('/{id}', [CategoryController::class, 'show']);
        Route::post('/', [CategoryController::class, 'store'])->middleware('permission:equipment,create');
        Route::put('/{id}', [CategoryController::class, 'update'])->middleware('permission:equipment,edit');
        Route::delete('/{id}', [CategoryController::class, 'destroy'])->middleware('permission:equipment,delete');
    });

    // Equipment - Admin y Encargado Lab
    Route::prefix('equipment')->middleware('permission:equipment,view')->group(function () {
        Route::get('/', [EquipmentController::class, 'index']);
        Route::get('/{id}', [EquipmentController::class, 'show']);
        Route::post('/', [EquipmentController::class, 'store'])->middleware('permission:equipment,create');
        Route::put('/{id}', [EquipmentController::class, 'update'])->middleware('permission:equipment,edit');
        Route::post('/{id}/image', [EquipmentController::class, 'uploadImage'])->middleware('permission:equipment,edit');
        Route::delete('/{id}', [EquipmentController::class, 'destroy'])->middleware('permission:equipment,delete');
    });

    // Reservations - Todos pueden ver sus reservas
    Route::prefix('reservations')->group(function () {
        // Ver disponibilidad de equipos (público para autenticados)
        Route::get('/availability', [ReservationController::class, 'availability']);
        Route::get('/next-available', [ReservationController::class, 'nextAvailable']);

        // Crear reserva (cualquier usuario autenticado pero validado en controller)
        Route::post('/', [ReservationController::class, 'store'])->middleware('permission:reservations,create');

        // Ver reservas propias
        Route::get('/', [ReservationController::class, 'index']);
        Route::get('/{id}', [ReservationController::class, 'show']);

        // Aprobar/Rechazar - Solo Admin y Encargado Lab
        Route::post('/{id}/approve', [ReservationController::class, 'approve'])->middleware('permission:reservations,edit');
        Route::post('/{id}/reject', [ReservationController::class, 'reject'])->middleware('permission:reservations,edit');

        // Cancelar propia reserva
        Route::post('/{id}/cancel', [ReservationController::class, 'cancel']);

        // Ver logs - Solo Admin
        Route::get('/{id}/logs', [ReservationController::class, 'logs'])->middleware('permission:reservations,view');
    });

    // Report Requests
    Route::prefix('report-requests')->group(function () {
        Route::get('/', [ReportRequestController::class, 'index'])->middleware('permission:reports,view');
        Route::post('/', [ReportRequestController::class, 'store'])->middleware('permission:reports,create');
        Route::get('/{id}', [ReportRequestController::class, 'show'])->middleware('permission:reports,view');

        // Aprobar/Rechazar/Completar - Solo Admin
        Route::post('/{id}/approve', [ReportRequestController::class, 'approve'])->middleware('permission:reports,edit');
        Route::post('/{id}/reject', [ReportRequestController::class, 'reject'])->middleware('permission:reports,edit');
        Route::post('/{id}/complete', [ReportRequestController::class, 'complete'])->middleware('permission:reports,edit');
    });

    // Stats de dashboard — accesibles para todos los roles autenticados (filtro por rol en el controller)
    Route::get('/reports/stats/reservations', [ReportController::class, 'statsReservations']);
    Route::get('/reports/stats/equipment',    [ReportController::class, 'statsEquipment']);

    // Reports - Admin y Docentes pueden ver
    Route::prefix('reports')->middleware('permission:reports,view')->group(function () {
        Route::post('/generate', [ReportController::class, 'generate']);
        Route::get('/', [ReportController::class, 'index']);
        Route::get('/{id}', [ReportController::class, 'show']);
        Route::get('/{id}/download', [ReportController::class, 'download']);
        Route::post('/', [ReportController::class, 'store'])->middleware('permission:reports,create');
    });
});
