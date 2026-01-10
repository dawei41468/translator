import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DashboardQuickActionsFabProps {
  onCreate: () => void;
  onScan: () => void;
  onEnterCode: () => void;
  disabled?: boolean;
}

export function DashboardQuickActionsFab({
  onCreate,
  onScan,
  onEnterCode,
  disabled = false,
}: DashboardQuickActionsFabProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const handleEnterCode = () => {
    setOpen(false);
    window.setTimeout(() => {
      onEnterCode();
    }, 0);
  };

  const handleCreate = () => {
    setOpen(false);
    onCreate();
  };

  const handleScan = () => {
    setOpen(false);
    void Promise.resolve(onScan());
  };

  return (
    <>
      <Button
        type="button"
        size="icon"
        disabled={disabled}
        className="sm:hidden fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label={t("room.quickActions", "Quick actions")}
        data-testid="dashboard-fab"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("room.quickActions", "Quick actions")}</DialogTitle>
            <DialogDescription>
              {t("room.quickActionsDescription", "Start or join a conversation.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Button type="button" className="w-full" onClick={handleCreate}>
              {t("room.create", "Create room")}
            </Button>
            <Button type="button" className="w-full" variant="secondary" onClick={handleScan}>
              {t("room.scan", "Scan QR")}
            </Button>
            <Button type="button" className="w-full" variant="outline" onClick={handleEnterCode}>
              {t("room.enterCode", "Enter code")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
