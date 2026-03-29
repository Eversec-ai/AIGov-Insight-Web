'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';

interface Tab {
  id: string;
  label: string;
}

interface TabSwitcherProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function TabSwitcher({ tabs, activeTab, onTabChange }: TabSwitcherProps) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const { isDarkMode } = useTheme();

  return (
    <div className={`relative flex items-center justify-center gap-2 p-1.5 rounded-2xl backdrop-blur-xl border transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gray-800/60 border-gray-700/50' 
        : 'bg-white/80 border-gray-200/50 shadow-sm'
    }`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const isHovered = hoveredTab === tab.id;

        return (
          <motion.button
            key={tab.id}
            className={`relative px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              isActive
                ? 'text-white'
                : isDarkMode
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => onTabChange(tab.id)}
            onMouseEnter={() => setHoveredTab(tab.id)}
            onMouseLeave={() => setHoveredTab(null)}
            whileTap={{ scale: 0.98 }}
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            {isHovered && !isActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`absolute inset-0 rounded-xl ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'}`}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
