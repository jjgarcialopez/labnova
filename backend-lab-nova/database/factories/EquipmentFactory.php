<?php

namespace Database\Factories;

use App\Models\Equipment;
use App\Models\EquipmentStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Equipment>
 */
class EquipmentFactory extends Factory
{
    protected $model = Equipment::class;

    public function definition(): array
    {
        return [
            'category_id' => null,
            'name' => fake()->words(3, true),
            'code' => fake()->unique()->bothify('EQ-####'),
            'description' => fake()->sentence(),
            'stock' => 1,
            'status' => 'available',
            'equipment_status_id' => EquipmentStatus::where('code', 'available')->value('id'),
            'is_active' => true,
        ];
    }
}
