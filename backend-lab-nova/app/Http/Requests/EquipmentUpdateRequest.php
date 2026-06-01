<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class EquipmentUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = $this->route('id');

        return [
            'category_id' => ['filled', 'exists:categories,id'],
            'name'        => ['filled', 'string', 'max:150'],
            'code'        => ['filled', 'string', 'max:50', Rule::unique('equipment', 'code')->ignore($id)],
            'description' => ['nullable', 'string'],
            'stock'       => ['filled', 'integer', 'min:0'],
            'status'      => ['nullable', 'in:available,maintenance,out_of_service'],
            'is_active'   => ['nullable', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required'      => 'El nombre del equipo es obligatorio.',
            'code.required'      => 'El código del equipo es obligatorio.',
            'code.unique'        => 'Código de equipo duplicado.',
            'category_id.exists' => 'Categoría no válida.',
            'stock.min'          => 'El stock no puede ser negativo.',
            'stock.integer'      => 'El stock debe ser un número entero.',
        ];
    }
}
