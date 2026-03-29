import { useState, useCallback } from 'react';

export function useCopyToClipboard(timeout: number = 1000) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  }, []);

  const handleCopy = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    copyToClipboard(id).then((success) => {
      if (success) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), timeout);
      }
    });
  }, [copyToClipboard, timeout]);

  return { copiedId, handleCopy };
}
