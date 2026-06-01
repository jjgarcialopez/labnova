import React, { useEffect, useState } from 'react'
import { useAuth } from '../hooks'
import apiClient from '../services/api'

interface GenderOption {
  id: number
  name: string
  code: string
}

interface ProfileData {
  id: number
  name: string
  last_name: string
  email: string
  phone: string
  role?: { name: string; description: string }
  userDetail?: {
    gender_id?: number
    gender?: GenderOption
    birthdate?: string
    address?: string
    addon_address?: string
    notes?: string
  }
}

interface ProfileForm {
  name: string
  last_name: string
  phone: string
  gender_id: string
  birthdate: string
  address: string
  addon_address: string
}

interface PasswordForm {
  current_password: string
  password: string
  password_confirmation: string
}

const EMPTY_PASSWORD: PasswordForm = {
  current_password: '',
  password: '',
  password_confirmation: '',
}

const ProfilePage: React.FC = () => {
  useAuth()

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [genders, setGenders] = useState<GenderOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)

  const [form, setForm] = useState<ProfileForm>({
    name: '', last_name: '', phone: '',
    gender_id: '', birthdate: '', address: '', addon_address: '',
  })
  const [pwdForm, setPwdForm] = useState<PasswordForm>(EMPTY_PASSWORD)

  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null)
  const [pwdError, setPwdError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'info' | 'password'>('info')
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3500)
  }
  const showPwdSuccess = (msg: string) => {
    setPwdSuccess(msg)
    setTimeout(() => setPwdSuccess(null), 3500)
  }

  useEffect(() => {
    const load = async () => {
      try {
        const [profileRes, gendersRes] = await Promise.all([
          apiClient.get('/profile'),
          apiClient.get('/genders'),
        ])
        const data: ProfileData = profileRes.data.data
        setProfile(data)
        setGenders(gendersRes.data ?? [])
        setForm({
          name:          data.name ?? '',
          last_name:     data.last_name ?? '',
          phone:         data.phone ?? '',
          gender_id:     data.userDetail?.gender_id ? String(data.userDetail.gender_id) : '',
          birthdate:     data.userDetail?.birthdate ?? '',
          address:       data.userDetail?.address ?? '',
          addon_address: data.userDetail?.addon_address ?? '',
        })
      } catch {
        setErrorMsg('No se pudo cargar el perfil.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      setErrorMsg(null)
      const payload = {
        ...form,
        gender_id: form.gender_id ? Number(form.gender_id) : null,
      }
      const res = await apiClient.put('/profile', payload)
      setProfile(res.data.data)
      // Actualizar localStorage para que el header refleje el nuevo nombre
      const stored = localStorage.getItem('user')
      if (stored) {
        const parsed = JSON.parse(stored)
        parsed.name = form.name
        parsed.last_name = form.last_name
        localStorage.setItem('user', JSON.stringify(parsed))
      }
      showSuccess('Perfil actualizado correctamente.')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setErrorMsg(msg || 'No se pudo actualizar el perfil.')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwdForm.password !== pwdForm.password_confirmation) {
      setPwdError('Las contraseñas no coinciden.')
      return
    }
    try {
      setSavingPwd(true)
      setPwdError(null)
      await apiClient.post('/profile/password', pwdForm)
      setPwdForm(EMPTY_PASSWORD)
      showPwdSuccess('Contraseña cambiada correctamente.')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setPwdError(msg || 'No se pudo cambiar la contraseña.')
    } finally {
      setSavingPwd(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Encabezado de perfil */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600 shrink-0">
          {profile?.name?.charAt(0).toUpperCase()}{profile?.last_name?.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            {profile?.name} {profile?.last_name}
          </h1>
          <p className="text-sm text-gray-500">{profile?.email}</p>
          {profile?.role && (
            <span className="inline-block mt-1 px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
              {profile.role.name}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('info')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'info' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Información personal
        </button>
        <button
          onClick={() => setActiveTab('password')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'password' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Cambiar contraseña
        </button>
      </div>

      {/* Tab: Información personal */}
      {activeTab === 'info' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          {successMsg && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between">
              {errorMsg}
              <button onClick={() => setErrorMsg(null)} className="ml-3 text-red-400 hover:text-red-600">&times;</button>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Nombre</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Apellido</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Correo electrónico</label>
              <input
                type="email"
                value={profile?.email ?? ''}
                disabled
                className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">El correo no puede modificarse.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Teléfono</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Ej: 300 000 0000"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Género</label>
                <select
                  value={form.gender_id}
                  onChange={(e) => setForm({ ...form, gender_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <option value="">Sin especificar</option>
                  {genders.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Fecha de nacimiento</label>
                <input
                  type="date"
                  value={form.birthdate}
                  onChange={(e) => setForm({ ...form, birthdate: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Dirección</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Dirección principal"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Dirección adicional</label>
              <input
                type="text"
                value={form.addon_address}
                onChange={(e) => setForm({ ...form, addon_address: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Apto, oficina, etc."
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab: Cambiar contraseña */}
      {activeTab === 'password' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          {pwdSuccess && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {pwdSuccess}
            </div>
          )}
          {pwdError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between">
              {pwdError}
              <button onClick={() => setPwdError(null)} className="ml-3 text-red-400 hover:text-red-600">&times;</button>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Contraseña actual</label>
              <div className="relative">
                <input
                  type={showCurrentPwd ? 'text' : 'password'}
                  value={pwdForm.current_password}
                  onChange={(e) => setPwdForm({ ...pwdForm, current_password: e.target.value })}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPwd((v) => !v)}
                  className="absolute inset-y-0 right-2 text-xs font-medium text-blue-600 hover:text-blue-800"
                  aria-label={showCurrentPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showCurrentPwd ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Nueva contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={pwdForm.password}
                  onChange={(e) => setPwdForm({ ...pwdForm, password: e.target.value })}
                  required
                  minLength={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-2 text-xs font-medium text-blue-600 hover:text-blue-800"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Confirmar nueva contraseña</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={pwdForm.password_confirmation}
                  onChange={(e) => setPwdForm({ ...pwdForm, password_confirmation: e.target.value })}
                  required
                  minLength={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="Repite la nueva contraseña"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute inset-y-0 right-2 text-xs font-medium text-blue-600 hover:text-blue-800"
                  aria-label={showConfirmPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                >
                  {showConfirmPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingPwd}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {savingPwd ? 'Cambiando...' : 'Cambiar contraseña'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default ProfilePage
