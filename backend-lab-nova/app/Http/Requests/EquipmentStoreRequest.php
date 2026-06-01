<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class EquipmentStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'category_id' => ['required', 'exists:categories,id'],
            'name'        => ['required', 'string', 'max:150'],
            'code'        => ['required', 'string', 'max:50', 'unique:equipment,code'],
            'description' => ['required', 'string'],
            'stock'       => ['required', 'integer', 'min:0'],
            'status'      => ['required', 'in:available,maintenance,out_of_service'],
            'is_active'   => ['nullable', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required'       => 'El nombre del equipo es obligatorio.',
            'code.required'       => 'El código del equipo es obligatorio.',
            'code.unique'         => 'Código de equipo duplicado.',
            'category_id.required'=> 'La categoría es obligatoria.',
            'category_id.exists'  => 'Categoría no válida.',
            'description.required'=> 'La descripción es obligatoria.',
            'stock.required'      => 'El stock es obligatorio.',
            'stock.min'           => 'El stock no puede ser negativo.',
            'stock.integer'       => 'El stock debe ser un número entero.',
            'status.required'     => 'El estado es obligatorio.',
            'status.in'           => 'El estado debe ser: disponible, mantenimiento o fuera de servicio.',
        ];
    }
}
