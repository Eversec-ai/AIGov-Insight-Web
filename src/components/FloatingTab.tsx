'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { Shield } from 'lucide-react';

interface FloatingTabProps {
  isActive: boolean;
  onClick: () => void;
  label?: string;
}

export function FloatingTab({ 
  isActive, 
  onClick, 
  label = '智能防护' 
}: FloatingTabProps) {
  const { isDarkMode } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, x: -20, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ 
        duration: 0.5, 
        ease: [0.34, 1.56, 0.64, 1],
        delay: 0.1 
      }}
    >
      <motion.button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative flex items-center gap-2 px-5 py-2.5 rounded-xl overflow-hidden"
        style={{
          background: isActive
            ? 'linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #9333ea 100%)'
            : isDarkMode
              ? 'rgba(31, 41, 55, 0.6)'
              : 'rgba(255, 255, 255, 0.8)',
          boxShadow: isActive
            ? '0 8px 32px rgba(99, 102, 241, 0.35), 0 0 0 1px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
            : isDarkMode
              ? '0 4px 16px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
              : '0 4px 16px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        }}
        whileTap={{ scale: 0.98 }}
      >
        <AnimatePresence mode="wait">
          {isActive && (
            <motion.div
              key="active-bg"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                }}
                animate={{
                  backgroundPosition: ['200% 0', '-200% 0'],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <motion.div
                className="absolute inset-0 opacity-60"
                animate={{
                  background: [
                    'linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.1) 50%, transparent 70%)',
                    'linear-gradient(120deg, transparent 70%, rgba(255, 255, 255, 0.1) 50%, transparent 30%)',
                    'linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.1) 50%, transparent 70%)',
                  ],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(isActive || isHovered) && (
            <motion.div
              className="absolute pointer-events-none"
              initial={{ left: '-100%', opacity: 0 }}
              animate={{ 
                left: '100%',
                opacity: [0, 1, 1, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{ 
                duration: 0.8,
                ease: [0.25, 0.1, 0.25, 1],
                repeat: isActive ? Infinity : 0,
                repeatDelay: 1.5,
              }}
              style={{
                top: 0,
                width: '60%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent)',
                filter: 'blur(2px)',
                transform: 'skewX(-20deg)',
              }}
            />
          )}
        </AnimatePresence>

        <motion.div
          className="relative flex items-center gap-2"
          animate={{
            color: isActive
              ? '#ffffff'
              : isDarkMode
                ? '#9ca3af'
                : '#6b7280',
          }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            animate={{
              rotate: isActive ? [0, -10, 10, -10, 0] : 0,
              scale: isActive ? [1, 1.1, 1] : 1,
            }}
            transition={{
              duration: 0.5,
              ease: 'easeInOut',
            }}
          >
            <Shield className="w-4 h-4" />
          </motion.div>
          
          <span className="text-sm font-medium whitespace-nowrap">{label}</span>
        </motion.div>
      </motion.button>

      {isActive && (
        <motion.div
          className="absolute -inset-1 rounded-2xl pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.1))',
            filter: 'blur(8px)',
          }}
        />
      )}
    </motion.div>
  );
}

export function FloatingTabContainer({ 
  children,
  className = '',
}: { 
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={`relative ${className}`}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-gradient-to-b from-transparent via-[var(--border-color)] to-transparent opacity-50" />
      {children}
    </motion.div>
  );
}
