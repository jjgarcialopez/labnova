<?php

use App\Models\Module;
use App\Models\Role;
use App\Models\RoleModulePermission;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        $admin = Role::where('name', 'Administrador')->first();
        $rolesModule = Module::where('slug', 'roles')->first();

        if (! $admin || ! $rolesModule) {
            return;
        }

        RoleModulePermission::where('role_id', $admin->id)
            ->where('module_id', $rolesModule->id)
            ->delete();
    }

    public function down(): void
    {
        //
    }
};
