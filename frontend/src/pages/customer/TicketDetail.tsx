import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTicket, getComments, createComment, approveTicket, rejectTicket } from '../../api/client';
import Modal from '../../components/Modal';
import ImageViewer from '../../components/ImageViewer';

export default function CustomerTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [commentText, setCommentText] = useState('');
  const [showApproveSuccess, setShowApproveSuccess] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [viewingImageIndex, setViewingImageIndex] = useState(-1);

  const { data: ticket, isLoading: ticketLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id!).then(r => r.data),
  });

  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ['comments', id],
    queryFn: () => getComments(id!).then(r => r.data),
    enabled: !!id,
  });

  const addComment = useMutation({
    mutationFn: () => createComment(id!, { body: commentText, is_public: true }),
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
    },
  });

  const handleApprove = useMutation({
    mutationFn: (comment?: string) => approveTicket(id!, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      setShowApproveSuccess(true);
    },
  });

  const handleReject = useMutation({
    mutationFn: ({ comment }: { comment: string }) => rejectTicket(id!, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      setShowRejectModal(false);
      setRejectComment('');
    },
  });

  if (ticketLoading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;

  const statusLabels: Record<string, { label: string; className: string }> = {
    open: { label: 'Aberto', className: 'bg-blue-100 text-blue-700' },
    in_progress: { label: 'Em Progresso', className: 'bg-yellow-100 text-yellow-700' },
    pending: { label: 'Pendente', className: 'bg-orange-100 text-orange-700' },
    solved: { label: 'Resolvido', className: 'bg-green-100 text-green-700' },
    closed: { label: 'Fechado', className: 'bg-gray-100 text-gray-700' },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <h1 className="text-xl font-bold text-indigo-600">wolfx.atendimento</h1>
          <button onClick={() => navigate('/customer/tickets')} className="text-sm text-gray-600 hover:text-indigo-600">
            ← Voltar
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Ticket Info */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{ticket?.title}</h2>
              <p className="text-sm text-gray-500 mt-1">
                Criado em {new Date(ticket?.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="flex gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusLabels[ticket?.status]?.className}`}>
                {statusLabels[ticket?.status]?.label}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                {ticket?.priority}
              </span>
            </div>
          </div>

          <p className="text-gray-700 whitespace-pre-wrap">{ticket?.description}</p>

          {ticket?.resolution_summary && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm font-medium text-green-800">Resolução:</p>
              <p className="text-green-700 mt-1">{ticket.resolution_summary}</p>
            </div>
          )}
        </div>

        {/* Attachments */}
        {ticket?.photos && ticket.photos.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Anexos ({ticket.photos.length})</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {ticket.photos.map((url: string, idx: number) => {
                const filename = url.split('/').pop() || `file-${idx}`;
                const ext = filename.split('.').pop()?.toLowerCase() || '';
                const isImage = ['jpg','jpeg','png','gif','webp','svg'].includes(ext);
                const iconMap: Record<string, string> = {
                  pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
                  ppt: '📙', pptx: '📙', txt: '📝', zip: '🗜️',
                  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
                };
                const icon = iconMap[ext] || '📎';
                return (
                  <div key={idx} className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50 hover:border-indigo-300 transition-colors">
                    {isImage ? (
                      <button
                        type="button"
                        onClick={() => {
                          const images = ticket.photos
                            .map((u: string, i: number) => ({ url: u, filename: u.split('/').pop() || `file-${i}` }))
                            .filter((f: {filename: string}) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.filename));
                          const imgIdx = images.findIndex((f: {url: string}) => f.url === url);
                          setViewingImageIndex(imgIdx);
                        }}
                        className="w-full"
                      >
                        <img src={url} alt={filename} className="w-full h-24 object-cover" />
                      </button>
                    ) : (
                      <a
                        href={url}
                        download={filename}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center h-24 p-2 text-xs text-gray-600 hover:text-indigo-600"
                      >
                        <span className="text-2xl mb-1">{icon}</span>
                        <span className="truncate w-full text-center leading-tight">{filename}</span>
                      </a>
                    )}
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={url}
                        download={filename}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-indigo-700"
                        title="Baixar"
                      >
                        ↓
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Approval Section */}
        {ticket?.status === 'solved' && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Avaliar Resolução</h3>
            <p className="text-gray-600 mb-4">O agente resolveu o teu ticket.Estás satisfeito com a resolução?</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleApprove.mutate(undefined)}
                className="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 font-medium"
              >
                ✓ Aprovar
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="bg-red-600 text-white px-6 py-2.5 rounded-lg hover:bg-red-700 font-medium"
              >
                ✗ Rejeitar
              </button>
            </div>
          </div>
        )}

        {/* Comments */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-800">Conversação ({comments?.length || 0})</h3>
          </div>

          <div className="p-6 space-y-4">
            {commentsLoading ? (
              <p className="text-center text-gray-500">Carregando comentários...</p>
            ) : comments?.length === 0 ? (
              <p className="text-center text-gray-500">Sem comentários ainda.</p>
            ) : (
              comments?.map((comment: any) => (
                <div key={comment.id} className={`p-4 rounded-lg ${comment.is_public ? 'bg-gray-50' : 'bg-yellow-50 border border-yellow-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-gray-800">{comment.author_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${comment.author_role === 'agent' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                      {comment.author_role}
                    </span>
                    {!comment.is_public && <span className="text-xs text-yellow-600">🔒 Interno</span>}
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(comment.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-gray-700">{comment.body}</p>
                </div>
              ))
            )}
          </div>

          {/* Add Comment */}
          <div className="p-6 border-t">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Escreva um comentário..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none mb-3"
            />
            <button
              onClick={() => addComment.mutate()}
              disabled={!commentText.trim() || addComment.isPending}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
            >
              {addComment.isPending ? 'Enviando...' : 'Enviar Comentário'}
            </button>
          </div>
        </div>
      </main>

      {/* Approve Success Modal */}
      <Modal isOpen={showApproveSuccess} onClose={() => setShowApproveSuccess(false)} title="Ticket Aprovado" size="sm">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-gray-700 mb-4">Ticket aprovado! Obrigado pelo feedback.</p>
          <button
            onClick={() => setShowApproveSuccess(false)}
            className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium"
          >
            Fechar
          </button>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={showRejectModal} onClose={() => { setShowRejectModal(false); setRejectComment(''); }} title="Rejeitar Ticket">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (rejectComment.trim()) {
              handleReject.mutate({ comment: rejectComment });
            }
          }}
          className="space-y-4"
        >
          <p className="text-gray-600 text-sm">Explique porque está a rejeitar a resolução deste ticket.</p>
          <div>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Descreva o motivo da rejeição..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
              required
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setShowRejectModal(false); setRejectComment(''); }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!rejectComment.trim() || handleReject.isPending}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium disabled:opacity-50"
            >
              {handleReject.isPending ? 'A enviar...' : 'Rejeitar Ticket'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Image viewer */}
      {viewingImageIndex >= 0 && ticket?.photos && (() => {
        const images = (ticket.photos as string[])
          .map((u, i) => ({ url: u, filename: u.split('/').pop() || `file-${i}` }))
          .filter((f) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.filename));
        return (
          <ImageViewer
            images={images}
            currentIndex={viewingImageIndex}
            onClose={() => setViewingImageIndex(-1)}
            onPrev={() => setViewingImageIndex(i => (i - 1 + images.length) % images.length)}
            onNext={() => setViewingImageIndex(i => (i + 1) % images.length)}
          />
        );
      })()}
    </div>
  );
}
