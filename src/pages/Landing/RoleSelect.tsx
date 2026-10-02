import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Scale, Briefcase, UserCheck, Shield, ArrowRight } from 'lucide-react';

export const RoleSelect: React.FC = () => {
  const reduceMotion = useReducedMotion();

  return (
    <div className="app-shell app-shell-landing role-select-page min-h-screen flex flex-col justify-between text-[#172554]">
      {/* Top Banner */}
      <header className="glass-surface py-5 px-4 text-center border-b border-white/70">
        <div className="flex items-center justify-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#2563EB] via-[#4F46E5] to-[#7C3AED] flex items-center justify-center text-white shadow-lg shadow-blue-700/20">
            <Scale className="w-6 h-6" />
          </div>
          <div className="text-left">
            <h1 className="font-legal-heading text-2xl font-bold tracking-tight text-[#172554]">CaseLens</h1>
            <p className="text-xs text-[#52617B] uppercase tracking-wider">Court & Legal Case Intelligence Platform</p>
          </div>
        </div>
      </header>

      {/* Main Role Selection Area */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12 flex flex-col justify-center">
        <div className="text-center mb-10">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#2563EB] font-bold mb-3">Evidence, in context</p>
          <h2 className="font-legal-heading text-3xl sm:text-5xl text-[#172554] font-semibold">
            A clearer view of every case.
          </h2>
          <p className="mt-3 text-base text-[#52617B] max-w-xl mx-auto">
            Choose your workspace to review grounded evidence, follow case developments, and keep every decision traceable.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto w-full">
          {/* Lawyer Card */}
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.42, ease: 'easeOut' }}>
          <Link
            to="/auth/lawyer"
            className="glass-surface premium-link group relative rounded-3xl p-7 sm:p-8 hover:border-blue-300 hover:shadow-2xl transition-all flex flex-col justify-between card-brass-top"
          >
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 border border-white flex items-center justify-center text-[#2563EB] mb-5 group-hover:from-blue-600 group-hover:to-violet-600 group-hover:text-white transition-colors">
                <Briefcase className="w-6 h-6" />
              </div>
              <h3 className="font-legal-heading text-xl font-semibold text-[#172554] group-hover:text-[#2563EB] transition-colors">
                Advocate / Legal Counsel
              </h3>
              <p className="mt-3 text-sm text-[#52617B] leading-relaxed">
                Full legal workspace for case management, multi-document evidence extraction, deterministic conflict detection, and human review sign-offs.
              </p>
            </div>
            <div className="mt-7 pt-4 border-t border-slate-200/70 flex items-center justify-between text-sm font-semibold text-[#1D4ED8]">
              <span>Counsel Login & Registration</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-[#B08D57]" />
            </div>
          </Link>
          </motion.div>

          {/* Guardian / Individual Card */}
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.42, delay: reduceMotion ? 0 : 0.1, ease: 'easeOut' }}>
          <Link
            to="/auth/guardian"
            className="glass-surface premium-link group relative rounded-3xl p-7 sm:p-8 hover:border-cyan-300 hover:shadow-2xl transition-all flex flex-col justify-between card-brass-top"
          >
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-100 to-teal-100 border border-white flex items-center justify-center text-[#0891B2] mb-5 group-hover:from-cyan-500 group-hover:to-blue-600 group-hover:text-white transition-colors">
                <UserCheck className="w-6 h-6" />
              </div>
              <h3 className="font-legal-heading text-xl font-semibold text-[#172554] group-hover:text-[#0891B2] transition-colors">
                Guardian / Individual Client
              </h3>
              <p className="mt-3 text-sm text-[#52617B] leading-relaxed">
                Simplified, secure portal to view court hearing schedules, authorized case timeline milestones, and documents shared by your lawyer.
              </p>
            </div>
            <div className="mt-7 pt-4 border-t border-slate-200/70 flex items-center justify-between text-sm font-semibold text-[#0E7490]">
              <span>OTP Verification Login</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-[#B08D57]" />
            </div>
          </Link>
          </motion.div>
        </div>

        <div className="mt-10 text-center text-xs text-[#52617B] flex items-center justify-center gap-2">
          <Shield className="w-4 h-4 text-[#10B981]" />
          <span>Role-Based Access Control & Immutable Append-Only Audit Logging Active</span>
        </div>
      </main>

      {/* Footer */}
      <footer className="glass-surface py-4 text-center text-xs text-[#52617B] border-t border-white/70">
        CaseLens Legal Intelligence Platform · Alpha Build · Dedicated to auditable legal reasoning
      </footer>
    </div>
  );
};
