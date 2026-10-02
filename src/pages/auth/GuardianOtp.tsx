import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, HeartHandshake, KeyRound, Mail, Scale, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../lib/auth.js';
import { apiRequest } from '../../lib/api.js';
import { AppButton, AppInput } from '../../components/ui/AppPrimitives.js';

export const GuardianOtp: React.FC = () => {
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const { verifyGuardianOtp } = useAuth();
  const navigate = useNavigate();

  const handleRequestOtp = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setStatusMessage(null); setLoading(true);
    try {
      const response = await apiRequest<{ success: boolean; mode: string; devCode?: string; message?: string }>('/api/auth/guardian/otp/request', { method: 'POST', body: JSON.stringify({ identifier: identifier.trim() }) });
      setStatusMessage(response.message || 'Verification code sent. Check your email or messages.');
      if (response.devCode) setCode(response.devCode);
      setStep('verify');
    } catch (err: any) { setError(err?.message || 'We could not send a verification code. Confirm the email or mobile number your attorney registered.'); }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setLoading(true);
    try { await verifyGuardianOtp(identifier.trim(), code.trim()); navigate('/guardian/dashboard'); }
    catch (err: any) { setError(err?.message || 'That code could not be verified. Check all six digits or request a new code.'); }
    finally { setLoading(false); }
  };

  return <main className="app-shell app-shell-auth auth-gradient-guardian min-h-screen overflow-hidden px-4 py-6 sm:px-8 lg:px-10">
    <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl overflow-hidden rounded-[30px] border border-white/80 bg-white/75 shadow-[0_35px_100px_-55px_rgba(30,41,90,.45)] backdrop-blur-xl lg:grid-cols-[1.02fr_.98fr]">
      <section className="guardian-login-visual relative flex min-h-[340px] flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-6 text-white sm:p-10 lg:min-h-[700px] lg:p-14">
        <div className="pointer-events-none absolute -right-20 -top-24 size-96 rounded-full border border-white/10 shadow-[0_0_0_32px_rgba(255,255,255,.03),0_0_0_68px_rgba(255,255,255,.02)]" />
        <div className="relative flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Scale className="size-5 text-cyan-200" /></span><span><strong className="block text-sm tracking-wide">CaseLens</strong><span className="block text-[10px] tracking-[.18em] text-blue-100/70">CLIENT & GUARDIAN PORTAL</span></span></div>
        <div className="relative mx-auto my-7 flex w-full max-w-lg flex-1 flex-col justify-center">
          <div className="relative mx-auto mb-7 aspect-[1.45] w-full max-w-md" aria-hidden="true">
            <div className="absolute inset-x-[13%] bottom-[8%] h-[55%] rounded-[34px] border border-white/15 bg-white/[.07] shadow-2xl backdrop-blur-sm" />
            <div className="absolute left-[22%] top-[4%] grid size-24 place-items-center rounded-full border border-cyan-100/20 bg-gradient-to-br from-cyan-300/25 to-violet-300/20 shadow-[0_15px_60px_rgba(34,211,238,.18)]"><HeartHandshake className="size-11 text-cyan-100" /></div>
            <div className="absolute right-[17%] top-[12%] grid size-14 place-items-center rounded-2xl border border-white/20 bg-white/10 text-emerald-200 backdrop-blur-md"><ShieldCheck className="size-7" /></div>
            <div className="absolute bottom-[17%] left-[23%] right-[23%] space-y-3 rounded-2xl border border-white/15 bg-slate-950/30 p-4 backdrop-blur-md"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-300" /><span className="h-2 w-24 rounded-full bg-white/65" /></div><div className="h-2 w-4/5 rounded-full bg-white/20" /><div className="h-2 w-3/5 rounded-full bg-white/15" /><div className="flex gap-2 pt-1"><span className="rounded-full bg-cyan-200/15 px-2.5 py-1 text-[9px] font-semibold text-cyan-100">CASE UPDATE</span><span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] text-white/70">SHARED DOCUMENT</span></div></div>
            <div className="absolute bottom-[16%] left-[8%] grid size-11 place-items-center rounded-2xl border border-white/15 bg-indigo-300/15 text-indigo-100"><Sparkles className="size-5" /></div>
          </div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">Clear updates. Secure access.</p>
          <h1 className="mt-3 max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Stay close to the progress of your case.</h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-blue-100/80">A private place to review updates and documents your legal team has chosen to share with you.</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">{[['Private by design','Only information shared with your account'],['Updates in plain language','See the next steps and hearing dates'],['Secure sign-in','A one-time code verifies your access']].map(([title, copy]) => <li key={title} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[.06] p-3"><Check className="mt-0.5 size-4 shrink-0 text-emerald-300" /><span><strong className="block text-xs text-white">{title}</strong><span className="mt-0.5 block text-[10px] leading-4 text-blue-100/70">{copy}</span></span></li>)}</ul>
        </div>
        <p className="relative text-[10px] text-blue-100/55">CaseLens · A secure connection to your legal team</p>
      </section>

      <section className="flex items-center justify-center bg-gradient-to-br from-white via-slate-50 to-blue-50/70 p-5 sm:p-10 lg:p-14">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-2 rounded-lg text-xs font-semibold text-slate-600 transition hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"><ArrowLeft className="size-4" />Back to role selection</Link>
          <div className="mt-7 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_24px_70px_-40px_rgba(30,41,90,.3)] sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg shadow-blue-700/20">{step === 'request' ? <Mail className="size-5" /> : <KeyRound className="size-5" />}</span>
            <p className="mt-6 text-[10px] font-bold uppercase tracking-[.19em] text-blue-700">Guardian access</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{step === 'request' ? 'Welcome back' : 'Enter your code'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{step === 'request' ? 'Sign in with the email address or mobile number linked by your attorney.' : 'We sent a six-digit verification code to ' + identifier + '.'}</p>
            {error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-5 text-rose-900">{error}</div>}
            {statusMessage && <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-5 text-emerald-900">{statusMessage}</div>}

            <div className="guardian-progress" aria-label={step === 'request' ? 'Step 1 of 2: account' : 'Step 2 of 2: verification'}><div className="guardian-progress-step active"><span>{step === 'verify' ? <Check className="size-3.5" /> : '1'}</span>Account</div><div className="guardian-progress-line" /><div className={'guardian-progress-step ' + (step === 'verify' ? 'active' : '')}><span>2</span>Verify</div></div>

            {step === 'request' ? <form className="mt-6 space-y-5" onSubmit={handleRequestOtp}>
              <div><label htmlFor="guardian-identifier" className="mb-2 block text-xs font-semibold text-slate-800">Registered email or mobile number</label><AppInput id="guardian-identifier" name="identifier" type="text" autoComplete="username" inputMode="email" required value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="guardian@example.com or +91 98765 43210" className="guardian-input" /></div>
              <AppButton type="submit" disabled={loading || !identifier.trim()} className="w-full" icon={loading ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <ArrowRight className="size-4" />}>{loading ? 'Sending secure code…' : 'Send verification code'}</AppButton>
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5"><p className="text-[10px] font-bold uppercase tracking-wider text-blue-800">Demo access</p><p className="mt-1 break-all font-mono text-xs text-slate-800">guardian@demo.caselens.legal</p><p className="mt-1 text-[10px] leading-4 text-slate-600">Use the email or phone number your lawyer registered for you.</p></div>
            </form> : <form className="mt-6 space-y-5" onSubmit={handleVerifyOtp}>
              <div><div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="guardian-code" className="block text-xs font-semibold text-slate-800">6-digit verification code</label><button type="button" onClick={() => { setStep('request'); setError(null); setStatusMessage(null); }} className="rounded text-[11px] font-semibold text-blue-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600">Change account</button></div><AppInput id="guardian-code" name="one-time-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} minLength={6} pattern="[0-9]{6}" required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} placeholder="••••••" className="guardian-input text-center font-mono text-xl tracking-[.5em]" /><p className="mt-2 text-[11px] text-slate-500">The code expires after five minutes.</p></div>
              <AppButton type="submit" disabled={loading || code.length !== 6} className="w-full" icon={<ShieldCheck className="size-4" />}>{loading ? 'Verifying code…' : 'Verify and open portal'}</AppButton>
            </form>}
            <p className="mt-6 border-t border-slate-100 pt-4 text-center text-[10px] leading-5 text-slate-500">Need access? Contact your attorney to link your guardian account to a case.</p>
          </div>
          <p className="mt-5 text-center text-[10px] text-slate-500">By continuing, you confirm this account was shared with you by your legal team.</p>
        </div>
      </section>
    </div>
  </main>;
};
