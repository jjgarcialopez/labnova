<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminPrivilegeEscalationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Role $superAdminRole;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);

        $this->superAdminRole = Role::where('name', 'Super Admin')->firstOrFail();
        $this->admin = User::factory()->admin()->create();
    }

    public function test_admin_cannot_create_super_admin_user(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/users', [
            'name' => 'Security',
            'last_name' => 'Check',
            'email' => 'security-check@example.com',
            'password' => 'password',
            'phone' => '3001112233',
            'status' => true,
            'role_id' => $this->superAdminRole->id,
        ]);

        $response->assertForbidden();
        $this->assertDatabaseMissing('users', ['email' => 'security-check@example.com']);
    }

    public function test_admin_cannot_promote_user_to_super_admin(): void
    {
        $target = User::factory()->create();

        $response = $this->actingAs($this->admin)->putJson("/api/users/{$target->id}", [
            'role_id' => $this->superAdminRole->id,
        ]);

        $response->assertForbidden();
        $this->assertNotSame($this->superAdminRole->id, $target->refresh()->role_id);
    }

    public function test_admin_cannot_delete_super_admin_user(): void
    {
        $superAdmin = User::factory()->create([
            'role_id' => $this->superAdminRole->id,
        ]);

        $response = $this->actingAs($this->admin)->deleteJson("/api/users/{$superAdmin->id}");

        $response->assertForbidden();
        $this->assertFalse($superAdmin->refresh()->trashed());
    }

    public function test_admin_cannot_read_or_assign_role_permissions(): void
    {
        $module = Module::firstOrFail();
        $permission = Permission::firstOrFail();

        $this->actingAs($this->admin)
            ->postJson('/api/permissions/general-data')
            ->assertForbidden();

        $this->actingAs($this->admin)
            ->postJson("/api/permissions/roles/{$this->admin->role_id}/assign", [
                'modules' => [
                    [
                        'module_id' => $module->id,
                        'permission_ids' => [$permission->id],
                    ],
                ],
            ])
            ->assertForbidden();
    }
}
