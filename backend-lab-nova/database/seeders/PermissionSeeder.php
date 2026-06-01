<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Models\Role;
use App\Models\Module;
use App\Models\Permission;
use App\Models\RoleModulePermission;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        Schema::disableForeignKeyConstraints();

        RoleModulePermission::truncate();
        Module::truncate();
        Permission::truncate();
        Role::truncate();

        Schema::enableForeignKeyConstraints();

        $roles = [
            'Super Admin' => 'Acceso total al sistema',
            'Administrador' => 'Administra usuarios, equipos, reservas y reportes',
            'Encargado de Laboratorio' => 'Gestiona equipos y reservas',
            'Docente' => 'Solicita reservas y consulta reportes',
            'Estudiante' => 'Solicita y consulta sus reservas',
        ];

        foreach ($roles as $name => $description) {
            Role::create([
                'name' => $name,
                'description' => $description,
                'status' => 1,
            ]);
        }

        $superAdmin = Role::where('name', 'Super Admin')->first();
        $admin = Role::where('name', 'Administrador')->first();
        $labManager = Role::where('name', 'Encargado de Laboratorio')->first();
        $teacher = Role::where('name', 'Docente')->first();
        $student = Role::where('name', 'Estudiante')->first();

        $dashboard = Module::create([
            'name' => 'Dashboard',
            'slug' => 'dashboard',
            'icon' => 'mdi-view-dashboard',
            'route' => '/dashboard',
            'parent_id' => null,
            'is_active' => 1,
            'sort_order' => 1,
            'show_in_sidebar' => 1,
        ]);

        $catalogManagement = Module::create([
            'name' => 'Gestión de Catálogo',
            'slug' => 'catalog-management',
            'icon' => 'mdi-laptop',
            'route' => null,
            'parent_id' => null,
            'is_active' => 1,
            'sort_order' => 2,
            'show_in_sidebar' => 1,
        ]);

        $reservationManagement = Module::create([
            'name' => 'Gestión de Reservas',
            'slug' => 'reservation-management',
            'icon' => 'mdi-calendar-clock',
            'route' => null,
            'parent_id' => null,
            'is_active' => 1,
            'sort_order' => 3,
            'show_in_sidebar' => 1,
        ]);

        $reportManagement = Module::create([
            'name' => 'Gestión de Reportes',
            'slug' => 'report-management',
            'icon' => 'mdi-file-chart',
            'route' => null,
            'parent_id' => null,
            'is_active' => 1,
            'sort_order' => 4,
            'show_in_sidebar' => 1,
        ]);

        $accessManagement = Module::create([
            'name' => 'Gestión de Acceso',
            'slug' => 'access-management',
            'icon' => 'mdi-shield-account',
            'route' => null,
            'parent_id' => null,
            'is_active' => 1,
            'sort_order' => 5,
            'show_in_sidebar' => 1,
        ]);

        $categories = Module::create([
            'name' => 'Categorías',
            'slug' => 'categories',
            'icon' => 'mdi-shape',
            'route' => '/categories',
            'parent_id' => $catalogManagement->id,
            'is_active' => 1,
            'sort_order' => 1,
            'show_in_sidebar' => 1,
        ]);

        $equipment = Module::create([
            'name' => 'Equipos',
            'slug' => 'equipment',
            'icon' => 'mdi-desktop-classic',
            'route' => '/equipment',
            'parent_id' => $catalogManagement->id,
            'is_active' => 1,
            'sort_order' => 2,
            'show_in_sidebar' => 1,
        ]);

        $reservations = Module::create([
            'name' => 'Reservas',
            'slug' => 'reservations',
            'icon' => 'mdi-calendar',
            'route' => '/reservations',
            'parent_id' => $reservationManagement->id,
            'is_active' => 1,
            'sort_order' => 1,
            'show_in_sidebar' => 1,
        ]);

        $reservationLogs = Module::create([
            'name' => 'Historial de Reservas',
            'slug' => 'reservation-logs',
            'icon' => 'mdi-history',
            'route' => '/reservation-logs',
            'parent_id' => $reservationManagement->id,
            'is_active' => 1,
            'sort_order' => 2,
            'show_in_sidebar' => 1,
        ]);

        $reportRequests = Module::create([
            'name' => 'Solicitudes de Reportes',
            'slug' => 'report-requests',
            'icon' => 'mdi-file-send',
            'route' => '/report-requests',
            'parent_id' => $reportManagement->id,
            'is_active' => 1,
            'sort_order' => 1,
            'show_in_sidebar' => 1,
        ]);

        $reports = Module::create([
            'name' => 'Reportes',
            'slug' => 'reports',
            'icon' => 'mdi-file-chart',
            'route' => '/reports',
            'parent_id' => $reportManagement->id,
            'is_active' => 1,
            'sort_order' => 2,
            'show_in_sidebar' => 1,
        ]);

        $users = Module::create([
            'name' => 'Usuarios',
            'slug' => 'users',
            'icon' => 'mdi-account-group',
            'route' => '/users',
            'parent_id' => $accessManagement->id,
            'is_active' => 1,
            'sort_order' => 1,
            'show_in_sidebar' => 1,
        ]);

        $rolesModule = Module::create([
            'name' => 'Roles',
            'slug' => 'roles',
            'icon' => 'mdi-badge-account',
            'route' => '/roles',
            'parent_id' => $accessManagement->id,
            'is_active' => 1,
            'sort_order' => 2,
            'show_in_sidebar' => 1,
        ]);

        $permissionList = collect([
            ['name' => 'Ver', 'slug' => 'view'],
            ['name' => 'Crear', 'slug' => 'create'],
            ['name' => 'Editar', 'slug' => 'edit'],
            ['name' => 'Eliminar', 'slug' => 'delete'],
        ])->map(fn ($permission) => Permission::create($permission));

        $assignPermissions = function ($role, $modules, $permissions) {
            foreach ($modules as $module) {
                foreach ($permissions as $permission) {
                    RoleModulePermission::create([
                        'role_id' => $role->id,
                        'module_id' => $module->id,
                        'permission_id' => $permission->id,
                    ]);
                }
            }
        };

        $assignPermissions($superAdmin, Module::all(), $permissionList);

        $assignPermissions($admin, [
            $dashboard,
            $categories,
            $equipment,
            $reservations,
            $reservationLogs,
            $reportRequests,
            $reports,
            $users,
        ], $permissionList);

        $assignPermissions($labManager, [
            $dashboard,
            $categories,
            $equipment,
            $reservations,
            $reservationLogs,
            $reportRequests,
            $reports,
        ], $permissionList);

        $assignPermissions($teacher, [
            $dashboard,
            $equipment,        // necesita ver equipos para crear reservas
            $reservations,
            $reportRequests,
            $reports,
        ], $permissionList->whereIn('slug', ['view', 'create']));

        $assignPermissions($student, [
            $dashboard,
            $equipment,   // necesita ver equipos para poder crear reservas
            $reservations,
        ], $permissionList->whereIn('slug', ['view', 'create']));

        $this->command->info('✅ Roles, módulos y permisos creados correctamente');
    }
}
