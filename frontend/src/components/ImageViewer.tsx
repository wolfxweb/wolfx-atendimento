import { useEffect } from 'react';

interface ImageViewerProps {
  images: { url: string; filename: string }[];
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function ImageViewer({ images, currentIndex, onClose, onPrev, onNext }: ImageViewerProps) {
  const current = images[currentIndex];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, onPrev, onNext]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-black/50" onClick={e => e.stopPropagation()}>
        <span className="text-white text-sm truncate max-w-md">
          {current.filename}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">{currentIndex + 1} / {images.length}</span>
          <a
            href={current.url}
            download={current.filename}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-white hover:text-indigo-300 text-sm px-3 py-1 border border-white/30 rounded hover:border-indigo-300 transition-colors"
          >
            Baixar
          </a>
          <button onClick={onClose} className="text-white hover:text-red-400 text-xl leading-none px-2">✕</button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden" onClick={e => e.stopPropagation()}>
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onPrev(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 rounded-full w-12 h-12 flex items-center justify-center text-2xl transition-colors"
            >
              ‹
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onNext(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 rounded-full w-12 h-12 flex items-center justify-center text-2xl transition-colors"
            >
              ›
            </button>
          </>
        )}
        <img
          src={current.url}
          alt={current.filename}
          className="max-w-full max-h-full object-contain"
          onClick={e => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
