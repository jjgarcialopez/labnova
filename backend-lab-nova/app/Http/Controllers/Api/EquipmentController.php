<?php

namespace App\Http\Controllers\Api;

use App\Models\Equipment;
use App\Models\EquipmentImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use App\Http\Controllers\Controller;
use App\Http\Resources\EquipmentResource;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use App\Http\Requests\EquipmentStoreRequest;
use App\Http\Requests\EquipmentUpdateRequest;

class EquipmentController extends Controller
{
    public function index(): JsonResponse
    {
        try {
            $equipment = Equipment::with(['category', 'images', 'equipmentStatus'])->latest()->get();

            return response()->json([
                'success' => true,
                'message' => 'Listado de equipos',
                'data' => EquipmentResource::collection($equipment),
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al listar equipos', 'error' => $e->getMessage()], 500);
        }
    }

    public function store(EquipmentStoreRequest $request): JsonResponse
    {
        try {
            $equipment = Equipment::create($request->validated());
            $equipment->load(['category', 'images', 'equipmentStatus']);

            return response()->json([
                'success' => true,
                'message' => 'Equipo registrado correctamente.',
                'data' => new EquipmentResource($equipment),
            ], 201);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al crear equipo', 'error' => $e->getMessage()], 500);
        }
    }

    public function show(int $equipment): JsonResponse
    {
        try {
            $equipment = Equipment::with(['category', 'images', 'reservations', 'equipmentStatus'])->findOrFail($equipment);

            return response()->json([
                'success' => true,
                'message' => 'Detalle del equipo',
                'data' => new EquipmentResource($equipment),
            ]);
        } catch (ModelNotFoundException) {
            return response()->json(['success' => false, 'message' => 'Equipo no encontrado'], 404);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al consultar equipo', 'error' => $e->getMessage()], 500);
        }
    }

    public function update(EquipmentUpdateRequest $request, int $equipment): JsonResponse
    {
        try {
            $model = Equipment::findOrFail($equipment);
            $model->update(array_filter($request->validated(), fn($value) => $value !== null));
            $model->load(['category', 'images', 'equipmentStatus']);

            return response()->json([
                'success' => true,
                'message' => 'Equipo actualizado correctamente',
                'data' => new EquipmentResource($model),
            ]);
        } catch (ModelNotFoundException) {
            return response()->json(['success' => false, 'message' => 'Equipo no encontrado'], 404);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al actualizar equipo', 'error' => $e->getMessage()], 500);
        }
    }

    public function uploadImage(Request $request, int $id): JsonResponse
    {
        try {
            $request->validate([
                'image' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:2048',
            ], [
                'image.required' => 'La imagen es obligatoria.',
                'image.image'    => 'El archivo debe ser una imagen.',
                'image.mimes'    => 'Formatos permitidos: jpeg, png, jpg, gif, webp.',
                'image.max'      => 'La imagen no puede superar 2 MB.',
            ]);

            $model = Equipment::findOrFail($id);

            // Eliminar imagen primaria anterior
            $primary = $model->images()->where('is_primary', true)->first();
            if ($primary) {
                Storage::disk('public')->delete($primary->image_path);
                $primary->delete();
            }

            EquipmentImage::saveImages($request->file('image'), $model->id);
            $model->load(['category', 'images', 'equipmentStatus']);

            return response()->json([
                'success' => true,
                'message' => 'Imagen actualizada correctamente.',
                'data'    => new EquipmentResource($model),
            ]);
        } catch (ModelNotFoundException) {
            return response()->json(['success' => false, 'message' => 'Equipo no encontrado'], 404);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al subir imagen', 'error' => $e->getMessage()], 500);
        }
    }

    public function destroy(int $equipment): JsonResponse
    {
        try {
            $model = Equipment::findOrFail($equipment);

            if ($model->reservations()->whereHas('reservationStatus', fn($q) => $q->whereIn('code', ['pending', 'approved']))->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'No es posible eliminar un equipo con reservas activas.',
                ], 422);
            }

            $model->delete();

            return response()->json([
                'success' => true,
                'message' => 'Equipo eliminado correctamente',
            ]);
        } catch (ModelNotFoundException) {
            return response()->json(['success' => false, 'message' => 'Equipo no encontrado'], 404);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Error al eliminar equipo', 'error' => $e->getMessage()], 500);
        }
    }
}
