<?php

namespace Database\Factories;

use App\Models\Equipment;
use App\Models\Reservation;
use App\Models\ReservationStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Reservation>
 */
class ReservationFactory extends Factory
{
    protected $model = Reservation::class;

    public function definition(): array
    {
        $start = fake()->dateTimeBetween('+1 day', '+1 week');

        return [
            'user_id' => User::factory(),
            'equipment_id' => Equipment::factory(),
            'start_time' => $start,
            'end_time' => (clone $start)->modify('+2 hours'),
            'status' => 'pending',
            'reservation_status_id' => ReservationStatus::where('code', 'pending')->value('id'),
            'notes' => fake()->sentence(),
        ];
    }

    public function pending(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'pending',
            'reservation_status_id' => ReservationStatus::where('code', 'pending')->value('id'),
        ]);
    }
}
