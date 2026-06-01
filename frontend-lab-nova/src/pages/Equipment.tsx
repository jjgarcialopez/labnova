import React, { useEffect, useState, useCallback, useRef } from 'react'
import { equipmentService } from '../services/equipmentService'
import { Equipment, Category } from '../types'
import { Modal } from '../components/common/Modal'
import { ProtectedButton, IfCan } from '../components/ProtectedFeature'

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Equipment['status'], string> = {
  available: 'Disponible',
  maintenance: 'Mantenimiento',
  out_of_service: 'Fuera de servicio',
}

const STATUS_COLORS: Record<Equipment['status'], string> = {
  available: 'bg-green-100 text-green-800',
  maintenance: 'bg-orange-100 text-orange-800',
  out_of_service: 'bg-red-100 text-red-700',
}

// ─── Form type ────────────────────────────────────────────────────────────────

interface EquipmentForm {
  name: string
  code: string
  description: string
  category_id: string
  stock: string
  status: Equipment['status']
  is_active: boolean
}

const EMPTY_FORM: EquipmentForm = {
  name: '',
  code: '',
  description: '',
  category_id: '',
  stock: '',
  status: 'available',
  is_active: true,
}

// ─── Drag & Drop image zone ───────────────────────────────────────────────────

interface ImageDropZoneProps {
  preview: string | null
  onFile: (f: File) => void
  label?: string
}

const ImageDropZone: React.FC<ImageDropZoneProps> = ({ preview, onFile, label = 'Arrastra la imagen aquí' }) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) onFile(file)
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative w-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors overflow-hidden
        ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'}
        ${preview ? 'h-40' : 'h-36'}`}
    >
      {preview ? (
        <>
          <img src={preview} alt="preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <p className="text-white text-xs font-medium">Haz clic o arrastra para cambiar</p>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 text-center pointer-events-none">
          <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-xs text-gray-400">PNG, JPG, GIF, WEBP · máx. 2 MB</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ─── Equipment image helper ───────────────────────────────────────────────────

const API_ORIGIN = import.meta.env.VITE_API_BASE_URL

const normalizeImageUrl = (url?: string | null): string | null => {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`
}

const getPrimaryImage = (eq: Equipment): string | null =>
  normalizeImageUrl(
    eq.images?.find(i => i.is_primary)?.image_url
    ?? eq.images?.[0]?.image_url
    ?? null
  )

// ─── Main component ───────────────────────────────────────────────────────────

