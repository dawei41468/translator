import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LanguageSelectorGrid } from "@/components/LanguageSelectorGrid";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginAsGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Guest mode state
  const [isGuestDialogOpen, setIsGuestDialogOpen] = useState(false);
  const [guestName, setGuestName] = useState("");

  const from = location.state?.from?.pathname || "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message || t('auth.error.loginFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;

    try {
      await loginAsGuest(guestName);
      setIsGuestDialogOpen(false);
      navigate(from, { replace: true });
    } catch (err) {
      setError(t('auth.guestLoginFailed', 'Failed to join as guest'));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="mb-3 text-4xl font-bold tracking-tight">{t("app.name")}</h1>
            <p className="text-base text-muted-foreground">{t("app.description")}</p>
          </div>

          <div className="border rounded-xl bg-card text-card-foreground shadow-sm p-5">
            <h2 className="text-lg font-semibold mb-4">{t("auth.login")}</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="email" className="text-sm font-medium">
                  {t("auth.email")}
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("auth.email")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  data-testid="login-email"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="password" className="text-sm font-medium">
                  {t("auth.password")}
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t("auth.password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  data-testid="login-password"
                />
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full" size="lg" data-testid="login-submit">
                {isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
            </form>
            
            <div className="relative flex items-center justify-center my-6">
              <span className="bg-card px-2 text-xs text-muted-foreground uppercase">{t('common.or')}</span>
              <div className="absolute inset-0 flex items-center -z-10">
                <span className="w-full border-t"></span>
              </div>
            </div>

            <Button 
              type="button" 
              variant="outline" 
              className="w-full" 
              onClick={() => setIsGuestDialogOpen(true)}
            >
              {t('auth.continueAsGuest', 'Continue as Guest')}
            </Button>
          </div>

          <div className="text-center mt-6">
            <Button type="button" variant="link" onClick={() => navigate("/register")}
              className="px-0"
            >
              {t("auth.noAccount")}
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t">
            <LanguageSelectorGrid />
          </div>
        </div>
      </div>

      <Dialog open={isGuestDialogOpen} onOpenChange={setIsGuestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('auth.guestJoin', 'Join as Guest')}</DialogTitle>
            <DialogDescription>
              {t('auth.guestJoinDescription', 'Enter your name to join the conversation without an account.')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGuestSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="guest-name">{t('auth.displayName', 'Display Name')}</Label>
              <Input
                id="guest-name"
                placeholder={t('auth.displayNamePlaceholder', 'e.g. Alice')}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full" disabled={!guestName.trim()}>
                {t('auth.continueAsGuest', 'Continue as Guest')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
