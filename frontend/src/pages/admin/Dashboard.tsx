import Layout from '../../components/Layout';
import { useQuery } from '@tanstack/react-query';
import { getTickets, getSLADashboard, getCustomers, getAtRiskTickets } from '../../api/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';

const COLORS = {
  green: '#22c55e', yellow: '#eab308', red: '#ef4444',
  blue: '#3b82f6', purple: '#8b5cf6', gray: '#6b7280', indigo: '#6366f1',
};

function StatCard({ label, value, bg, color }: { label: string; value: number; bg: string; color: string }) {
  return (
    <div className={`${bg} rounded-xl p-5`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className={`text-3xl font-bold ${color} mt-1`}>{value}</p>
    </div>
  );
}

function SLAGauge({ within = 0, at_risk = 0, breached = 0 }: { within?: number; at_risk?: number; breached?: number }) {
  const total = within + at_risk + breached;
  const pct = total > 0 ? Math.round((within / total) * 100) : 0;
  const r = 60;
  const circ = 2 * Math.PI * r;
  const dash = circ - (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={r} stroke="#e5e7eb" strokeWidth="14" fill="none" />
          <circle
            cx="80" cy="80" r={r}
            stroke={pct >= 80 ? COLORS.green : pct >= 50 ? COLORS.yellow : COLORS.red}
            strokeWidth="14" fill="none"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-gray-800">{pct}%</span>
          <span className="text-xs text-gray-500">Conformidade</span>
        </div>
      </div>
      <div className="flex gap-4 mt-3 text-sm">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>No Prazo {within}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block"></span>Em Risco {at_risk}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>Vencido {breached}</span>
      </div>
    </div>
  );
}

function PriorityBar({ priority, count, max }: { priority: string; count: number; max: number }) {
  const colors: Record<string, string> = { low: '#6b7280', normal: '#3b82f6', high: '#f97316', urgent: '#ef4444' };
  const labels: Record<string, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-xs text-gray-600">{labels[priority] || priority}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: colors[priority] || COLORS.gray }} />
      </div>
      <span className="w-8 text-xs text-gray-500 text-right">{count}</span>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => getTickets().then(r => r.data),
  });
  const { data: slaData } = useQuery({ queryKey: ['sla-dashboard'], queryFn: () => getSLADashboard().then(r => r.data) });
  const { data: customersData } = useQuery({ queryKey: ['customers'], queryFn: () => getCustomers().then(r => r.data) });
  const { data: atRiskData } = useQuery({ queryKey: ['at-risk'], queryFn: () => getAtRiskTickets().then(r => r.data) });

  const tickets = ticketsData || [];
  const atRisk = atRiskData || [];

  // KPI stats
  const openTickets = tickets.filter((t: any) => ['open', 'in_progress', 'pending', 'awaiting_customer'].includes(t.status));
  const solvedTickets = tickets.filter((t: any) => ['solved', 'closed'].includes(t.status));
  const awaitingTickets = tickets.filter((t: any) => t.status === 'awaiting_customer');
  const overdueTickets = tickets.filter((t: any) => t.sla_status === 'breached');

  // Tickets by status (pie)
  const statusCounts = tickets.reduce((acc: Record<string, number>, t: any) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});
  const STATUS_LABELS: Record<string, string> = {
    open: 'Abertos', in_progress: 'Em Progresso', pending: 'Pendente',
    awaiting_customer: 'Aguard. Cliente', solved: 'Resolvidos', closed: 'Fechados',
    cancelled: 'Cancelados',
  };
  const statusChart = Object.entries(statusCounts).map(([status, count]) => ({
    name: STATUS_LABELS[status] || status.replace(/_/g, ' '), value: count as number,
  }));
  const STATUS_COLORS = ['#3b82f6', '#f97316', '#8b5cf6', '#22c55e', '#ef4444', '#6b7280', '#ec4899'];

  // Tickets by priority (bar)
  const priorityCounts = tickets.reduce((acc: Record<string, number>, t: any) => {
    acc[t.priority] = (acc[t.priority] || 0) + 1;
    return acc;
  }, {});
  const priorityMax = Math.max(...Object.values(priorityCounts).map(Number), 1);
  const priorityChart = Object.entries(priorityCounts).map(([priority, count]) => ({
    priority,
    label: { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }[priority] || priority,
    count,
  }));

  // Tickets by day (line chart — last 7 days)
  const last7days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });
  const ticketsByDay = last7days.map(date => ({
    date: new Date(date).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }),
    tickets: tickets.filter((t: any) => t.created_at?.startsWith(date)).length,
  }));

  // SLA summary
  const slaWithin = slaData?.within_sla || 0;
  const slaAtRisk = slaData?.at_risk || 0;
  const slaBreached = slaData?.breached || 0;
  const slaTotal = slaData?.total || tickets.length;

  if (ticketsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
            <p className="text-sm text-gray-500 mt-1">Visão geral do sistema de atendimento</p>
          </div>
          <div className="text-sm text-gray-500">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatCard label="Total Tickets" value={tickets.length} bg="bg-gray-100" color="text-gray-700" />
          <StatCard label="Abertos" value={openTickets.length} bg="bg-blue-50" color="text-blue-700" />
          <StatCard label="Aguardando Cliente" value={awaitingTickets.length} bg="bg-orange-50" color="text-orange-700" />
          <StatCard label="Resolvidos" value={solvedTickets.length} bg="bg-green-50" color="text-green-700" />
          <StatCard label="SLA Vencido" value={overdueTickets.length} bg="bg-red-50" color="text-red-700" />
          <StatCard label="Clientes" value={customersData?.length || 0} bg="bg-indigo-50" color="text-indigo-700" />
        </div>

        {/* ── SLA Compliance Section ── */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h3 className="text-base font-semibold text-gray-800 mb-5">Compliance SLA — Nível de Serviço</h3>
          <div className="flex flex-wrap gap-8 items-center">
            <SLAGauge within={slaWithin} at_risk={slaAtRisk} breached={slaBreached} />
            <div className="flex-1 min-w-[280px]">
              <div className="space-y-3">
                <PriorityBar priority="urgent" count={priorityCounts['urgent'] || 0} max={priorityMax} />
                <PriorityBar priority="high" count={priorityCounts['high'] || 0} max={priorityMax} />
                <PriorityBar priority="normal" count={priorityCounts['normal'] || 0} max={priorityMax} />
                <PriorityBar priority="low" count={priorityCounts['low'] || 0} max={priorityMax} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Tickets por Status — Donut */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Tickets por Status</h3>
            {statusChart.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={statusChart} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      paddingAngle={3} dataKey="value">
                      {statusChart.map((_, i) => (
                        <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {statusChart.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                      <span className="text-gray-600 capitalize flex-1">{s.name}</span>
                      <span className="font-semibold text-gray-800">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>
            )}
          </div>

          {/* Tickets por dia — Bar */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Tickets criados (últimos 7 dias)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ticketsByDay} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="tickets" fill={COLORS.indigo} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Tickets At-Risk + Tickets por Prioridade (line) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* At-Risk Tickets */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Tickets em Risco SLA
              {atRisk.length > 0 && (
                <span className="ml-2 bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">{atRisk.length}</span>
              )}
            </h3>
            {atRisk.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-4xl mb-2 block">✅</span>
                <p className="text-sm text-gray-500">Nenhum ticket em risco de SLA</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {atRisk.map((t: any) => (
                  <a key={t.id} href={`/admin/tickets/${t.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      t.priority === 'urgent' ? 'bg-red-500' : t.priority === 'high' ? 'bg-orange-500' : 'bg-yellow-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                      <p className="text-xs text-gray-400 capitalize">{t.priority} · {STATUS_LABELS[t.status] || t.status?.replace(/_/g, ' ')}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Resolution time trend */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Tickets por Prioridade</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={priorityChart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="count" stroke={COLORS.indigo} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Layout>
  );
}
