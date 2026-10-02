import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Scale, Lock, Mail, User, Shield, AlertCircle, ArrowLeft, Eye, EyeOff, Check, BriefcaseBusiness, Sparkles, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../lib/auth.js';

export const LawyerLogin: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enrolmentId, setEnrolmentId] = useState('');
  const [showResetFlow, setShowResetFlow] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const [resetInfo, setResetInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { loginLawyer, registerLawyer, requestLawyerPasswordReset, confirmLawyerPasswordReset } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetInfo(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (password.length < 10) {
          throw new Error('Password must be at least 10 characters long.');
        }
        await registerLawyer(name, email, password, enrolmentId);
      } else {
        await loginLawyer(email, password);
      }
      navigate('/lawyer/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async () => {
    setError(null);
    setResetInfo(null);
    if (!email.trim()) {
      setError('Enter the email address you use for your counsel account.');
      return;
    }

    setLoading(true);
    try {
      const result = await requestLawyerPasswordReset(email.trim());
      setResetInfo(result.message || 'Check your email inbox for the reset code.');
      setResetRequested(true);
      if (result.devCode) {
        setResetInfo(`${result.message || 'Check your email inbox for the reset code.'} Dev code: ${result.devCode}`);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to request a password reset right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async () => {
    setError(null);
    setResetInfo(null);
    if (!email.trim() || !resetCode.trim() || !resetNewPassword.trim()) {
      setError('Enter your email, 6-digit verification code, and a new password.');
      return;
    }

    setLoading(true);
    try {
      const result = await confirmLawyerPasswordReset(email.trim(), resetCode.trim(), resetNewPassword.trim());
      setResetInfo(result.message || 'Password reset complete.');
      setResetRequested(false);
      setResetCode('');
      setResetNewPassword('');
      setShowResetFlow(false);
      setPassword(resetNewPassword.trim());
      setIsRegister(false);
    } catch (err: any) {
      setError(err.message || 'Reset failed. Please verify the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-shell app-shell-auth auth-gradient-counsel lawyer-auth min-h-screen text-slate-900">
      <div className="lawyer-auth-grid">
        <section className="lawyer-auth-hero">
          <Link to="/" className="lawyer-brand"><span className="lawyer-brand-mark"><Scale className="size-6" /></span><span><strong>CaseLens</strong><small>LEGAL INTELLIGENCE</small></span></Link>
          <div className="lawyer-hero-copy">
            <span className="lawyer-kicker"><Sparkles className="size-4" /> TRUSTED LEGAL WORKSPACE</span>
            <h1>AI-Powered<br /><span>Legal Intelligence</span></h1>
            <p>Manage evidence. Prepare hearings. Track legal matters. Powered by trustworthy AI.</p>
            <div className="lawyer-feature-stack">
              {[[<BriefcaseBusiness />, 'Evidence Intelligence', 'Bring every document and fact into focus.'], [<Sparkles />, 'AI Hearing Preparation', 'Move from case records to practical next steps.'], [<ShieldCheck />, 'Secure Client Collaboration', 'Share approved updates with confidence.']].map(([icon, title, copy], index) => <article className="lawyer-feature-card" key={String(title)} style={{ animationDelay: index * 100 + 'ms' }}><span>{icon}</span><div><strong>{title}</strong><small>{copy}</small></div><Check className="feature-check" /></article>)}
            </div>
          </div>
          <div className="lawyer-hero-foot"><ShieldCheck className="size-4" /> Private by design <span>·</span> Built for legal teams</div>
          <div className="lawyer-orb lawyer-orb-one" /><div className="lawyer-orb lawyer-orb-two" />
        </section>
        <section className="lawyer-auth-panel">
          <div className="lawyer-mobile-brand"><span className="lawyer-brand-mark"><Scale className="size-5" /></span><strong>CaseLens</strong></div>
          <div className="lawyer-auth-card">
            <Link to="/" className="auth-back-link"><ArrowLeft className="size-4" /> Back to role selection</Link>
            <div className="auth-heading"><span className="auth-heading-icon"><Scale className="size-6" /></span><p>COUNSEL WORKSPACE</p><h2>{showResetFlow ? 'Reset your password' : isRegister ? 'Create your account' : 'Welcome back'}</h2><span>{isRegister ? 'Set up your secure legal workspace.' : showResetFlow ? 'Verify your email to regain access.' : 'Sign in to continue to your case workspace.'}</span></div>
            {error && <div role="alert" className="auth-message auth-error"><AlertCircle className="size-4 shrink-0" />{error}</div>}
            {resetInfo && <div role="status" className="auth-message auth-success"><Shield className="size-4 shrink-0" />{resetInfo}</div>}
            {showResetFlow ? <div className="auth-fields">
              <label className="auth-field"><span>Counsel email</span><div><Mail /><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="lawyer@firm.legal" autoComplete="email" /></div></label>
              {!resetRequested ? <button type="button" onClick={handleResetRequest} disabled={loading} className="auth-submit">{loading ? 'Sending code…' : 'Send reset code'}</button> : <><label className="auth-field"><span>6-digit reset code</span><input type="text" inputMode="numeric" maxLength={6} value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" /></label><label className="auth-field"><span>New password</span><input type="password" value={resetNewPassword} onChange={e => setResetNewPassword(e.target.value)} placeholder="At least 10 characters" /></label><button type="button" onClick={handleResetConfirm} disabled={loading} className="auth-submit">{loading ? 'Resetting…' : 'Reset password'}</button></>}
              <button type="button" className="auth-text-button" onClick={() => {setShowResetFlow(false);setResetRequested(false);setResetCode('');setResetNewPassword('');setResetInfo(null);setError(null);}}>Back to sign in</button>
            </div> : <form className="auth-fields" onSubmit={handleSubmit}>
              {isRegister && <><label className="auth-field"><span>Advocate full name</span><div><User /><input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Advocate A. Sharma" autoComplete="name" /></div></label><label className="auth-field"><span>Bar / enrolment ID <em>(optional)</em></span><input type="text" value={enrolmentId} onChange={e => setEnrolmentId(e.target.value)} placeholder="e.g. D/1042/2019" /></label></>}
              <label className="auth-field"><span>Email address</span><div><Mail /><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourfirm.com" autoComplete="email" /></div></label>
              <label className="auth-field"><span>Password {isRegister && <em>(minimum 10 characters)</em>}</span><div><Lock /><input type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder="Enter your password" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
              {!isRegister && <div className="auth-options"><label><input type="checkbox" /> <span>Remember me</span></label><button type="button" onClick={() => {setIsRegister(false);setShowResetFlow(true);setError(null);setResetInfo(null);}}>Forgot password?</button></div>}
              <button type="submit" disabled={loading} className="auth-submit">{loading ? 'Authenticating…' : isRegister ? 'Create account' : 'Sign in to workspace'}<ArrowLeft className="size-4 rotate-180" /></button>
            </form>}
            {!showResetFlow && <div className="auth-switch">{isRegister ? 'Already have an account?' : 'New to CaseLens?'} <button type="button" onClick={() => {setIsRegister(!isRegister);setError(null);setResetInfo(null);setShowResetFlow(false);}}>{isRegister ? 'Sign in' : 'Create an account'}</button></div>}
            <div className="auth-security"><ShieldCheck className="size-4" /><span>256-bit encrypted connection · Your case data stays private</span></div>
            <details className="auth-demo"><summary>Demo account details</summary><p>lawyer@demo.caselens.legal / demoLawyer1234!</p></details>
          </div>
          <p className="auth-panel-foot">© CaseLens · Legal intelligence for modern practice</p>
        </section>
      </div>
    </main>
  );};
