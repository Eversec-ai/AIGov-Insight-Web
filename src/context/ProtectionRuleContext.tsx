'use client';

import { createContext, useState, useContext, ReactNode, useCallback } from 'react';

export interface PrefilledRuleData {
  pattern: string;
  description: string;
  type: 'block' | 'confirm' | 'warn';
  sourceType: 'OPENCLAW' | 'LLM' | 'EXEC' | 'FILE' | 'HTTP' | 'AGENT' | 'RAG' | 'MCP' | 'AG-UI' | 'TOOLCALL';
  sourceInfo?: {
    logId?: string;
    processName?: string;
    timestamp?: string;
  };
}

interface ProtectionRuleContextType {
  prefilledRule: PrefilledRuleData | null;
  setPrefilledRule: (rule: PrefilledRuleData | null) => void;
  clearPrefilledRule: () => void;
  hasPrefilledRule: boolean;
}

const ProtectionRuleContext = createContext<ProtectionRuleContextType | undefined>(undefined);

export const ProtectionRuleProvider = ({ children }: { children: ReactNode }) => {
  const [prefilledRule, setPrefilledRuleState] = useState<PrefilledRuleData | null>(null);

  const setPrefilledRule = useCallback((rule: PrefilledRuleData | null) => {
    setPrefilledRuleState(rule);
  }, []);

  const clearPrefilledRule = useCallback(() => {
    setPrefilledRuleState(null);
  }, []);

  const hasPrefilledRule = prefilledRule !== null;

  return (
    <ProtectionRuleContext.Provider 
      value={{ 
        prefilledRule, 
        setPrefilledRule, 
        clearPrefilledRule,
        hasPrefilledRule
      }}
    >
      {children}
    </ProtectionRuleContext.Provider>
  );
};

export const useProtectionRule = () => {
  const context = useContext(ProtectionRuleContext);
  if (context === undefined) {
    throw new Error('useProtectionRule must be used within a ProtectionRuleProvider');
  }
  return context;
};