const EquipmentPage: React.FC = () => {

  const [equipment, setEquipment]     = useState<Equipment[]>([])
  const [categories, setCategories]   = useState<Category[]>([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [successMsg, setSuccessMsg]   = useState<string | null>(null)

  const [total, setTotal]             = useState(0)
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const [viewMode, setViewMode]       = useState<'grid' | 'list'>('list')

  const [showModal, setShowModal]     = useState(false)
  const [editingId, setEditingId]     = useState<number | null>(null)
  const [form, setForm]               = useState<EquipmentForm>(EMPTY_FORM)
  const [formErrors, setFormErrors]   = useState<Partial<Record<keyof EquipmentForm, string>>>({})

  // Image state
  const [imageFile, setImageFile]     = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError]   = useState<string | null>(null)

  const [deleteId, setDeleteId]       = useState<number | null>(null)
  const [deleting, setDeleting]       = useState(false)

  // Categoria management
  const [showCatModal, setShowCatModal]   = useState(false)
  const [catForm, setCatForm]             = useState({ name: '', description: '' })
  const [editingCatId, setEditingCatId]   = useState<number | null>(null)
  const [savingCat, setSavingCat]         = useState(false)
  const [deletingCatId, setDeletingCatId] = useState<number | null>(null)
  const [catError, setCatError]           = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadEquipment = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await equipmentService.getAllEquipment()
      setEquipment(res.data ?? [])
      setTotal(res.total)
    } catch {
      setError('No se pudo cargar la lista de equipos.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCategories = useCallback(async () => {
    try {
      const cats = await equipmentService.getCategories()
      setCategories(cats ?? [])
    } catch {
      // optional
    }
  }, [])

  useEffect(() => {
    loadEquipment()
    loadCategories()
  }, [loadEquipment, loadCategories])

  // ── Search ─────────────────────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!searchInput.trim()) { setSearch(''); loadEquipment(); return }
    try {
      setLoading(true)
      setSearch(searchInput)
      const results = await equipmentService.searchEquipment(searchInput.trim())
      setEquipment(results ?? [])
      setTotal(results?.length ?? 0)
    } catch {
      setError('Error al buscar equipos.')
    } finally {
      setLoading(false)
    }
  }

  const handleClearSearch = () => {
    setSearchInput('')
    setSearch('')
    loadEquipment()
  }

  const filtered = filterStatus === 'all'
    ? equipment
    : equipment.filter((e) => e.status === filterStatus)

  // ── Image helpers ──────────────────────────────────────────────────────────

  const handleImageFile = (file: File) => {
    setImageFile(file)
    setImageError(null)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const resetImageState = () => {
    setImageFile(null)
    setImagePreview(null)
    setImageError(null)
  }

  // ── Modal open helpers ─────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
    resetImageState()
    setShowModal(true)
  }

  const openEdit = (eq: Equipment) => {
    setEditingId(eq.id)
    setForm({
      name: eq.name,
      code: eq.code ?? '',
      description: eq.description ?? '',
      category_id: eq.category_id ? String(eq.category_id) : '',
      stock: eq.stock ? String(eq.stock) : '',
      status: eq.status,
      is_active: eq.is_active !== false,
    })
    setFormErrors({})
    // Mostrar imagen actual
    const img = getPrimaryImage(eq)
    setImageFile(null)
    setImagePreview(img)
    setImageError(null)
    setShowModal(true)
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const errors: Partial<Record<keyof EquipmentForm, string>> = {}
    if (!form.name.trim()) errors.name = 'El nombre es requerido'
    if (!form.code.trim()) errors.code = 'El codigo es requerido'
    if (!form.category_id) errors.category_id = 'La categoria es requerida'
    if (!form.description.trim()) errors.description = 'La descripción es requerida'
    if (!form.stock.trim()) errors.stock = 'El stock es requerido'
    else if (isNaN(Number(form.stock))) errors.stock = 'El stock debe ser un numero'
    else if (Number(form.stock) < 0) errors.stock = 'El stock no puede ser negativo'
    if (!form.status) errors.status = 'El estado es requerido'

    // Imagen obligatoria solo al crear
    if (!editingId && !imageFile) {
      setImageError('La imagen del equipo es obligatoria.')
      return false
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!validate()) return
    try {
      setSaving(true)
      const payload: Partial<Equipment> = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim() || undefined,
        category_id: form.category_id ? Number(form.category_id) : undefined,
        stock: form.stock ? Number(form.stock) : undefined,
        status: form.status,
        is_active: form.is_active,
      }

      let saved: Equipment
      if (editingId) {
        saved = await equipmentService.updateEquipment(editingId, payload)
      } else {
        saved = await equipmentService.createEquipment(payload)
      }

      // Si hay imagen nueva, subirla
      if (imageFile) {
        saved = await equipmentService.uploadEquipmentImage(saved.id, imageFile)
      }

      setShowModal(false)
      setEquipment((current) => {
        const exists = current.some((item) => item.id === saved.id)
        return exists
          ? current.map((item) => item.id === saved.id ? saved : item)
          : [saved, ...current]
      })
      loadEquipment()
      showSuccess(editingId ? 'Equipo actualizado correctamente.' : 'Equipo registrado correctamente.')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
      const msg = axiosErr?.response?.data?.message ?? 'No se pudo guardar el equipo.'
      const backendErrors = axiosErr?.response?.data?.errors
      if (backendErrors) {
        const mapped: Partial<Record<keyof EquipmentForm, string>> = {}
        if (backendErrors.code) mapped.code = backendErrors.code[0]
        if (backendErrors.name) mapped.name = backendErrors.name[0]
        if (backendErrors.stock) mapped.stock = backendErrors.stock[0]
        setFormErrors(mapped)
      }
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      setDeleting(true)
      await equipmentService.deleteEquipment(deleteId)
      setDeleteId(null)
      showSuccess('Equipo eliminado correctamente.')
      loadEquipment()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      const msg = axiosErr?.response?.data?.message
      setDeleteId(null)
      setError(msg || 'No se pudo eliminar el equipo.')
    } finally {
      setDeleting(false)
    }
  }

  // ── Category handlers ──────────────────────────────────────────────────────

  const handleSaveCat = async () => {
    if (!catForm.name.trim()) { setCatError('El nombre es requerido.'); return }
    try {
      setSavingCat(true)
      setCatError(null)
      if (editingCatId) {
        await equipmentService.updateCategory(editingCatId, catForm)
      } else {
        await equipmentService.createCategory(catForm)
      }
      setCatForm({ name: '', description: '' })
      setEditingCatId(null)
      loadCategories()
      showSuccess(editingCatId ? 'Categoría actualizada.' : 'Categoría creada.')
    } catch {
      setCatError('No se pudo guardar la categoría.')
    } finally {
      setSavingCat(false)
    }
  }

  const handleDeleteCat = async (id: number) => {
    try {
      setDeletingCatId(id)
      await equipmentService.deleteCategory(id)
      loadCategories()
      showSuccess('Categoría eliminada.')
    } catch {
      setCatError('No se pudo eliminar. Verifica que no tenga equipos asociados.')
    } finally {
      setDeletingCatId(null)
    }
  }

  // ── Form field helper ──────────────────────────────────────────────────────

  const field = (label: string, key: keyof EquipmentForm, input: React.ReactNode) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {input}
      {formErrors[key] && <p className="text-red-500 text-xs mt-1">{formErrors[key]}</p>}
    </div>
  )

  const cls = (key: keyof EquipmentForm, base = '') =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${base} ${formErrors[key] ? 'border-red-400' : 'border-gray-200'}`

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Equipos</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} equipos registrados</p>
        </div>
        <div className="flex gap-2">
          <IfCan permission={{ module: 'equipment', action: 'edit' }}>
            <button
              onClick={() => { setCatForm({ name: '', description: '' }); setEditingCatId(null); setCatError(null); setShowCatModal(true) }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-200"
            >
              Categorías
            </button>
          </IfCan>
          <IfCan permission={{ module: 'equipment', action: 'create' }}>
            <button
              onClick={openCreate}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Nuevo Equipo
            </button>
          </IfCan>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">&times;</button>
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {successMsg}
        </div>
      )}

      {/* Filtros + toggle vista */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        {/* Búsqueda */}
        <div className="flex gap-2 flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Buscar por nombre o categoría..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button onClick={handleSearch} className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-sm transition-colors">
            Buscar
          </button>
          {search && (
            <button onClick={handleClearSearch} className="text-gray-400 hover:text-gray-600 text-sm px-2">
              &times; Limpiar
            </button>
          )}
        </div>

        {/* Filtro estado */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="all">Todos los estados</option>
          <option value="available">Disponible</option>
          <option value="maintenance">Mantenimiento</option>
          <option value="out_of_service">Fuera de servicio</option>
        </select>

        {/* Toggle Grid / Lista */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            title="Vista cuadrícula"
            className={`px-3 py-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('list')}
            title="Vista lista"
            className={`px-3 py-2 transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Vista cuadrícula ── */}
      {viewMode === 'grid' && (
        <div>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
                  <div className="h-40 bg-gray-100" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
              <p className="text-lg mb-1">No hay equipos</p>
              <p className="text-sm">{search ? `Sin resultados para "${search}"` : 'Crea el primer equipo.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map((eq) => {
                const img = getPrimaryImage(eq)
                const catName = eq.category?.name ?? categories.find(c => c.id === eq.category_id)?.name
                return (
                  <div key={eq.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
                    {/* Imagen */}
                    <div className="relative h-40 bg-gray-50">
                      {img ? (
                        <img src={img} alt={eq.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-14 h-14 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      {/* Acciones overlay */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ProtectedButton
                          permission={{ module: 'equipment', action: 'edit' }}
                          onClick={() => openEdit(eq)}
                          className="w-7 h-7 bg-white rounded-lg shadow flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </ProtectedButton>
                        <ProtectedButton
                          permission={{ module: 'equipment', action: 'delete' }}
                          onClick={() => setDeleteId(eq.id)}
                          className="w-7 h-7 bg-white rounded-lg shadow flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </ProtectedButton>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-3 space-y-1.5">
                      <p className="font-semibold text-gray-800 text-sm leading-tight truncate">{eq.name}</p>
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        {catName && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                            {catName}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[eq.status]}`}>
                          {STATUS_LABELS[eq.status]}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Stock: <span className="font-semibold text-gray-700">{eq.stock ?? '—'}</span>
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Vista lista ── */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="text-lg mb-1">No hay equipos</p>
              <p className="text-sm">{search ? `Sin resultados para "${search}"` : 'Crea el primer equipo.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">#</th>
                    <th className="px-5 py-3 font-medium">Nombre</th>
                    <th className="px-5 py-3 font-medium">Codigo</th>
                    <th className="px-5 py-3 font-medium">Categoria</th>
                    <th className="px-5 py-3 font-medium">Stock</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 font-medium">Activo</th>
                    <th className="px-5 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((eq) => {
                    const img = getPrimaryImage(eq)
                    const catName = eq.category?.name ?? categories.find(c => c.id === eq.category_id)?.name
                    return (
                      <tr key={eq.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-gray-400 font-mono text-xs">{eq.id}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                              {img
                                ? <img src={img} alt={eq.name} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center">
                                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                              }
                            </div>
                            <span className="font-medium text-gray-800">{eq.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-600">{eq.code}</td>
                        <td className="px-5 py-3 text-gray-600">
                          {catName
                            ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">{catName}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-5 py-3 text-gray-600 text-center">{eq.stock ?? '—'}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[eq.status]}`}>
                            {STATUS_LABELS[eq.status]}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${eq.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {eq.is_active !== false ? 'Si' : 'No'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <ProtectedButton
                            permission={{ module: 'equipment', action: 'edit' }}
                            onClick={() => openEdit(eq)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-3"
                          >
                            Editar
                          </ProtectedButton>
                          <ProtectedButton
                            permission={{ module: 'equipment', action: 'delete' }}
                            onClick={() => setDeleteId(eq.id)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium"
                          >
                            Eliminar
                          </ProtectedButton>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modal crear/editar ─────────────────────────────────────────────── */}
      {showModal && (
        <Modal title={editingId ? 'Editar Equipo' : 'Nuevo Equipo'} onClose={() => setShowModal(false)} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {field('Nombre *', 'name',
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={cls('name')} placeholder="Ej: Microscopio Optico" />
              )}
              {field('Codigo *', 'code',
                <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className={cls('code')} placeholder="Ej: MIC-001" />
              )}
              {field('Categoria *', 'category_id',
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className={cls('category_id')}>
                  <option value="">Seleccionar categoria...</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              )}
              {field('Stock *', 'stock',
                <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className={cls('stock')} placeholder="Cantidad disponible" min={0} />
              )}
              {field('Estado *', 'status',
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Equipment['status'] })}
                  className={cls('status')}>
                  <option value="">Seleccionar estado...</option>
                  <option value="available">Disponible</option>
                  <option value="maintenance">Mantenimiento</option>
                  <option value="out_of_service">Fuera de servicio</option>
                </select>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Activo</label>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={form.is_active} onChange={() => setForm({ ...form, is_active: true })} />
                    <span className="text-sm text-gray-700">Si</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!form.is_active} onChange={() => setForm({ ...form, is_active: false })} />
                    <span className="text-sm text-gray-700">No</span>
                  </label>
                </div>
              </div>
              <div className="col-span-2">
                {field('Descripcion *', 'description',
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2} className={cls('description', 'resize-none')} placeholder="Descripcion del equipo" />
                )}
              </div>
            </div>

            {/* Imagen con Drag & Drop */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Imagen {!editingId && <span className="text-red-400">*</span>}
                {editingId && <span className="text-gray-400 font-normal ml-1">(dejar vacío para conservar la actual)</span>}
              </label>
              <ImageDropZone
                preview={imagePreview}
                onFile={handleImageFile}
                label={editingId ? 'Arrastra para cambiar la imagen' : 'Arrastra la imagen aquí o haz clic'}
              />
              {imageError && <p className="text-red-500 text-xs mt-1">{imageError}</p>}
              {imageFile && (
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-green-600 font-medium">✓ {imageFile.name}</p>
                  <button
                    onClick={() => { setImageFile(null); setImagePreview(editingId ? imagePreview : null) }}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Equipo'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal gestión de categorías ───────────────────────────────────── */}
      {showCatModal && (
        <Modal title="Gestionar Categorías" onClose={() => { setShowCatModal(false); setCatError(null) }} size="lg">
          <div className="space-y-4">
            {catError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex justify-between">
                {catError}
                <button onClick={() => setCatError(null)} className="ml-2 text-red-400">&times;</button>
              </div>
            )}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">{editingCatId ? 'Editar categoría' : 'Nueva categoría'}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                  <input type="text" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="Ej: Computadores" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                  <input type="text" value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="Descripción opcional" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                {editingCatId && (
                  <button onClick={() => { setEditingCatId(null); setCatForm({ name: '', description: '' }) }}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                    Cancelar edición
                  </button>
                )}
                <button onClick={handleSaveCat} disabled={savingCat}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {savingCat ? 'Guardando...' : editingCatId ? 'Actualizar' : '+ Agregar'}
                </button>
              </div>
            </div>
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              {categories.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">No hay categorías registradas.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Nombre</th>
                      <th className="px-4 py-2 text-left font-medium">Descripción</th>
                      <th className="px-4 py-2 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {categories.map((cat) => (
                      <tr key={cat.id} className={`hover:bg-gray-50 ${editingCatId === cat.id ? 'bg-blue-50' : ''}`}>
                        <td className="px-4 py-2 font-medium text-gray-800">{cat.name}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{cat.description ?? '—'}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => { setEditingCatId(cat.id); setCatForm({ name: cat.name, description: cat.description ?? '' }) }}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-3">Editar</button>
                          <button onClick={() => handleDeleteCat(cat.id)} disabled={deletingCatId === cat.id}
                            className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-50">
                            {deletingCatId === cat.id ? '...' : 'Eliminar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <button onClick={() => { setShowCatModal(false); setCatError(null) }}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Confirmar eliminación ─────────────────────────────────────────── */}
      {deleteId !== null && (
        <Modal title="Confirmar Eliminacion" onClose={() => setDeleteId(null)} size="sm">
          <p className="text-gray-600 text-sm mb-4">
            ¿Estás seguro de eliminar este equipo? Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
              {deleting ? 'Eliminando...' : '¡Sí, eliminarlo!'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default EquipmentPage
