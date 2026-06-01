<?php

namespace App\Services;

use App\Models\Role;
use App\Models\User;

class RoleAccessService
{
    private const SUPER_ADMIN = 'Super Admin';

    public static function isSuperAdmin(?User $user): bool
    {
        return $user?->role?->name === self::SUPER_ADMIN;
    }

    public static function isSuperAdminRole(?Role $role): bool
    {
        return $role?->name === self::SUPER_ADMIN;
    }

    public static function canManageRole(?User $actor, ?Role $role): bool
    {
        if (! $actor || ! $role) {
            return false;
        }

        return ! self::isSuperAdminRole($role) || self::isSuperAdmin($actor);
    }

    public static function canManageUser(?User $actor, ?User $target): bool
    {
        if (! $actor || ! $target) {
            return false;
        }

        return self::canManageRole($actor, $target->role);
    }

    public static function canAssignRole(?User $actor, ?Role $role): bool
    {
        return self::canManageRole($actor, $role);
    }
}
