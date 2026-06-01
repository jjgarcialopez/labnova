<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\UpdateModulePermissionsRequest;
use App\Http\Requests\BulkAssignPermissionsRequest;
use App\Http\Requests\AssignPermissionsRequest;
use Illuminate\Validation\ValidationException;
use App\Http\Controllers\Controller;
use App\Models\RoleModulePermission;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;
use App\Models\Permission;
use App\Models\Module;
use App\Models\Role;
use App\Services\RoleAccessService;

class PermissionController extends Controller
{
    public function index()
    {
        if (! RoleAccessService::isSuperAdmin(request()->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Solo el Super Admin puede consultar la matriz de permisos.',
            ], 403);
        }

        try {
            $roles = Role::with([
                'modulePermissions.module',
                'modulePermissions.permission'
            ])->get();

            $modules = Module::where('is_active', true)
                ->with('children')
                ->whereNull('parent_id')
                ->orderBy('sort_order')
                ->get();

            $permissions = Permission::all();

            return response()->json([
                'message' => 'Permissions retrieved successfully',
                'data' => [
                    'roles' => $roles,
                    'modules' => $modules,
                    'permissions' => $permissions,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error retrieving permissions',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function getRolePermissions(Role $role)
    {
        if (! RoleAccessService::isSuperAdmin(request()->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Solo el Super Admin puede consultar permisos de roles.',
            ], 403);
        }

        try {
            $permissions = $role->modulePermissions()
                ->with(['module', 'permission'])
                ->get()
                ->groupBy('module.slug')
                ->map(function ($modulePermissions) {
                    return $modulePermissions
                        ->pluck('permission.slug')
                        ->toArray();
                });

            return response()->json([
                'message' => 'Role permissions retrieved successfully',
                'data' => [
                    'role' => $role,
                    'permissions' => $permissions,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error retrieving role permissions',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function assignPermissions(AssignPermissionsRequest $request, Role $role)
    {
        if (! RoleAccessService::isSuperAdmin($request->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Solo el Super Admin puede modificar permisos de roles.',
            ], 403);
        }

        DB::beginTransaction();

        try {

            $validated = $request->validated();

            RoleModulePermission::where('role_id', $role->id)->delete();

            $insertData = [];
            $assignedCount = 0;
            $skippedModules = [];

            foreach ($validated['modules'] as $moduleData) {

                $moduleId = $moduleData['module_id'];
                $permissionIds = $moduleData['permission_ids'] ?? [];

                if (!empty($permissionIds)) {

                    foreach ($permissionIds as $permissionId) {

                        $insertData[] = [
                            'role_id' => $role->id,
                            'module_id' => $moduleId,
                            'permission_id' => $permissionId,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ];

                        $assignedCount++;
                    }
                } else {

                    $module = Module::find($moduleId);
                    $skippedModules[] = $module ? $module->name : "Module ID: {$moduleId}";
                }
            }

            if (!empty($insertData)) {
                RoleModulePermission::insert($insertData);
            }

            DB::commit();

            $message = "Permissions assigned successfully";

            if ($assignedCount > 0) {
                $message .= " ({$assignedCount} permissions assigned)";
            }

            if (!empty($skippedModules)) {
                $message .= ". Modules without permissions: " . implode(', ', $skippedModules);
            }

            return response()->json([
                'success' => true,
                'message' => $message,
                'data' => [
                    'role_id' => $role->id,
                    'modules' => $role->getModulesWithInfo(),
                    'statistics' => [
                        'assigned_permissions' => $assignedCount,
                        'processed_modules' => count($validated['modules']),
                        'modules_without_permissions' => count($skippedModules),
                    ]
                ]
            ], 200);
        } catch (\Exception $e) {

            DB::rollBack();

            Log::error('Error assigning permissions', [
                'role_id' => $role->id,
                'error' => $e->getMessage()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Error assigning permissions'
            ], 500);
        }
    }

    public function updateModulePermissions(
        UpdateModulePermissionsRequest $request,
        Role $role,
        Module $module
    ) {
        if (! RoleAccessService::isSuperAdmin($request->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Solo el Super Admin puede modificar permisos de roles.',
            ], 403);
        }

        DB::beginTransaction();

        try {

            $validated = $request->validated();

            RoleModulePermission::where('role_id', $role->id)
                ->where('module_id', $module->id)
                ->delete();

            $insertData = [];

            foreach ($validated['permission_ids'] as $permissionId) {
                $insertData[] = [
                    'role_id' => $role->id,
                    'module_id' => $module->id,
                    'permission_id' => $permissionId,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            if (!empty($insertData)) {
                RoleModulePermission::insert($insertData);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Module permissions updated successfully',
                'data' => [
                    'role_id' => $role->id,
                    'module_id' => $module->id,
                    'assigned_permissions' => count($validated['permission_ids'])
                ]
            ], 200);
        } catch (\Exception $e) {

            DB::rollBack();

            Log::error('Error updating module permissions', [
                'role_id' => $role->id,
                'module_id' => $module->id,
                'error' => $e->getMessage()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Error updating module permissions'
            ], 500);
        }
    }

    public function removeAllPermissions(Role $role)
    {
        if (! RoleAccessService::isSuperAdmin(request()->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Solo el Super Admin puede modificar permisos de roles.',
            ], 403);
        }

        try {
            DB::beginTransaction();

            RoleModulePermission::where('role_id', $role->id)->delete();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'All permissions removed successfully'
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Error removing permissions',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function removePermission(Role $role, Module $module, Permission $permission)
    {
        if (! RoleAccessService::isSuperAdmin(request()->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Solo el Super Admin puede modificar permisos de roles.',
            ], 403);
        }

        try {
            DB::beginTransaction();

            $deleted = RoleModulePermission::where('role_id', $role->id)
                ->where('module_id', $module->id)
                ->where('permission_id', $permission->id)
                ->delete();

            if (!$deleted) {
                return response()->json([
                    'success' => false,
                    'message' => 'Permission not found for this role and module'
                ], 404);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Permission removed successfully'
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Error removing permission',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function copyPermissions(Request $request)
    {
        if (! RoleAccessService::isSuperAdmin($request->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Solo el Super Admin puede modificar permisos de roles.',
            ], 403);
        }

        try {
            $validated = $request->validate([
                'source_role_id' => 'required|exists:roles,id',
                'target_role_id' => 'required|exists:roles,id|different:source_role_id',
            ]);

            $sourceRole = Role::findOrFail($validated['source_role_id']);
            $targetRole = Role::findOrFail($validated['target_role_id']);

            DB::beginTransaction();

            RoleModulePermission::where('role_id', $targetRole->id)->delete();

            $sourcePermissions = RoleModulePermission::where('role_id', $sourceRole->id)->get();

            foreach ($sourcePermissions as $permission) {
                RoleModulePermission::create([
                    'role_id' => $targetRole->id,
                    'module_id' => $permission->module_id,
                    'permission_id' => $permission->permission_id,
                ]);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => "Permissions copied from {$sourceRole->name} to {$targetRole->name} successfully"
            ]);
        } catch (ValidationException $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Validation error',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Error copying permissions',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getPermissionMatrix()
    {
        if (! RoleAccessService::isSuperAdmin(request()->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Solo el Super Admin puede consultar la matriz de permisos.',
            ], 403);
        }

        try {
            $roles = Role::all();
            $modules = Module::where('is_active', true)->orderBy('sort_order')->get();
            $permissions = Permission::all();

            $rolePermissions = RoleModulePermission::with(['role', 'module', 'permission'])->get();

            $matrix = [];
            foreach ($roles as $role) {
                $matrix[$role->id] = [
                    'role' => $role,
                    'modules' => []
                ];

                foreach ($modules as $module) {
                    $modulePermissions = $rolePermissions
                        ->where('role_id', $role->id)
                        ->where('module_id', $module->id)
                        ->pluck('permission.slug')
                        ->toArray();

                    $matrix[$role->id]['modules'][$module->id] = [
                        'module' => $module,
                        'permissions' => $modulePermissions
                    ];
                }
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'matrix' => $matrix,
                    'roles' => $roles,
                    'modules' => $modules,
                    'permissions' => $permissions
                ]
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error fetching permission matrix',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function bulkAssignPermissions(BulkAssignPermissionsRequest $request)
    {
        if (! RoleAccessService::isSuperAdmin($request->user())) {
            return response()->json([
                'success' => false,
                'message' => 'Solo el Super Admin puede modificar permisos de roles.',
            ], 403);
        }

        DB::beginTransaction();

        try {

            $validated = $request->validated();

            $roleIds = $validated['role_ids'];
            $modules = $validated['modules'];

            RoleModulePermission::whereIn('role_id', $roleIds)->delete();

            $insertData = [];
            $assignedCount = 0;

            foreach ($roleIds as $roleId) {
                foreach ($modules as $moduleData) {

                    $moduleId = $moduleData['module_id'];

                    foreach ($moduleData['permission_ids'] as $permissionId) {

                        $insertData[] = [
                            'role_id' => $roleId,
                            'module_id' => $moduleId,
                            'permission_id' => $permissionId,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ];

                        $assignedCount++;
                    }
                }
            }

            if (!empty($insertData)) {
                RoleModulePermission::insert($insertData);
            }

            DB::commit();

            $roles = Role::whereIn('id', $roleIds)->pluck('name')->toArray();

            return response()->json([
                'success' => true,
                'message' => 'Permissions assigned successfully',
                'data' => [
                    'roles' => $roles,
                    'total_roles' => count($roleIds),
                    'total_assignments' => $assignedCount
                ]
            ], 200);
        } catch (\Exception $e) {

            DB::rollBack();

            Log::error('Error in bulk permission assignment', [
                'role_ids' => $request->input('role_ids'),
                'error' => $e->getMessage()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Error in bulk assignment'
            ], 500);
        }
    }
}
