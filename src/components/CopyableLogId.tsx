'use client';

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

interface CopyableLogIdProps {
  id: string;
  className?: string;
  textClassName?: string;
}

export function CopyableLogId({ id, className = '', textClassName = '' }: CopyableLogIdProps) {
  const { copiedId, handleCopy } = useCopyToClipboard(1000);

  return (
    <button
      onClick={(e) => handleCopy(e, id)}
      className={`relative group cursor-pointer px-2 py-1 -mr-2 -my-1 rounded-md transition-all duration-200 ease-out ${
        copiedId === id
          ? 'bg-[#34C759]/10'
          : 'hover:bg-[var(--accent-blue)]/8'
      } ${className}`}
    >
      <span className={`font-mono text-xs invisible ${textClassName}`}>
        {id}
      </span>
      <span className={`absolute inset-0 flex items-center justify-center px-2 font-mono text-xs transition-all duration-300 ease-out ${
        copiedId === id
          ? 'text-[#34C759] opacity-100'
          : 'text-[var(--text-secondary)] group-hover:text-[var(--accent-blue)] opacity-100'
      } ${textClassName}`}>
        {copiedId === id ? '📋 已复制' : id}
      </span>
    </button>
  );
}
