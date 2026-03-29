'use client';

import { motion } from 'framer-motion';
import { useTransparency } from '@/context/TransparencyContext';
import { useTheme } from '@/context/ThemeContext';

interface BackgroundLayoutProps {
  children: React.ReactNode;
}

function FloatingOrbs({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <motion.div
        animate={{
          x: [0, 100, 50, 0],
          y: [0, 50, 100, 0],
          scale: [1, 1.2, 0.9, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full"
        style={{
          background: isDarkMode 
            ? 'radial-gradient(circle, rgba(59, 130, 246, 0.35) 0%, rgba(99, 102, 241, 0.2) 40%, transparent 70%)'
            : 'radial-gradient(circle, rgba(59, 130, 246, 0.25) 0%, rgba(99, 102, 241, 0.15) 40%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <motion.div
        animate={{
          x: [0, -80, -40, 0],
          y: [0, 80, 40, 0],
          scale: [1, 0.8, 1.1, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-1/4 -right-40 w-[450px] h-[450px] rounded-full"
        style={{
          background: isDarkMode
            ? 'radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, rgba(168, 85, 247, 0.15) 40%, transparent 70%)'
            : 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, rgba(168, 85, 247, 0.1) 40%, transparent 70%)',
          filter: 'blur(70px)',
        }}
      />
      <motion.div
        animate={{
          x: [0, 60, -30, 0],
          y: [0, -60, 30, 0],
          scale: [1, 1.3, 0.85, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -bottom-20 left-1/4 w-[400px] h-[400px] rounded-full"
        style={{
          background: isDarkMode
            ? 'radial-gradient(circle, rgba(6, 182, 212, 0.3) 0%, rgba(34, 211, 238, 0.15) 40%, transparent 70%)'
            : 'radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, rgba(34, 211, 238, 0.1) 40%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <motion.div
        animate={{
          x: [0, -50, 80, 0],
          y: [0, 100, -50, 0],
          scale: [1, 0.9, 1.15, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-2/3 right-1/3 w-[350px] h-[350px] rounded-full"
        style={{
          background: isDarkMode
            ? 'radial-gradient(circle, rgba(236, 72, 153, 0.25) 0%, rgba(244, 114, 182, 0.12) 40%, transparent 70%)'
            : 'radial-gradient(circle, rgba(236, 72, 153, 0.18) 0%, rgba(244, 114, 182, 0.08) 40%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />
      <motion.div
        animate={{
          x: [0, 70, -20, 0],
          y: [0, -40, 70, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
        style={{
          background: isDarkMode
            ? 'radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, rgba(52, 211, 153, 0.1) 40%, transparent 70%)'
            : 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(52, 211, 153, 0.08) 40%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      <motion.div
        animate={{
          x: [0, 40, -60, 0],
          y: [0, -80, 40, 0],
          scale: [1, 1.15, 0.9, 1],
        }}
        transition={{
          duration: 28,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-1/4 left-1/3 w-[380px] h-[380px] rounded-full"
        style={{
          background: isDarkMode
            ? 'radial-gradient(circle, rgba(251, 146, 60, 0.2) 0%, rgba(249, 115, 22, 0.1) 40%, transparent 70%)'
            : 'radial-gradient(circle, rgba(251, 146, 60, 0.15) 0%, rgba(249, 115, 22, 0.08) 40%, transparent 70%)',
          filter: 'blur(55px)',
        }}
      />
    </div>
  );
}

export default function BackgroundLayout({ children }: BackgroundLayoutProps) {
  const { isDarkMode } = useTheme();
  const { isTransparent } = useTransparency();

  return (
    <div className={`min-h-screen transition-colors duration-500 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950' 
        : 'bg-gradient-to-br from-slate-50 via-white to-slate-100'
    }`}>
      {isTransparent && <FloatingOrbs isDarkMode={isDarkMode} />}
      
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
