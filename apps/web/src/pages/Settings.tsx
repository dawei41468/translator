import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useChangePassword } from "@/lib/hooks";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { isApiError } from "@/lib/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const changePassword = useChangePassword();

  const { data: emailPrefs } = useQuery({
    queryKey: ['email-prefs'],
    queryFn: () => apiClient.getEmailPreferences(),
  });

  const updatePrefs = useMutation({
    mutationFn: (data: { enableConflictEmails?: boolean; enableCommentEmails?: boolean; enableQuoteExpiringEmails?: boolean }) => apiClient.updateEmailPreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-prefs'] });
      toast({ title: t('settings.emailNotifications.toasts.updated') });
    },
    onError: (err: unknown) => {
      const message = isApiError(err) ? err.message : t('settings.emailNotifications.errors.failedUpdatePreferences');
      toast({ title: t('common.error'), description: message, variant: "destructive" });
    },
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  if (!user) return null;

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirmPassword.length >= 8 &&
    newPassword === confirmPassword;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.changePassword.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 max-w-lg"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!canSubmit) return;

              try {
                await changePassword.mutateAsync({ currentPassword, newPassword });
                toast({ title: t('settings.changePassword.toasts.updated') });
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
              } catch (err: unknown) {
                const message = isApiError(err) ? err.message : err instanceof Error ? err.message : "Unknown error";
                toast({
                  title: t('settings.changePassword.toasts.failed'),
                  description: message,
                  variant: "destructive",
                });
              }
            }}
          >
            <div className="grid gap-2">
              <label className="text-sm font-medium">{t('settings.changePassword.fields.currentPassword.label')}</label>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">{t('settings.changePassword.fields.newPassword.label')}</label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('settings.changePassword.fields.newPassword.placeholder')}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">{t('settings.changePassword.fields.confirmPassword.label')}</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-describedby={confirmPassword.length > 0 && newPassword !== confirmPassword ? "confirm-password-error" : undefined}
              />
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <p id="confirm-password-error" className="text-sm text-destructive">{t('settings.changePassword.errors.passwordsDoNotMatch')}</p>
              )}
            </div>

            <div>
              <Button type="submit" disabled={!canSubmit || changePassword.isPending}>
                {changePassword.isPending ? t('common.updating') : t('settings.changePassword.actions.updatePassword')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.language.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
            <Select
              value={i18n.language}
              onValueChange={async (value) => {
                try {
                  await apiClient.updateLanguage(value);
                  i18n.changeLanguage(value);
                  toast({ title: t('settings.language.toasts.updated') });
                } catch (error) {
                  toast({ title: t('settings.language.toasts.failed'), variant: "destructive" });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('settings.language.select.placeholder')} />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="en">{t('settings.language.select.options.en')}</SelectItem>
                <SelectItem value="zh">{t('settings.language.select.options.zh')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.emailNotifications.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="conflict-emails"
              checked={emailPrefs?.enableConflictEmails ?? true}
              onCheckedChange={(checked) => updatePrefs.mutate({ enableConflictEmails: checked as boolean })}
            />
            <Label htmlFor="conflict-emails">{t('settings.emailNotifications.options.conflictAlerts')}</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="comment-emails"
              checked={emailPrefs?.enableCommentEmails ?? true}
              onCheckedChange={(checked) => updatePrefs.mutate({ enableCommentEmails: checked as boolean })}
            />
            <Label htmlFor="comment-emails">{t('settings.emailNotifications.options.newComments')}</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="quote-expiring-emails"
              checked={emailPrefs?.enableQuoteExpiringEmails ?? true}
              onCheckedChange={(checked) => updatePrefs.mutate({ enableQuoteExpiringEmails: checked as boolean })}
            />
            <Label htmlFor="quote-expiring-emails">{t('settings.emailNotifications.options.quoteExpiring', 'Quote Expiration Reminders')}</Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
