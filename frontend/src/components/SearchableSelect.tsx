import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
  color?: string;
  icon?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecionar...',
  label,
  error,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(o => o.value === value);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  // Group by first letter for better UX
  const grouped = filtered.reduce((acc, opt) => {
    const letter = opt.label[0].toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(opt);
    return acc;
  }, {} as Record<string, Option[]>);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-2.5 border rounded-lg text-left flex items-center justify-between focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors ${
          error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
      >
        {selectedOption ? (
          <span className="flex items-center gap-2">
            {selectedOption.color && (
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedOption.color }} />
            )}
            <span className="truncate text-gray-700">{selectedOption.label}</span>
          </span>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                Nenhuma opção encontrada
              </div>
            ) : (
              Object.entries(grouped).map(([letter, opts]) => (
                <div key={letter}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50 border-b border-gray-100 sticky top-0">
                    {letter}
                  </div>
                  {opts.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full px-3 py-2.5 text-left flex items-center gap-2 hover:bg-indigo-50 transition-colors ${
                        value === opt.value ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'
                      }`}
                    >
                      {opt.color && (
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                      )}
                      <span className="truncate text-sm">{opt.label}</span>
                      {value === opt.value && (
                        <svg className="w-4 h-4 ml-auto text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Footer count */}
          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
            {filtered.length} {filtered.length === 1 ? 'opção' : 'opções'}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
