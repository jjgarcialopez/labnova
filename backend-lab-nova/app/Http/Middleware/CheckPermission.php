<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next, string $module, string $permission = 'view'): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        if (!$user->role) {
            return response()->json([
                'message' => 'El usuario no tiene un rol asignado.',
                'error' => 'ROLE_NOT_ASSIGNED'
            ], 403);
        }

        // Super Admin tiene acceso a todo
        if ($user->role->name === 'Super Admin') {
            return $next($request);
        }

        // Verificar si el usuario tiene permiso en este módulo
        $hasPermission = $user->role
            ->modulePermissions()
            ->whereHas('module', function ($query) use ($module) {
                $query->where('slug', $module);
            })
            ->whereHas('permission', function ($query) use ($permission) {
                $query->where('slug', $permission);
            })
            ->exists();

        if (!$hasPermission) {
            return response()->json([
                'message' => "No tienes permiso para {$permission} en el módulo {$module}",
                'error' => 'PERMISSION_DENIED'
            ], 403);
        }

        return $next($request);
    }
}
