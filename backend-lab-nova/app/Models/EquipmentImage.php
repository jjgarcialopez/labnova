<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Attributes\Appends;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Support\Facades\Storage;

#[Fillable(['image_path', 'image_name', 'is_primary', 'equipment_id'])]
#[Appends(['image_url'])]
class EquipmentImage extends Model
{
    // Define the casts for the model attributes
    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
        ];
    }

    // Define the relationship with the Equipment model
    public function equipment()
    {
        return $this->belongsTo(Equipment::class, 'equipment_id');
    }

    // Accessor to get the full URL of the image
    public function getImageUrlAttribute(): ?string
    {
        if ($this->image_path) {
            return Storage::disk('public')->url($this->image_path);
        }
        return null;
    }

    // Static method to save images for a given equipment
    public static function saveImages($uploadedImages, int $equipmentId): void
    {
        $files = is_array($uploadedImages) ? $uploadedImages : [$uploadedImages];

        foreach ($files as $index => $uploadedFile) {
            $path = $uploadedFile->store("equipment_images/{$equipmentId}", 'public');

            self::create([
                'image_path' => $path,
                'image_name' => $uploadedFile->getClientOriginalName(),
                'is_primary' => $index === 0,
                'equipment_id' => $equipmentId,
            ]);
        }
    }
}
