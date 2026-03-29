'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';

function FloatingOrbs({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
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

function GlowingLine({ delay = 0, className = "" }: { delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ delay, duration: 0.8, ease: "easeOut" }}
      className={`h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent ${className}`}
    />
  );
}

export default function SignInPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isQuickLoginEnabled, setIsQuickLoginEnabled] = useState(false);
  const { isDarkMode } = useTheme();
  const router = useRouter();
  
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          setIsQuickLoginEnabled(config.enableQuickLogin);
        }
      } catch (error) {
        console.error('Failed to fetch config:', error);
      }
    };
    
    fetchConfig();
  }, []);
  
  const handleQuickLogin = async () => {
    setIsLoading(true);
    setError('');
    
    const result = await signIn('credentials', {
      username: 'admin',
      password: 'quick-login',
      redirect: false,
    });
    
    if (result?.error) {
      setError('快捷登录失败');
      setIsLoading(false);
      return;
    }
    
    if (result?.ok) {
      router.replace('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const result = await signIn('credentials', {
      username,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError('用户名或密码错误');
      setIsLoading(false);
      return;
    }

    if (result?.ok) {
      router.replace('/');
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 relative overflow-hidden ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950' 
        : 'bg-gradient-to-br from-slate-50 via-white to-slate-100'
    }`}>
      <FloatingOrbs isDarkMode={isDarkMode} />
      
      <div className="relative z-10 w-full max-w-5xl flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex-1 text-center lg:text-left"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mb-4"
          >
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
              isDarkMode 
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                : 'bg-blue-50 text-blue-600 border border-blue-200'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2 animate-pulse" />
              全球领先 AI 安全治理平台
            </span>
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className={`text-4xl lg:text-5xl font-extrabold mb-6 leading-tight ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}
          >
            <span className="relative inline-block">
              <span className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 via-pink-500 to-blue-500 bg-[length:300%_100%] bg-clip-text text-transparent animate-gradient-flow-slow drop-shadow-[0_0_30px_rgba(139,92,246,0.5)]">
                AI 世界的「全息沙盘」
              </span>
              <span className="relative bg-gradient-to-r from-blue-400 via-indigo-400 via-purple-400 via-pink-400 to-cyan-400 bg-[length:300%_100%] bg-clip-text text-transparent animate-gradient-flow-slow">
                AI 世界的「全息沙盘」
              </span>
            </span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className={`text-xl lg:text-2xl font-medium mb-4 ${
              isDarkMode ? 'text-gray-200' : 'text-gray-800'
            }`}
          >
            让 AI 的每一次"思考"与"行动"
          </motion.p>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className={`text-xl lg:text-2xl font-medium mb-8 ${
              isDarkMode ? 'text-gray-200' : 'text-gray-800'
            }`}
          >
            <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent font-semibold">
              全程透明、可溯、可控
            </span>
          </motion.p>
          
          <GlowingLine delay={0.6} className="w-32 lg:w-48 mb-8 mx-auto lg:mx-0" />
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className={`text-sm lg:text-base mb-4 leading-relaxed ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}
          >
            <span className="font-semibold text-blue-500">AIGov-Insight</span> 是恒安嘉新打造的全球领先 AI 全链路可观测智能体安全治理平台
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="flex flex-wrap gap-2 justify-center lg:justify-start"
          >
            {['LLM', 'Agent', 'MCP', 'RAG', 'OpenClaw'].map((tag, index) => (
              <span
                key={tag}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-300 ${
                  isDarkMode 
                    ? 'bg-gray-800/50 text-gray-300 border border-gray-700/50 hover:border-blue-500/30 hover:bg-blue-500/10' 
                    : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {tag}
              </span>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden backdrop-blur-2xl ${
            isDarkMode 
              ? 'bg-gray-900/60 border border-gray-700/50' 
              : 'bg-white/70 border border-white/50'
          }`}
          style={{
            boxShadow: isDarkMode 
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset' 
              : '0 25px 50px -12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.5) inset'
          }}
        >
          <div className={`p-8 ${isDarkMode ? 'bg-gray-800/30' : 'bg-gray-50/50'} border-b ${isDarkMode ? 'border-gray-700/50' : 'border-gray-100'}`}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
              className="text-center"
            >
              <div className="mb-5 flex justify-center">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                  isDarkMode 
                    ? 'bg-gradient-to-br from-blue-500/20 to-indigo-600/20' 
                    : 'bg-gradient-to-br from-blue-50 to-indigo-50'
                }`}>
                  <img src="/logo.png" alt="Logo" className="w-12 h-12 object-contain" />
                </div>
              </div>
              <h2 className={`text-xl font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                欢迎回来
              </h2>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                登录以继续探索 AI 可观测之旅
              </p>
            </motion.div>
          </div>

          <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <motion.label
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                  htmlFor="username" 
                  className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                >
                  用户名
                </motion.label>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45, duration: 0.4 }}
                >
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    required
                    className={`w-full px-4 py-3 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 ${
                      isDarkMode 
                        ? 'bg-gray-800/50 text-white border border-gray-700/50 placeholder-gray-500 focus:ring-blue-500/50 focus:border-blue-500/50' 
                        : 'bg-white/80 text-gray-900 border border-gray-200 placeholder-gray-400 focus:ring-blue-500/30 focus:border-blue-500/30'
                    }`}
                  />
                </motion.div>
              </div>

              <div className="space-y-2">
                <motion.label
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.4 }}
                  htmlFor="password" 
                  className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                >
                  密码
                </motion.label>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55, duration: 0.4 }}
                >
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className={`w-full px-4 py-3 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 ${
                      isDarkMode 
                        ? 'bg-gray-800/50 text-white border border-gray-700/50 placeholder-gray-500 focus:ring-blue-500/50 focus:border-blue-500/50' 
                        : 'bg-white/80 text-gray-900 border border-gray-200 placeholder-gray-400 focus:ring-blue-500/30 focus:border-blue-500/30'
                    }`}
                  />
                </motion.div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-3 rounded-xl text-sm font-medium ${
                    isDarkMode 
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                      : 'bg-red-50 text-red-600 border border-red-200'
                  }`}
                >
                  {error}
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.4 }}
                className="pt-2"
              >
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-3.5 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-lg'
                  } bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700`}
                  style={{
                    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
                  }}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    '登录'
                  )}
                </motion.button>
              </motion.div>
              
              {isQuickLoginEnabled && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.65, duration: 0.4 }}
                >
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className={`w-full border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`} />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className={`px-3 ${isDarkMode ? 'bg-gray-900/60 text-gray-500' : 'bg-white/70 text-gray-400'}`}>
                        或
                      </span>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleQuickLogin}
                    disabled={isLoading}
                    className={`w-full py-3.5 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                      isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-lg'
                    } bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700`}
                    style={{
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                    }}
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      '快捷免密登录'
                    )}
                  </motion.button>
                </motion.div>
              )}
            </form>
          </div>
        </motion.div>
      </div>
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
        className={`absolute bottom-6 text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}
      >
        © 2026 恒安嘉新 · AIGov-Insight
      </motion.div>
    </div>
  );
}
