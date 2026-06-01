<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;
use App\Models\UserDetail;
use App\Models\User;
use App\Models\Role;
use App\Models\Gender;
use App\Services\RoleAccessService;

class UserController extends Controller
{
    public function index()
    {
        try {
            $users = User::with(['userDetail', 'role'])
                ->when(
                    ! RoleAccessService::isSuperAdmin(request()->user()),
                    fn ($query) => $query->whereDoesntHave('role', fn ($roleQuery) => $roleQuery->where('name', 'Super Admin'))
                )
                ->get();

            return response()->json([
                'message' => 'Users retrieved successfully',
                'users' => $users,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error retrieving users',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function store(StoreUserRequest $request)
    {
        $validated = $request->validated();
        $role = Role::find($validated['role_id']);

        if (! RoleAccessService::canAssignRole($request->user(), $role)) {
            return response()->json([
                'message' => 'No tienes permiso para asignar el rol Super Admin.',
            ], 403);
        }

        try {
            DB::beginTransaction();

            $user = User::createUser($validated);

            UserDetail::createUserDetail($validated, $user->id);

            DB::commit();

            return response()->json([
                'message' => 'User created successfully',
                'user' => $user,
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Error creating user',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function show(string $id)
    {
        try {
            $user = User::with(['userDetail', 'role'])->find($id);

            if (!$user) {
                return response()->json(['message' => 'User not found.'], 404);
            }

            if (! RoleAccessService::canManageUser(request()->user(), $user)) {
                return response()->json([
                    'message' => 'No tienes permiso para ver usuarios Super Admin.',
                ], 403);
            }

            return response()->json([
                'message' => 'User retrieved successfully',
                'user' => $user,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error retrieving user',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function update(UpdateUserRequest $request, string $id)
    {
        try {
            $user = User::with(['userDetail', 'role'])->find($id);

            if (!$user) {
                return response()->json(['message' => 'User not found.'], 404);
            }

            if (! RoleAccessService::canManageUser($request->user(), $user)) {
                return response()->json([
                    'message' => 'No tienes permiso para modificar usuarios Super Admin.',
                ], 403);
            }

            $validated = $request->validated();

            if (
                $request->user()?->id === $user->id
                && RoleAccessService::isSuperAdmin($user)
                && (
                    (isset($validated['role_id']) && (int) $validated['role_id'] !== (int) $user->role_id)
                    || (array_key_exists('status', $validated) && ! $validated['status'])
                )
            ) {
                return response()->json([
                    'message' => 'No puedes quitarte tu propio acceso Super Admin.',
                ], 422);
            }

            if (isset($validated['role_id'])) {
                $newRole = Role::find($validated['role_id']);

                if (! RoleAccessService::canAssignRole($request->user(), $newRole)) {
                    return response()->json([
                        'message' => 'No tienes permiso para asignar el rol Super Admin.',
                    ], 403);
                }
            }

            if (empty($validated['password'])) {
                unset($validated['password']);
            }
            $user->updateUser($validated);

            if ($user->userDetail) {
                UserDetail::updateUserDetail($validated, $user);
            } else {
                UserDetail::createUserDetail($validated, $user->id);
            }

            return response()->json([
                'message' => 'User updated successfully',
                'user' => $user,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error updating user',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function destroy(string $id)
    {
        try {
            $user = User::with(['userDetail', 'role'])->find($id);

            if (!$user) {
                return response()->json(['message' => 'User not found.'], 404);
            }

            if (request()->user()?->id === $user->id) {
                return response()->json([
                    'message' => 'No puedes eliminar tu propio usuario.',
                ], 422);
            }

            if (! RoleAccessService::canManageUser(request()->user(), $user)) {
                return response()->json([
                    'message' => 'No tienes permiso para eliminar usuarios Super Admin.',
                ], 403);
            }

            if ($user->reservations()->whereHas('reservationStatus', fn($q) => $q->whereIn('code', ['pending', 'approved']))->exists()) {
                return response()->json([
                    'message' => 'No se puede eliminar el usuario porque posee reservas activas.',
                ], 422);
            }

            $user->delete();

            return response()->json([
                'message' => 'User deleted successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error deleting user',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function getGeneralData()
    {
        try {
            $roles = Role::ordered()
                ->when(
                    ! RoleAccessService::isSuperAdmin(request()->user()),
                    fn ($query) => $query->where('name', '!=', 'Super Admin')
                )
                ->get();
            $genders = Gender::orderBy('sort_order')->get(['id', 'name', 'code']);

            return response()->json([
                'message' => 'General data retrieved successfully',
                'roles'   => $roles,
                'genders' => $genders,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error retrieving general data',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}
