<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use App\Services\RoleAccessService;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:50', 'regex:/^[\p{L}\s]+$/u'],
            'last_name' => ['required', 'string', 'max:60', 'regex:/^[\p{L}\s]+$/u'],
            'email' => 'nullable|email|unique:users,email',
            'password' => 'required|string|min:6',
            'phone' => 'nullable|string|max:20|unique:users,phone',
            'status' => 'required|boolean',
            'role_id' => ['required', 'exists:roles,id'],
            'gender_id' => 'nullable|exists:genders,id',
            'birthdate' => 'nullable|date',
            'address' => 'nullable|string|max:100',
            'addon_address' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required'      => 'Todos los campos obligatorios deben completarse.',
            'name.regex'         => 'El nombre solo puede contener letras y espacios.',
            'last_name.required' => 'Todos los campos obligatorios deben completarse.',
            'last_name.regex'    => 'El apellido solo puede contener letras y espacios.',
            'email.email'        => 'Formato de correo inválido.',
            'email.unique'       => 'El correo ya se encuentra registrado.',
            'phone.unique'       => 'El teléfono ya se encuentra registrado.',
            'password.required'  => 'Todos los campos obligatorios deben completarse.',
            'password.min'       => 'La contraseña debe tener al menos 6 caracteres.',
            'role_id.required'   => 'Todos los campos obligatorios deben completarse.',
            'role_id.exists'     => 'Rol no válido.',
            'status.required'    => 'Todos los campos obligatorios deben completarse.',
        ];
    }
}
