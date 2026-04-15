import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { getCustomer, createCustomer, updateCustomer, extractErrorMessage } from '../../api/client';

interface Customer {
  id: string;
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_district?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  notes?: string;
}

type FormData = Omit<Customer, 'id' | 'created_at'> & { password?: string };

const emptyForm: FormData = {
  name: '',
  document: '',
  email: '',
  phone: '',
  is_active: true,
  address_street: '',
  address_number: '',
  address_complement: '',
  address_district: '',
  address_city: '',
  address_state: '',
  address_zip: '',
  notes: '',
};

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const sectionClass = "bg-gray-50 rounded-lg p-4 mb-4";

export default function CustomerForm() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormData>(emptyForm);
  const [error, setError] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  // Load customer data when editing
  const { data: existingCustomer } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => getCustomer(id!).then(r => r.data as Customer),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingCustomer) {
      setForm({
        name: existingCustomer.name || '',
        document: existingCustomer.document || '',
        email: existingCustomer.email || '',
        phone: existingCustomer.phone || '',
        is_active: existingCustomer.is_active ?? true,
        address_street: existingCustomer.address_street || '',
        address_number: existingCustomer.address_number || '',
        address_complement: existingCustomer.address_complement || '',
        address_district: existingCustomer.address_district || '',
        address_city: existingCustomer.address_city || '',
        address_state: existingCustomer.address_state || '',
        address_zip: existingCustomer.address_zip || '',
        notes: existingCustomer.notes || '',
      });
    }
  }, [existingCustomer]);

  // ViaCEP integration
  const fetchCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          address_street: data.logradouro || prev.address_street,
          address_district: data.bairro || prev.address_district,
          address_city: data.localidade || prev.address_city,
          address_state: data.uf || prev.address_state,
          address_zip: cleanCep,
        }));
      }
    } catch (e) {
      // ignore
    } finally {
      setCepLoading(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate('/admin/clientes');
    },
    onError: (err: any) => {
      setError(extractErrorMessage(err));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FormData> }) => updateCustomer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate('/admin/clientes');
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

    if (isEdit) {
      updateMutation.mutate({
        id: id!,
        data: {
          name: form.name,
          document: form.document || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          is_active: form.is_active,
          address_street: form.address_street || undefined,
          address_number: form.address_number || undefined,
          address_complement: form.address_complement || undefined,
          address_district: form.address_district || undefined,
          address_city: form.address_city || undefined,
          address_state: form.address_state || undefined,
          address_zip: form.address_zip || undefined,
          notes: form.notes || undefined,
        },
      });
    } else {
      createMutation.mutate({
        name: form.name,
        document: form.document || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address_street: form.address_street || undefined,
        address_number: form.address_number || undefined,
        address_complement: form.address_complement || undefined,
        address_district: form.address_district || undefined,
        address_city: form.address_city || undefined,
        address_state: form.address_state || undefined,
        address_zip: form.address_zip || undefined,
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
            onClick={() => navigate('/admin/clientes')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold text-gray-800">
            {isEdit ? `Editar Cliente: ${existingCustomer?.name || '...'}` : 'Novo Cliente'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg">{error}</div>
          )}

          {/* Dados da Conta */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Dados da Conta</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nome da Empresa *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  placeholder="Empresa XPTO Ltda"
                />
              </div>
              <div>
                <label className={labelClass}>CNPJ / CPF</label>
                <input
                  type="text"
                  value={form.document || ''}
                  onChange={e => setForm({ ...form, document: e.target.value })}
                  className={inputClass}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className={inputClass}
                  placeholder="contato@empresa.com.br"
                />
              </div>
              <div>
                <label className={labelClass}>Telefone</label>
                <input
                  type="text"
                  value={form.phone || ''}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className={inputClass}
                  placeholder="+55 11 99999 9999"
                />
              </div>
              {isEdit && (
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    value={form.is_active ? 'true' : 'false'}
                    onChange={e => setForm({ ...form, is_active: e.target.value === 'true' })}
                    className={inputClass}
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Endereço */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Endereço</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>CEP</label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.address_zip || ''}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                      setForm({ ...form, address_zip: v });
                      if (v.length === 8) fetchCep(v);
                    }}
                    onBlur={e => {
                      const v = e.target.value.replace(/\D/g, '');
                      if (v.length === 8) fetchCep(v);
                    }}
                    className={inputClass}
                    placeholder="00000-000"
                  />
                  {cepLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">Digite o CEP e pressione Tab para buscar automaticamente</p>
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Endereço</label>
                <input
                  type="text"
                  value={form.address_street || ''}
                  onChange={e => setForm({ ...form, address_street: e.target.value })}
                  className={inputClass}
                  placeholder="Rua Example"
                />
              </div>
              <div>
                <label className={labelClass}>Número</label>
                <input
                  type="text"
                  value={form.address_number || ''}
                  onChange={e => setForm({ ...form, address_number: e.target.value })}
                  className={inputClass}
                  placeholder="123"
                />
              </div>
              <div>
                <label className={labelClass}>Complemento</label>
                <input
                  type="text"
                  value={form.address_complement || ''}
                  onChange={e => setForm({ ...form, address_complement: e.target.value })}
                  className={inputClass}
                  placeholder="Sala 456"
                />
              </div>
              <div>
                <label className={labelClass}>Bairro</label>
                <input
                  type="text"
                  value={form.address_district || ''}
                  onChange={e => setForm({ ...form, address_district: e.target.value })}
                  className={inputClass}
                  placeholder="Centro"
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
                  maxLength={2}
                />
              </div>
            </div>
          </div>

          {/* Observação */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Observação</h3>
            <textarea
              value={form.notes || ''}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className={inputClass}
              rows={4}
              placeholder="Observações adicionais sobre o cliente..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 pb-8">
            <button
              type="button"
              onClick={() => navigate('/admin/clientes')}
              className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
            >
              {isPending ? 'A guardar...' : isEdit ? 'Guardar Alterações' : 'Criar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
