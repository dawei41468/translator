import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useTranslation } from 'react-i18next';

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register(email, password, name);
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message || t('auth.error.registrationFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-4">{t('auth.register')}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-red-500 text-sm">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="name">{t('auth.name')}</label>
            <input
              id="name"
              type="text"
              placeholder={t('auth.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label htmlFor="email">{t('auth.email')}</label>
            <input
              id="email"
              type="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="w-full p-2 border rounded"
            />
          </div>

          <div>
            <label htmlFor="password">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              className="w-full p-2 border rounded"
            />
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full p-2 bg-blue-500 text-white rounded disabled:opacity-50">
            {isSubmitting ? t('auth.registering') : t('auth.register')}
          </button>
        </form>
        <div className="text-center mt-4">
          <button
            onClick={() => navigate('/login')}
            className="text-blue-500 hover:underline"
          >
            {t('auth.haveAccount')}
          </button>
        </div>
      </div>
    </div>
  );
}