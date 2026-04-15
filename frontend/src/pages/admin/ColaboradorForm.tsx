import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import {
  getUser,
  createUser,
  updateUser,
  extractErrorMessage,
} from '../../api/client';

interface Colaborador {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  birth_date?: string;
  cpf?: string;
  rg?: string;
  gender?: string;
  marital_status?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  position?: string;
  department?: string;
  hire_date?: string;
  salary?: number;
  work_shift?: string;
  notes?: string;
}

type FormData = Omit<Colaborador, 'id' | 'created_at'> & { password?: string };

const emptyForm: FormData = {
  email: '',
  password: '',
  name: '',
  role: 'agent',
  phone: '',
  is_active: true,
  birth_date: '',
  cpf: '',
  rg: '',
  gender: '',
  marital_status: '',
  address_street: '',
  address_city: '',
  address_state: '',
  address_zip: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relation: '',
  position: '',
  department: '',
  hire_date: '',
  salary: undefined,
  work_shift: '',
  notes: '',
};

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const sectionClass = "bg-gray-50 rounded-lg p-4 mb-4";

export default function ColaboradorForm() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormData>(emptyForm);
  const [error, setError] = useState('');

  // Load user data when editing
  const { data: existingUser } = useQuery({
    queryKey: ['user', id],
    queryFn: () => getUser(id!).then(r => r.data as Colaborador),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingUser) {
      setForm({
        email: existingUser.email || '',
        name: existingUser.name || '',
        role: existingUser.role || 'agent',
        phone: existingUser.phone || '',
        is_active: existingUser.is_active ?? true,
        birth_date: existingUser.birth_date || '',
        cpf: existingUser.cpf || '',
        rg: existingUser.rg || '',
        gender: existingUser.gender || '',
        marital_status: existingUser.marital_status || '',
        address_street: existingUser.address_street || '',
        address_city: existingUser.address_city || '',
        address_state: existingUser.address_state || '',
        address_zip: existingUser.address_zip || '',
        emergency_contact_name: existingUser.emergency_contact_name || '',
        emergency_contact_phone: existingUser.emergency_contact_phone || '',
        emergency_contact_relation: existingUser.emergency_contact_relation || '',
        position: existingUser.position || '',
        department: existingUser.department || '',
        hire_date: existingUser.hire_date || '',
        salary: existingUser.salary,
        work_shift: existingUser.work_shift || '',
        notes: existingUser.notes || '',
      });
    }
  }, [existingUser]);

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      navigate('/admin/colaboradores');
    },
    onError: (err: any) => {
      setError(extractErrorMessage(err));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FormData> }) => updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      navigate('/admin/colaboradores');
    },
    onError: (err: any) => {
      setError(extractErrorMessage(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Nome é obrigatório');
      return;
    }
    if (!isEdit && !form.email.trim()) {
      setError('Email é obrigatório');
      return;
    }
    if (!isEdit && !form.password) {
      setError('Palavra-passe é obrigatória');
      return;
    }

    if (isEdit) {
      updateMutation.mutate({
        id: id!,
        data: {
          name: form.name,
          phone: form.phone || undefined,
          is_active: form.is_active,
          birth_date: form.birth_date || undefined,
          cpf: form.cpf || undefined,
          rg: form.rg || undefined,
          gender: form.gender || undefined,
          marital_status: form.marital_status || undefined,
          address_street: form.address_street || undefined,
          address_city: form.address_city || undefined,
          address_state: form.address_state || undefined,
          address_zip: form.address_zip || undefined,
          emergency_contact_name: form.emergency_contact_name || undefined,
          emergency_contact_phone: form.emergency_contact_phone || undefined,
          emergency_contact_relation: form.emergency_contact_relation || undefined,
          position: form.position || undefined,
          department: form.department || undefined,
          hire_date: form.hire_date || undefined,
          salary: form.salary,
          work_shift: form.work_shift || undefined,
          notes: form.notes || undefined,
        },
      });
    } else {
      createMutation.mutate({
        email: form.email,
        password: form.password!,
        name: form.name,
        role: form.role,
        phone: form.phone || undefined,
        is_active: form.is_active,
        birth_date: form.birth_date || undefined,
        cpf: form.cpf || undefined,
        rg: form.rg || undefined,
        gender: form.gender || undefined,
        marital_status: form.marital_status || undefined,
        address_street: form.address_street || undefined,
        address_city: form.address_city || undefined,
        address_state: form.address_state || undefined,
        address_zip: form.address_zip || undefined,
        emergency_contact_name: form.emergency_contact_name || undefined,
        emergency_contact_phone: form.emergency_contact_phone || undefined,
        emergency_contact_relation: form.emergency_contact_relation || undefined,
        position: form.position || undefined,
        department: form.department || undefined,
        hire_date: form.hire_date || undefined,
        salary: form.salary,
        work_shift: form.work_shift || undefined,
        notes: form.notes || undefined,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Layout>
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/admin/colaboradores')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold text-gray-800">
            {isEdit ? `Editar Colaborador: ${existingUser?.name || '...'}` : 'Novo Colaborador'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg">{error}</div>
          )}

          {/* Conta */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Dados da Conta</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  placeholder="João Silva"
                />
              </div>
              <div>
                <label className={labelClass}>Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className={inputClass}
                  placeholder="joao@empresa.com.br"
                  disabled={isEdit}
                />
              </div>
              {!isEdit && (
                <div>
                  <label className={labelClass}>Senha *</label>
                  <input
                    type="password"
                    value={form.password || ''}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                </div>
              )}
              <div>
                <label className={labelClass}>Tipo</label>
                <select
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                  className={inputClass}
                >
                  <option value="admin">Admin</option>
                  <option value="agent">Colaborador</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Telefone</label>
                <input
                  type="text"
                  value={form.phone || ''}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className={inputClass}
                  placeholder="+55 11 91234 5678"
                />
              </div>
              <div>
                <label className={labelClass}>Ativo</label>
                <select
                  value={form.is_active ? 'true' : 'false'}
                  onChange={e => setForm({ ...form, is_active: e.target.value === 'true' })}
                  className={inputClass}
                >
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </div>
            </div>
          </div>

          {/* Dados Pessoais */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Dados Pessoais</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Data de Nascimento</label>
                <input
                  type="date"
                  value={form.birth_date || ''}
                  onChange={e => setForm({ ...form, birth_date: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>CPF</label>
                <input
                  type="text"
                  value={form.cpf || ''}
                  onChange={e => setForm({ ...form, cpf: e.target.value })}
                  className={inputClass}
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <label className={labelClass}>RG</label>
                <input
                  type="text"
                  value={form.rg || ''}
                  onChange={e => setForm({ ...form, rg: e.target.value })}
                  className={inputClass}
                  placeholder="00.000.000-0"
                />
              </div>
              <div>
                <label className={labelClass}>Género</label>
                <select
                  value={form.gender || ''}
                  onChange={e => setForm({ ...form, gender: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Não especificado</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                  <option value="O">Outro</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Estado Civil</label>
                <select
                  value={form.marital_status || ''}
                  onChange={e => setForm({ ...form, marital_status: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Não especificado</option>
                  <option value="single">Solteiro</option>
                  <option value="married">Casado</option>
                  <option value="divorced">Divorciado</option>
                  <option value="widowed">Viúvo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Endereço</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Endereço</label>
                <input
                  type="text"
                  value={form.address_street || ''}
                  onChange={e => setForm({ ...form, address_street: e.target.value })}
                  className={inputClass}
                  placeholder="Rua Principal, 123"
                />
              </div>
              <div>
                <label className={labelClass}>Cidade</label>
                <input
                  type="text"
                  value={form.address_city || ''}
                  onChange={e => setForm({ ...form, address_city: e.target.value })}
                  className={inputClass}
                  placeholder="São Paulo"
                />
              </div>
              <div>
                <label className={labelClass}>Estado</label>
                <input
                  type="text"
                  value={form.address_state || ''}
                  onChange={e => setForm({ ...form, address_state: e.target.value })}
                  className={inputClass}
                  placeholder="SP"
                />
              </div>
              <div>
                <label className={labelClass}>CEP</label>
                <input
                  type="text"
                  value={form.address_zip || ''}
                  onChange={e => setForm({ ...form, address_zip: e.target.value })}
                  className={inputClass}
                  placeholder="00000-000"
                />
              </div>
            </div>
          </div>

          {/* Contacto de Emergência */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Contato de Emergência</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Nome</label>
                <input
                  type="text"
                  value={form.emergency_contact_name || ''}
                  onChange={e => setForm({ ...form, emergency_contact_name: e.target.value })}
                  className={inputClass}
                  placeholder="Maria Silva"
                />
              </div>
              <div>
                <label className={labelClass}>Telefone</label>
                <input
                  type="text"
                  value={form.emergency_contact_phone || ''}
                  onChange={e => setForm({ ...form, emergency_contact_phone: e.target.value })}
                  className={inputClass}
                  placeholder="+55 11 91234 5678"
                />
              </div>
              <div>
                <label className={labelClass}>Parentesco</label>
                <input
                  type="text"
                  value={form.emergency_contact_relation || ''}
                  onChange={e => setForm({ ...form, emergency_contact_relation: e.target.value })}
                  className={inputClass}
                  placeholder="Cônjuge"
                />
              </div>
            </div>
          </div>

          {/* Dados Profissionais */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Dados Profissionais</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Cargo</label>
                <input
                  type="text"
                  value={form.position || ''}
                  onChange={e => setForm({ ...form, position: e.target.value })}
                  className={inputClass}
                  placeholder="Técnico de Suporte"
                />
              </div>
              <div>
                <label className={labelClass}>Departamento</label>
                <select
                  value={form.department || ''}
                  onChange={e => setForm({ ...form, department: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Não especificado</option>
                  <option value="Suporte">Suporte</option>
                  <option value="Comercial">Comercial</option>
                  <option value="Financeiro">Financeiro</option>
                  <option value="RH">RH</option>
                  <option value="TI">TI</option>
                  <option value="Administrativo">Administrativo</option>
                  <option value="Direção">Direção</option>
                  <option value="Marketing">Marketing</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Data de Admissão</label>
                <input
                  type="date"
                  value={form.hire_date || ''}
                  onChange={e => setForm({ ...form, hire_date: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Salário (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.salary ?? ''}
                  onChange={e => setForm({ ...form, salary: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className={inputClass}
                  placeholder="1500.00"
                />
              </div>
              <div>
                <label className={labelClass}>Horário</label>
                <select
                  value={form.work_shift || ''}
                  onChange={e => setForm({ ...form, work_shift: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Não especificado</option>
                  <option value="full-time">Tempo Inteiro</option>
                  <option value="part-time">Tempo Parcial</option>
                  <option value="shift">Por Turnos</option>
                  <option value="remote">Remoto</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Notas</h3>
            <textarea
              value={form.notes || ''}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className={inputClass}
              rows={3}
              placeholder="Observações adicionais..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 pb-8">
            <button
              type="button"
              onClick={() => navigate('/admin/colaboradores')}
              className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
            >
              {isPending ? 'A guardar...' : isEdit ? 'Guardar Alterações' : 'Criar Colaborador'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
