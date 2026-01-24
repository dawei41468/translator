import { useState, useRef, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useJoinRoom } from "./hooks";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface UseQRScannerReturn {
  showScanner: boolean;
  setShowScanner: (show: boolean) => void;
  permissionStatus: 'checking' | 'granted' | 'denied' | 'prompt';
  isScanning: boolean;
  isJoining: boolean;
  scannerStatusRef: React.MutableRefObject<'idle' | 'starting' | 'running' | 'stopping'>;
  stopPromiseRef: React.MutableRefObject<Promise<void> | null>;
  isJoiningRef: React.MutableRefObject<boolean>;
  safeStopScanner: () => Promise<void>;
  initializeScanner: () => void;
  handleRequestPermission: () => Promise<void>;
  handleScanQR: () => void;
  closeScanner: () => void;
  setIsJoining: (joining: boolean) => void;
}

export const useQRScanner = (): UseQRScannerReturn => {
  const { t } = useTranslation();
  const [showScanner, setShowScanner] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'checking' | 'granted' | 'denied' | 'prompt'>('prompt');
  const [isScanning, setIsScanning] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerStatusRef = useRef<'idle' | 'starting' | 'running' | 'stopping'>('idle');
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const isJoiningRef = useRef(isJoining);

  const joinRoomMutation = useJoinRoom();

  useEffect(() => {
    isJoiningRef.current = isJoining;
  }, [isJoining]);

  const safeStopScanner = () => {
    const current = scannerRef.current;
    if (!current) {
      scannerStatusRef.current = 'idle';
      return Promise.resolve();
    }

    if (scannerStatusRef.current === 'idle') {
      return Promise.resolve();
    }

    if (scannerStatusRef.current === 'stopping') {
      return stopPromiseRef.current ?? Promise.resolve();
    }

    scannerStatusRef.current = 'stopping';

    const p = (async () => {
      try {
        await Promise.resolve(current.stop());
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('not running') && !msg.includes('already under transition')) {
          console.warn('Failed to stop QR scanner:', error);
        }
      }

      try {
        await Promise.resolve((current as any).clear?.());
      } catch {
        // ignore
      }

      if (scannerRef.current === current) {
        scannerRef.current = null;
      }
      scannerStatusRef.current = 'idle';
    })();

    stopPromiseRef.current = p;
    return p.finally(() => {
      if (stopPromiseRef.current === p) stopPromiseRef.current = null;
    });
  };

  const initializeScanner = () => {
    if (scannerRef.current) return;

    scannerRef.current = new Html5Qrcode("qr-reader");

    if (scannerStatusRef.current === 'starting' || scannerStatusRef.current === 'running') return;
    scannerStatusRef.current = 'starting';

    scannerRef.current.start(
      { facingMode: "environment" }, // Prefer back camera
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      (decodedText: string) => {
        // Prevent multiple join attempts
        if (isJoiningRef.current) {
          return;
        }

        const input = decodedText.trim();
        if (!input) {
          toast.error(t("error.invalidQR"));
          return;
        }

        let code = input;
        try {
          const url = new URL(input);
          const lastSegment = url.pathname.split("/").filter(Boolean).pop();
          if (lastSegment) {
            code = lastSegment;
          }
        } catch {
          // not a URL, use as-is
        }

        code = code.trim().toUpperCase();
        if (!code || code.length !== 6 || !/^[A-Z0-9]+$/.test(code)) {
          toast.error(t("error.invalidQR"));
          return;
        }

        setIsJoining(true);

        // Stop the scanner immediately to prevent multiple detections
        void safeStopScanner();

        joinRoomMutation.mutate(code, {
          onSuccess: () => {
            setShowScanner(false);
            setIsScanning(false);
            setIsJoining(false);
          },
          onError: (error) => {
            console.error('Failed to join room:', error);
            setShowScanner(false);
            setIsScanning(false);
            setIsJoining(false);
          }
        });
      },
      (error: any) => {
        // Ignore scan errors, only log serious issues
        if (!error?.includes && typeof error !== 'string') {
          console.log("QR scan error:", error);
        }
      }
    ).then(() => {
      // If the scanner was stopped/unmounted while start() was in-flight, ignore.
      if (!scannerRef.current) return;
      scannerStatusRef.current = 'running';
    }).catch((error: any) => {
      // If the scanner was stopped/unmounted while start() was in-flight, ignore.
      if (!scannerRef.current) return;
      console.error('Failed to start QR scanner:', error);
      setPermissionStatus('denied');
      setIsScanning(false);
      scannerStatusRef.current = 'idle';
    });
  };

  const handleRequestPermission = async () => {
    setPermissionStatus('checking');

    try {
      // First, try to get camera access to verify permissions work
      const testStream = await navigator.mediaDevices.getUserMedia({
        video: true
      });
      testStream.getTracks().forEach(track => track.stop()); // Stop test stream

      // If we get here, basic camera access works
      // Now try to initialize the QR scanner
      setPermissionStatus('granted');
      setIsScanning(true);

    } catch (error) {
      console.error('Camera permission error:', error);
      setPermissionStatus('denied');
    }
  };

  const handleScanQR = () => {
    setShowScanner(true);
    setPermissionStatus('prompt');
  };

  const closeScanner = () => {
    void safeStopScanner();
    setShowScanner(false);
    setIsScanning(false);
    setPermissionStatus('prompt');
    setIsJoining(false);
  };

  // Initialize QR scanner when permissions are granted
  useEffect(() => {
    return () => {
      void safeStopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showScanner) return;

    void safeStopScanner();
    setIsScanning(false);
    setPermissionStatus('prompt');
    setIsJoining(false);
  }, [showScanner]);

  useEffect(() => {
    if (!showScanner) return;
    if (permissionStatus !== 'granted' || !isScanning) return;
    if (scannerRef.current) return;

    initializeScanner();
  }, [showScanner, permissionStatus, isScanning]);

  return {
    showScanner,
    setShowScanner,
    permissionStatus,
    isScanning,
    isJoining,
    scannerStatusRef,
    stopPromiseRef,
    isJoiningRef,
    safeStopScanner,
    initializeScanner,
    handleRequestPermission,
    handleScanQR,
    closeScanner,
    setIsJoining,
  };
};