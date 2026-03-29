'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  onClick?: () => void;
  gradient?: 'blue' | 'purple' | 'cyan' | 'emerald' | 'pink';
}

const gradientStyles = {
  blue: {
    bg: 'from-blue-500/10 to-indigo-500/10',
    border: 'border-blue-500/20',
    iconBg: 'from-blue-500 to-indigo-600',
    shadow: 'shadow-blue-500/10',
    glow: 'rgba(59, 130, 246, 0.15)',
  },
  purple: {
    bg: 'from-purple-500/10 to-pink-500/10',
    border: 'border-purple-500/20',
    iconBg: 'from-purple-500 to-pink-600',
    shadow: 'shadow-purple-500/10',
    glow: 'rgba(139, 92, 246, 0.15)',
  },
  cyan: {
    bg: 'from-cyan-500/10 to-blue-500/10',
    border: 'border-cyan-500/20',
    iconBg: 'from-cyan-500 to-blue-600',
    shadow: 'shadow-cyan-500/10',
    glow: 'rgba(6, 182, 212, 0.15)',
  },
  emerald: {
    bg: 'from-emerald-500/10 to-teal-500/10',
    border: 'border-emerald-500/20',
    iconBg: 'from-emerald-500 to-teal-600',
    shadow: 'shadow-emerald-500/10',
    glow: 'rgba(16, 185, 129, 0.15)',
  },
  pink: {
    bg: 'from-pink-500/10 to-rose-500/10',
    border: 'border-pink-500/20',
    iconBg: 'from-pink-500 to-rose-600',
    shadow: 'shadow-pink-500/10',
    glow: 'rgba(236, 72, 153, 0.15)',
  },
};

export function StatCard({ title, value, icon: Icon, trend, className, onClick, gradient = 'blue' }: StatCardProps) {
  const { isDarkMode } = useTheme();
  const style = gradientStyles[gradient];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      whileHover={{ scale: onClick ? 1.02 : 1, y: -2 }}
      whileTap={{ scale: onClick ? 0.98 : 1 }}
      onClick={onClick}
      className={cn(
        'relative rounded-2xl p-6 overflow-hidden',
        'backdrop-blur-2xl border transition-all duration-300',
        `bg-gradient-to-br ${style.bg} ${style.border}`,
        'hover:shadow-xl',
        onClick ? 'cursor-pointer hover:border-opacity-50' : '',
        className
      )}
      style={{
        boxShadow: isDarkMode 
          ? `0 4px 20px rgba(0, 0, 0, 0.3), 0 0 40px ${style.glow}`
          : `0 4px 20px rgba(0, 0, 0, 0.05), 0 0 40px ${style.glow}`,
      }}
    >
      <div className="absolute top-0 right-0 w-32 h-32 opacity-30">
        <div className={`absolute inset-0 bg-gradient-to-br ${style.iconBg} blur-3xl`} />
      </div>
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className={`text-sm font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {title}
          </p>
          <h3 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {value}
          </h3>
          {trend && (
            <div className="flex items-center mt-2.5">
              <span
                className={cn(
                  'text-sm font-semibold px-2 py-0.5 rounded-full',
                  trend.isPositive 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-red-500/20 text-red-400'
                )}
              >
                {trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}%
              </span>
              <span className={`text-xs ml-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                vs last hour
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl bg-gradient-to-br ${style.iconBg} shadow-lg`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </motion.div>
  );
}
