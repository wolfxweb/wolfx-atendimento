import Layout from '../../components/Layout';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';

const COLORS = {
  green: '#22c55e', yellow: '#eab308', red: '#ef4444',
  blue: '#3b82f6', purple: '#8b5cf6', gray: '#6b7280', indigo: '#6366f1',
  cyan: '#06b6d4', orange: '#f97316',
};

const CHART_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899', '#eab308', '#6b7280'];

function StatCard({ label, value, bg, color, sub }: { label: string; value: string | number; bg: string; color: string; sub?: string }) {
  return (
    <div className={`${bg} rounded-xl p-5`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className={`text-3xl font-bold ${color} mt-1`}>{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  );
}

interface AIMetrics {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  ai_handled: number;
  human_handled: number;
  avg_response_time_ms: number;
  avg_confidence: number;
  requests_by_intent: Record<string, number>;
  requests_by_day: { date: string; count: number; avg_confidence: number }[];
  response_time_trend: { date: string; avg_ms: number }[];
  confidence_trend: { date: string; avg: number }[];
}

export default function AIMetrics() {
  const { data, isLoading } = useQuery({
    queryKey: ['ai-metrics'],
    queryFn: () => api.get<AIMetrics>('/ai/metrics').then(r => r.data),
  });

  if (isLoading) {
    return <Layout><LoadingSpinner /></Layout>;
  }

  const m = data || {
    total_requests: 0, successful_requests: 0, failed_requests: 0,
    ai_handled: 0, human_handled: 0, avg_response_time_ms: 0, avg_confidence: 0,
    requests_by_intent: {}, requests_by_day: [], response_time_trend: [], confidence_trend: [],
  };

  const aiRate = m.total_requests > 0 ? ((m.ai_handled / m.total_requests) * 100).toFixed(1) : '0';
  const successRate = m.total_requests > 0 ? ((m.successful_requests / m.total_requests) * 100).toFixed(1) : '0';
  const failRate = m.total_requests > 0 ? ((m.failed_requests / m.total_requests) * 100).toFixed(1) : '0';

  // Intent pie chart
  const intentData = Object.entries(m.requests_by_intent || {}).map(([intent, count]) => ({
    name: intent.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    value: count as number,
  }));
  const intentMax = Math.max(...intentData.map(d => d.value), 1);

  // Requests by day bar chart
  const last14days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().split('T')[0];
  });
  const byDayMap = Object.fromEntries((m.requests_by_day || []).map((d: any) => [d.date, d]));
  const requestsByDay = last14days.map(date => ({
    date: new Date(date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }),
    requests: byDayMap[date]?.count || 0,
    avg_confidence: byDayMap[date]?.avg_confidence || 0,
  }));

  // Response time trend (line)
  const responseTimeData = (m.response_time_trend || []).map((d: any) => ({
    date: new Date(d.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }),
    avg_ms: Math.round(d.avg_ms),
  }));

  // Confidence trend (line)
  const confidenceData = (m.confidence_trend || []).map((d: any) => ({
    date: new Date(d.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }),
    avg: Math.round((d.avg || 0) * 100) / 100,
  }));

  // Handling comparison (ai vs human)
  const handlingData = [
    { name: 'Atendidos por IA', value: m.ai_handled },
    { name: 'Atendidos por Humano', value: m.human_handled },
  ];

  // Top intents (bar chart, horizontal)
  const topIntents = intentData
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map(item => ({ ...item, pct: Math.round((item.value / intentMax) * 100) }));

  return (
    <Layout>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Métricas de IA</h2>
            <p className="text-sm text-gray-500 mt-1">Monitoramento do assistente inteligente de atendimento</p>
          </div>
          <div className="text-sm text-gray-500">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatCard label="Total de Requisições" value={m.total_requests.toLocaleString('pt-BR')} bg="bg-indigo-50" color="text-indigo-700" />
          <StatCard label="Taxa de Sucesso" value={`${successRate}%`} bg="bg-green-50" color="text-green-700" sub={`${m.successful_requests.toLocaleString('pt-BR')} requisições`} />
          <StatCard label="Taxa de Falha" value={`${failRate}%`} bg="bg-red-50" color="text-red-700" sub={`${m.failed_requests.toLocaleString('pt-BR')} requisições`} />
          <StatCard label="Atendidos por IA" value={`${aiRate}%`} bg="bg-cyan-50" color="text-cyan-700" sub={`${m.ai_handled.toLocaleString('pt-BR')} tickets`} />
          <StatCard label="Tempo Médio (ms)" value={Math.round(m.avg_response_time_ms).toLocaleString('pt-BR')} bg="bg-orange-50" color="text-orange-700" />
          <StatCard label="Confiança Média" value={`${(m.avg_confidence * 100).toFixed(1)}%`} bg="bg-purple-50" color="text-purple-700" />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Requests by day — Bar */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Requisições por Dia (últimos 14 dias)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={requestsByDay} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="requests" fill={COLORS.indigo} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* AI vs Human handling — Pie/Donut */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Atendimento IA vs Humano</h3>
            {handlingData.some(d => d.value > 0) ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={handlingData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      paddingAngle={3} dataKey="value">
                      {handlingData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3">
                  {handlingData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-gray-600 flex-1">{d.name}</span>
                      <span className="font-semibold text-gray-800">{d.value.toLocaleString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Sem dados disponíveis</p>
            )}
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Response time trend — Line */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Tempo de Resposta (ms) — Tendência</h3>
            {responseTimeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={responseTimeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    labelStyle={{ fontWeight: 600 }}
                    formatter={(v: any) => [`${v} ms`, 'Tempo Médio']}
                  />
                  <Line type="monotone" dataKey="avg_ms" stroke={COLORS.orange} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Sem dados disponíveis</p>
            )}
          </div>

          {/* Confidence trend — Line */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Confiança Média — Tendência</h3>
            {confidenceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={confidenceData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" domain={[0, 1]} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    labelStyle={{ fontWeight: 600 }}
                    formatter={(v: any) => [`${(Number(v) * 100).toFixed(1)}%`, 'Confiança']}
                  />
                  <Line type="monotone" dataKey="avg" stroke={COLORS.green} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Sem dados disponíveis</p>
            )}
          </div>
        </div>

        {/* Intent Distribution */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribuição por Intenção</h3>
          {topIntents.length > 0 ? (
            <div className="space-y-3">
              {topIntents.map((item) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="w-40 text-xs text-gray-600 truncate">{item.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${item.pct}%`, backgroundColor: CHART_COLORS[topIntents.indexOf(item) % CHART_COLORS.length] }}
                    />
                  </div>
                  <span className="w-12 text-xs text-gray-500 text-right">{item.value.toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">Sem dados disponíveis</p>
          )}
        </div>
      </div>
    </Layout>
  );
}