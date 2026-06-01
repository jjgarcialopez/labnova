import React, { useEffect, useState, useCallback } from 'react'
import Swal from 'sweetalert2'
import { userService } from '../services/userService'
import { User } from '../types'
import { Modal } from '../components/common/Modal'
import { usePermissions } from '../hooks/usePermissions'
import { useAuth } from '../hooks'
import { ProtectedButton, IfCan } from '../components/ProtectedFeature'

interface Role {
  id: number
  name: string
  description: string
}

interface Gender {
  id: number
  name: string
  code: string
}

interface UserForm {
  name: string
  last_name: string
  email: string
  password: string
  confirm_password: string
  phone: string
  role_id: string
  status: string
  gender_id: string
}

const EMPTY_FORM: UserForm = {
  name: '',
  last_name: '',
  email: '',
  password: '',
  confirm_password: '',
  phone: '',
  role_id: '',
  status: '1',
  gender_id: '',
}

const UsersPage: React.FC = () => {
  const { canView } = usePermissions()
  const { user: currentUser } = useAuth()
  const isCurrentUserSuperAdmin = currentUser?.role?.name === 'Super Admin'

  // Si no tiene permiso para ver usuarios, mostrar mensaje de acceso denegado
  if (!canView('users')) {
    return (
      <div className="space-y-5">
        <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Acceso Denegado</h2>
          <p className="text-red-700">
            No tienes permisos para acceder a la gestión de usuarios. Esto está reservado para administradores.
          </p>
        </div>
      </div>
    )
  }

  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [genders, setGenders] = useState<Gender[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [filtered, setFiltered] = useState<User[]>([])

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Partial<UserForm>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [deleting, setDeleting] = useState(false)

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await userService.getAllUsers()
      setUsers(res.data)
      setFiltered(res.data)
      setTotal(res.total)
    } catch {
      setError('No se pudo cargar la lista de usuarios.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRoles = useCallback(async () => {
    try {
      const data = await userService.getGeneralData()
      setRoles(
        isCurrentUserSuperAdmin
          ? data.roles
          : data.roles.filter((role: Role) => role.name !== 'Super Admin')
      )
      setGenders(data.genders ?? [])
    } catch {
      // roles/genders are optional — form can still work
    }
  }, [isCurrentUserSuperAdmin])

  useEffect(() => {
    loadUsers()
    loadRoles()
  }, [loadUsers, loadRoles])

  // Client-side search
  useEffect(() => {
    const q = searchInput.trim().toLowerCase()
    if (!q) {
      setFiltered(users)
    } else {
      setFiltered(
        users.filter(
          (u) =>
            u.name.toLowerCase().includes(q) ||
            u.last_name?.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q),
        ),
      )
    }
  }, [searchInput, users])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
    setShowPassword(false)
    setShowConfirmPassword(false)
    setShowModal(true)
  }

  const openEdit = (user: User) => {
    const detail = user.userDetail ?? (user as User & { user_detail?: User['userDetail'] }).user_detail
    setEditingId(user.id)
    setForm({
      name: user.name,
      last_name: user.last_name ?? '',
      email: user.email,
      password: '',
      confirm_password: '',
      phone: user.phone ?? '',
      role_id: user.role_id ? String(user.role_id) : (user.role?.id ? String(user.role.id) : ''),
      status: user.status === false ? '0' : '1',
      gender_id: detail?.gender_id ? String(detail.gender_id) : '',
    })
    setFormErrors({})
    setShowPassword(false)
    setShowConfirmPassword(false)
    setShowModal(true)
  }

  const ONLY_LETTERS = /^[a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑ\s]+$/

  const validate = (): boolean => {
    const errors: Partial<UserForm> = {}
    if (!form.name.trim()) {
      errors.name = 'El nombre es requerido'
    } else if (!ONLY_LETTERS.test(form.name.trim())) {
      errors.name = 'El nombre solo puede contener letras y espacios'
    }
    if (!form.last_name.trim()) {
      errors.last_name = 'El apellido es requerido'
    } else if (!ONLY_LETTERS.test(form.last_name.trim())) {
      errors.last_name = 'El apellido solo puede contener letras y espacios'
    }
    if (!form.email.trim()) errors.email = 'El email es requerido'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Email invalido'
    if (!editingId && !form.password.trim()) errors.password = 'La contrasena es requerida'
    else if (form.password && form.password.length < 6) errors.password = 'Minimo 6 caracteres'
    if ((!editingId || form.password) && !form.confirm_password.trim()) {
      errors.confirm_password = 'Confirma la contrasena'
    } else if (form.password && form.confirm_password && form.password !== form.confirm_password) {
      errors.confirm_password = 'Las contrasenas no coinciden'
    }
    if (!form.role_id) errors.role_id = 'El rol es requerido'
    if (!editingId && !form.gender_id) errors.gender_id = 'El género es requerido'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    try {
      setSaving(true)
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        role_id: Number(form.role_id),
        status: form.status === '1',
      }
      if (!editingId || form.gender_id) {
        payload.gender_id = form.gender_id ? Number(form.gender_id) : null
      }
      if (form.password) payload.password = form.password

      if (editingId) {
        await userService.updateUser(editingId, payload)
        showSuccess('Usuario actualizado correctamente.')
      } else {
        await userService.createUser(payload)
        showSuccess('Usuario registrado correctamente.')
      }
      setShowModal(false)
      loadUsers()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { errors?: Record<string, string[]> } } }
      const status = axiosErr?.response?.status
      const apiErrors = axiosErr?.response?.data?.errors

      if (status === 422 && apiErrors) {
        const inlineErrors: Partial<UserForm> = {}
        const generalErrors: string[] = []

        if (apiErrors.name?.length) inlineErrors.name = apiErrors.name[0]
        if (apiErrors.last_name?.length) inlineErrors.last_name = apiErrors.last_name[0]
        if (apiErrors.email?.length) inlineErrors.email = apiErrors.email[0]
        if (apiErrors.phone?.length) inlineErrors.phone = apiErrors.phone[0]
        if (apiErrors.role_id?.length) inlineErrors.role_id = apiErrors.role_id[0]
        if (apiErrors.password?.length) inlineErrors.password = apiErrors.password[0]

        if (apiErrors.status?.length) {
          generalErrors.push('Todos los campos obligatorios deben completarse.')
        }

        if (Object.keys(inlineErrors).length) setFormErrors((prev) => ({ ...prev, ...inlineErrors }))
        if (generalErrors.length) setError(generalErrors[0])
        else if (!Object.keys(inlineErrors).length) setError('No se pudo guardar el usuario. Verifica los datos.')
      } else {
        setError('No se pudo guardar el usuario. Verifica los datos.')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: '¡No podrás revertir esto!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '¡Sí, eliminarlo!',
      cancelButtonText: 'Cancelar',
    })
    if (!result.isConfirmed) return
    try {
      setDeleting(true)
      await userService.deleteUser(id)
      showSuccess('Usuario eliminado correctamente.')
      loadUsers()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      const msg = axiosErr?.response?.data?.message
      setError(msg || 'No se pudo eliminar el usuario.')
    } finally {
      setDeleting(false)
    }
  }

  const fullName = (u: User) => [u.name, u.last_name].filter(Boolean).join(' ')

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Usuarios</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} usuarios registrados</p>
        </div>
        <IfCan permission={{ module: 'users', action: 'create' }}>
          <button
            onClick={openCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + Nuevo Usuario
          </button>
        </IfCan>
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

      {/* Busqueda */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por nombre o email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="text-gray-400 hover:text-gray-600 text-sm px-2"
          >
            &times; Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-lg mb-1">No hay usuarios</p>
            <p className="text-sm">
              {searchInput
                ? `Sin resultados para "${searchInput}"`
                : 'Crea el primer usuario con el boton de arriba.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-6 py-3 font-medium">#</th>
                  <th className="px-6 py-3 font-medium">Nombre</th>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Telefono</th>
                  <th className="px-6 py-3 font-medium">Rol</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                  <th className="px-6 py-3 font-medium">Registrado</th>
                  <th className="px-6 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-400 font-mono text-xs">{user.id}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-800">{fullName(user)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{user.email}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{user.phone || '—'}</td>
                    <td className="px-6 py-3">
                      {user.role ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                          {user.role.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Sin rol</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          user.status !== false
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {user.status !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">
                      {new Date(user.created_at).toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <ProtectedButton
                        permission={{ module: 'users', action: 'edit' }}
                        onClick={() => openEdit(user)}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-3"
                      >
                        Editar
                      </ProtectedButton>
                      <ProtectedButton
                        permission={{ module: 'users', action: 'delete' }}
                        onClick={() => handleDelete(user.id)}
                        disabled={deleting}
                        className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40"
                      >
                        Eliminar
                      </ProtectedButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <Modal 
          title={editingId ? 'Editar Usuario' : 'Nuevo Usuario'} 
          onClose={() => setShowModal(false)} 
          size="lg"
          allowBackdropClick={false}
        >
          <div className="space-y-5">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-sm font-semibold text-blue-900">
                {editingId ? 'Actualizar información del usuario' : 'Registrar nuevo usuario'}
              </p>
              <p className="text-xs text-blue-700 mt-1">
                {editingId
                  ? 'Modifica solo los campos necesarios. La contraseña se conserva si la dejas vacía.'
                  : 'Completa los datos básicos y define el acceso inicial del usuario.'}
              </p>
            </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Datos personales</h3>
            </div>
            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${formErrors.name ? 'border-red-400' : 'border-gray-200'}`}
                placeholder="Nombres"
              />
              {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
            </div>

            {/* Apellido */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${formErrors.last_name ? 'border-red-400' : 'border-gray-200'}`}
                placeholder="Apellidos"
              />
              {formErrors.last_name && <p className="text-red-500 text-xs mt-1">{formErrors.last_name}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${formErrors.email ? 'border-red-400' : 'border-gray-200'}`}
                placeholder="correo@ejemplo.com"
              />
              {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
            </div>

            {/* Telefono */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${formErrors.phone ? 'border-red-400' : 'border-gray-200'}`}
                placeholder="Ej: 3001234567"
              />
              {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
            </div>

            <div className="col-span-2 pt-2 border-t border-gray-100">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Seguridad y acceso</h3>
            </div>

            {/* Contrasena */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contrasena {editingId ? '(dejar vacio para no cambiar)' : '*'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${formErrors.password ? 'border-red-400' : 'border-gray-200'}`}
                  placeholder="Minimo 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-2 text-xs font-medium text-blue-600 hover:text-blue-800"
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
            </div>

            {/* Confirmar Contrasena */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirmar contrasena {editingId ? '(si cambia)' : '*'}
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={form.confirm_password}
                  onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${formErrors.confirm_password ? 'border-red-400' : 'border-gray-200'}`}
                  placeholder="Repite la contrasena"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute inset-y-0 right-2 text-xs font-medium text-blue-600 hover:text-blue-800"
                  aria-label={showConfirmPassword ? 'Ocultar confirmacion' : 'Mostrar confirmacion'}
                >
                  {showConfirmPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              {formErrors.confirm_password && <p className="text-red-500 text-xs mt-1">{formErrors.confirm_password}</p>}
            </div>

            {/* Rol */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
              <select
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${formErrors.role_id ? 'border-red-400' : 'border-gray-200'}`}
              >
                <option value="">Seleccionar rol...</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {formErrors.role_id && <p className="text-red-500 text-xs mt-1">{formErrors.role_id}</p>}
            </div>

            {/* Género */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Género *</label>
              <select
                value={form.gender_id}
                onChange={(e) => setForm({ ...form, gender_id: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${formErrors.gender_id ? 'border-red-400' : 'border-gray-200'}`}
              >
                <option value="">Seleccionar género...</option>
                {genders.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {formErrors.gender_id && <p className="text-red-500 text-xs mt-1">{formErrors.gender_id}</p>}
            </div>

            {/* Estado */}
            <div className="col-span-2 pt-2 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="1"
                    checked={form.status === '1'}
                    onChange={() => setForm({ ...form, status: '1' })}
                    className="text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Activo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="0"
                    checked={form.status === '0'}
                    onChange={() => setForm({ ...form, status: '0' })}
                    className="text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Inactivo</span>
                </label>
              </div>
            </div>
          </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-gray-100">
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Usuario'}
            </button>
          </div>
        </Modal>
      )}

    </div>
  )
}

export default UsersPage

