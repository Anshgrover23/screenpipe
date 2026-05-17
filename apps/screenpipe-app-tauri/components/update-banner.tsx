"use client";

import { Button } from "@/components/ui/button";
import { Download, X, RefreshCw, Sparkles } from "lucide-react";
import { create } from "zustand";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { platform, arch } from "@tauri-apps/plugin-os";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useIsEnterpriseBuild } from "@/lib/hooks/use-is-enterprise-build";
import ReactMarkdown from "react-markdown";

interface UpdateInfo {
  version: string;
  body: string;
}

interface DownloadProgress {
  version: string;
  downloaded: number;
  total: number | null;
  percent: number;
}

interface AuthRequiredInfo {
  version: string;
  message: string;
}

interface UpdateBannerState {
  isVisible: boolean;
  updateInfo: UpdateInfo | null;
  isInstalling: boolean;
  isDownloading: boolean;
  downloadProgress: DownloadProgress | null;
  pendingUpdate: Update | null;
  authRequired: AuthRequiredInfo | null;
  isRestarting: boolean;
  restartCountdown: number | null;
  restartVersion: string | null;
  confirmingRestart: boolean;
  setIsVisible: (visible: boolean) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setIsInstalling: (installing: boolean) => void;
  setIsDownloading: (downloading: boolean) => void;
  setDownloadProgress: (progress: DownloadProgress | null) => void;
  setPendingUpdate: (update: Update | null) => void;
  setAuthRequired: (info: AuthRequiredInfo | null) => void;
  setIsRestarting: (restarting: boolean) => void;
  setRestartCountdown: (countdown: number | null) => void;
  setRestartVersion: (version: string | null) => void;
  setConfirmingRestart: (confirming: boolean) => void;
}

export const useUpdateBanner = create<UpdateBannerState>((set) => ({
  isVisible: false,
  updateInfo: null,
  isInstalling: false,
  isDownloading: false,
  downloadProgress: null,
  pendingUpdate: null,
  authRequired: null,
  isRestarting: false,
  restartCountdown: null,
  restartVersion: null,
  confirmingRestart: false,
  setIsVisible: (visible) => set({ isVisible: visible }),
  setUpdateInfo: (info) => set({ updateInfo: info }),
  setIsInstalling: (installing) => set({ isInstalling: installing }),
  setIsDownloading: (downloading) => set({ isDownloading: downloading }),
  setDownloadProgress: (progress) => set({ downloadProgress: progress }),
  setPendingUpdate: (update) => set({ pendingUpdate: update }),
  setAuthRequired: (info) => set({ authRequired: info }),
  setIsRestarting: (restarting) => set({ isRestarting: restarting }),
  setRestartCountdown: (countdown) => set({ restartCountdown: countdown }),
  setRestartVersion: (version) => set({ restartVersion: version }),
  setConfirmingRestart: (confirming) => set({ confirmingRestart: confirming }),
}));

interface UpdateBannerProps {
  className?: string;
  compact?: boolean;
}

const REMIND_ME_LATER_KEY = "screenpipe-remind-me-later";

export function UpdateBanner({ className, compact = false }: UpdateBannerProps) {
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [remindMeLaterTime, setRemindMeLaterTime] = useState<number | null>(null);
  const isEnterprise = useIsEnterpriseBuild();
  const {
    isVisible, updateInfo, isInstalling, isDownloading, downloadProgress,
    setIsVisible, setIsInstalling, pendingUpdate, authRequired, setAuthRequired,
    isRestarting, restartCountdown, restartVersion, confirmingRestart,
    setIsRestarting, setRestartCountdown, setConfirmingRestart
  } = useUpdateBanner();
  const { toast } = useToast();

  if (isEnterprise) return null;

  // Load "Remind Me Later" state from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(REMIND_ME_LATER_KEY);
    if (stored) {
      const remindTime = parseInt(stored, 10);
      setRemindMeLaterTime(remindTime);
      // If it's been more than 24 hours, reset the reminder
      if (Date.now() - remindTime > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(REMIND_ME_LATER_KEY);
        setRemindMeLaterTime(null);
      }
    }
  }, []);

  // Check if we should show based on "Remind Me Later"
  const shouldShow = isVisible && updateInfo && (!remindMeLaterTime || Date.now() - remindMeLaterTime > 24 * 60 * 60 * 1000);

  const handleRemindMeLater = () => {
    const now = Date.now();
    localStorage.setItem(REMIND_ME_LATER_KEY, now.toString());
    setRemindMeLaterTime(now);
    setIsVisible(false);
  };

  // Countdown timer effect
  useEffect(() => {
    if (!isRestarting || restartCountdown === null) return;
    if (restartCountdown <= 0) return;
    const timer = setTimeout(() => setRestartCountdown(restartCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [isRestarting, restartCountdown, setRestartCountdown]);

  const handlePostpone = async () => {
    try {
      await invoke("cancel_auto_restart");
      setIsRestarting(false);
      setRestartCountdown(null);
    } catch (error) {
      console.error("failed to cancel auto-restart:", error);
      toast({
        title: "error",
        description: "failed to postpone update",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    setIsInstalling(true);
    const os = platform();

    try {
      // On Windows, the update is not pre-downloaded by the backend (unlike macOS/Linux)
      // We need to check for update, download, and install it before relaunching
      if (os === "windows") {
        toast({
          title: "downloading update...",
          description: "please wait while the update is downloaded",
          duration: Infinity,
        });

        // Stop screenpipe before update on Windows
        try {
          await invoke("stop_screenpipe");
        } catch (e) {
          console.warn("failed to stop screenpipe:", e);
        }

        // Get or check for the update
        let update = pendingUpdate;
        if (!update) {
          const cpuArch = arch();
          update = await check({ endpoints: [
            `https://screenpi.pe/api/app-update/stable/windows-${cpuArch}/{{current_version}}`,
          ] } as any);
        }

        if (update?.available) {


          await update.downloadAndInstall();

          toast({
            title: "update complete",
            description: "relaunching application",
            duration: 3000,
          });
        }
      } else {
        // On macOS/Linux, the update was already downloaded by the backend
        toast({
          title: "installing update...",
          description: "screenpipe will restart automatically",
          duration: 10000,
        });
      }

      await relaunch();
    } catch (error) {
      console.error("failed to update:", error);
      setIsInstalling(false);
      toast({
        title: "update failed",
        description: "please try again or download manually",
        variant: "destructive",
      });
    }
  };

  // Show countdown banner when auto-restart is imminent (highest priority)
  if (isRestarting && restartCountdown !== null) {
    if (compact) {
      return (
        <div className={cn("flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400", className)}>
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>restarting in <span className="font-semibold tabular-nums">{restartCountdown}s</span></span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-xs"
            onClick={handlePostpone}
          >
            postpone
          </Button>
        </div>
      );
    }
    return (
      <div className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-sm",
        className
      )}>
        <div className="flex items-center gap-2 flex-1">
          <RefreshCw className="h-4 w-4 text-amber-600 dark:text-amber-500 animate-spin" />
          <span>
            screenpipe restarts in <span className="font-semibold tabular-nums">{restartCountdown}s</span>
            {restartVersion && <> to install <span className="font-medium">v{restartVersion}</span></>}
            {" — "}active recordings will be interrupted
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={handleUpdate}
            disabled={isInstalling}
          >
            {isInstalling ? "restarting..." : "restart now"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={handlePostpone}
          >
            postpone
          </Button>
        </div>
      </div>
    );
  }

  // Show auth-required state — user needs to sign in to download updates
  if (authRequired) {
    if (compact) {
      return (
        <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
          <Sparkles className="h-3 w-3 text-primary" />
          <span>v{authRequired.version} available</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-xs"
            onClick={() => window.location.href = "/home"}
          >
            sign in to update
          </Button>
        </div>
      );
    }
    return (
      <div className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 bg-muted/50 border-b text-sm",
        className
      )}>
        <div className="flex items-center gap-2 flex-1">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>
            screenpipe <span className="font-medium">v{authRequired.version}</span> is available — sign in to download
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => window.location.href = "/home"}
          >
            sign in
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setAuthRequired(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Show downloading state even before updateInfo is set
  if (isDownloading && !updateInfo) {
    const pct = downloadProgress?.percent ?? 0;
    if (compact) {
      return (
        <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
          <Sparkles className="h-3 w-3 text-primary animate-pulse" />
          <span>downloading update... {pct}%</span>
        </div>
      );
    }
    return (
      <div className={cn("flex items-center gap-3 px-3 py-2 bg-muted/50 border-b text-sm", className)}>
        <Sparkles className="h-4 w-4 text-primary animate-pulse" />
        <div className="flex items-center gap-2 flex-1">
          <span>downloading update{downloadProgress?.version ? ` v${downloadProgress.version}` : ""}...</span>
          <div className="flex-1 max-w-[200px] h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{pct}%</span>
        </div>
      </div>
    );
  }

  if (!isVisible || !updateInfo) return null;

  // Show confirmation step for manual restart (Codex-style)
  if (confirmingRestart) {
    if (compact) {
      return (
        <div className={cn("flex items-center gap-2 text-xs", className)}>
          <span>screenpipe will restart to apply v{updateInfo.version}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-xs"
            onClick={() => setConfirmingRestart(false)}
          >
            cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-5 px-2 text-xs"
            onClick={handleUpdate}
            disabled={isInstalling}
          >
            {isInstalling ? "restarting..." : "restart now"}
          </Button>
        </div>
      );
    }
    return (
      <div className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800 text-sm",
        className
      )}>
        <span>
          screenpipe will quit to install <span className="font-medium">v{updateInfo.version}</span>,
          interrupting active recordings
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setConfirmingRestart(false)}
          >
            cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={handleUpdate}
            disabled={isInstalling}
          >
            {isInstalling ? "restarting..." : "restart now"}
          </Button>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        className
      )}>
        <Download className="h-3 w-3 text-primary" />
        {isDownloading ? (
          <>
            <span>downloading v{updateInfo.version}... {downloadProgress?.percent ?? 0}%</span>
          </>
        ) : (
          <>
            <span>v{updateInfo.version} ready</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-2 text-xs"
              onClick={() => setConfirmingRestart(true)}
              disabled={isInstalling}
            >
              {isInstalling ? "restarting..." : "restart to update"}
            </Button>
          </>
        )}
      </div>
    );
  }

  // Show the Jan-style modal card at bottom-right when update is available
  if (shouldShow) {
    return (
      <div className={cn(
        "fixed bottom-4 right-4 z-50 bg-background border rounded-lg shadow-xl max-w-sm",
        className
      )}>
        <div className="p-4">
          {/* Header with version and icon */}
          <div className="flex items-start gap-3 mb-3">
            <Download className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <div className="text-base font-semibold">
                New Version {updateInfo.version}
              </div>
              <div className="text-sm text-muted-foreground">
                Update Available
              </div>
            </div>
          </div>

          {/* Release notes section */}
          {showReleaseNotes && updateInfo.body && (
            <div className="mb-4 p-3 bg-muted/30 rounded max-h-80 overflow-y-auto">
              <div className="text-xs text-foreground prose prose-sm dark:prose-invert">
                <ReactMarkdown
                  components={{
                    a: ({ ...props }) => (
                      <a
                        {...props}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      />
                    ),
                    h2: ({ ...props }) => (
                      <h2 {...props} className="text-sm font-semibold mt-2 mb-1" />
                    ),
                    h3: ({ ...props }) => (
                      <h3 {...props} className="text-xs font-semibold mt-1.5 mb-0.5" />
                    ),
                    ul: ({ ...props }) => (
                      <ul {...props} className="list-disc list-inside space-y-1 text-xs" />
                    ),
                    li: ({ ...props }) => (
                      <li {...props} className="text-xs" />
                    ),
                    p: ({ ...props }) => (
                      <p {...props} className="text-xs mb-1" />
                    ),
                  }}
                >
                  {updateInfo.body}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReleaseNotes(!showReleaseNotes)}
              className="text-xs h-8"
            >
              {showReleaseNotes ? "Hide Release Notes" : "Show Release Notes"}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemindMeLater}
                className="text-xs h-8"
              >
                Remind Me Later
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setConfirmingRestart(true)}
                disabled={isInstalling}
                className="text-xs h-8"
              >
                {isInstalling ? "updating..." : "Update Now"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback for other states - keep as banner
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 px-3 py-2 bg-muted/50 border-b text-sm",
      className
    )}>
      <div className="flex items-center gap-2 flex-1">
        <Download className="h-4 w-4 text-primary" />
        {isDownloading ? (
          <div className="flex items-center gap-2 flex-1">
            <span>downloading <span className="font-medium">v{updateInfo.version}</span></span>
            <div className="flex-1 max-w-[200px] h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress?.percent ?? 0}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{downloadProgress?.percent ?? 0}%</span>
          </div>
        ) : (
          <span>
            screenpipe <span className="font-medium">v{updateInfo.version}</span> is ready
          </span>
        )}
      </div>
      {!isDownloading && (
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setConfirmingRestart(true)}
            disabled={isInstalling}
          >
            {isInstalling ? "restarting..." : "restart to update"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setIsVisible(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Hook to listen for update events from Rust
export function useUpdateListener() {
  const {
    setIsVisible, setUpdateInfo, setIsDownloading, setDownloadProgress, setAuthRequired,
    setIsRestarting, setRestartCountdown, setRestartVersion
  } = useUpdateBanner();

  useEffect(() => {
    let unlistenAvailable: (() => void) | undefined;
    let unlistenClick: (() => void) | undefined;
    let unlistenDownloading: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;
    let unlistenAuth: (() => void) | undefined;
    let unlistenRestarting: (() => void) | undefined;

    const setupListeners = async () => {
      // Listen for download starting (shows banner immediately)
      unlistenDownloading = await listen<{ version: string; body: string }>("update-downloading", (event) => {
        setIsDownloading(true);
        setDownloadProgress({ version: event.payload.version, downloaded: 0, total: null, percent: 0 });
        setIsVisible(true);
      });

      // Listen for download progress
      unlistenProgress = await listen<DownloadProgress>("update-download-progress", (event) => {
        setDownloadProgress(event.payload);
      });

      // Listen for update ready (download complete)
      unlistenAvailable = await listen<UpdateInfo>("update-available", (event) => {
        setIsDownloading(false);
        setDownloadProgress(null);
        setUpdateInfo(event.payload);
        setIsVisible(true);
      });

      // Listen for tray menu click
      unlistenClick = await listen("update-now-clicked", () => {
        setIsVisible(true);
      });

      // Listen for auth-required (user needs to sign in to download update)
      unlistenAuth = await listen<AuthRequiredInfo>("update-auth-required", (event) => {
        setAuthRequired(event.payload);
        setIsDownloading(false);
        setDownloadProgress(null);
      });

      // Listen for auto-restart countdown (30 seconds before app restarts)
      unlistenRestarting = await listen<{ version: string; delay_secs: number }>("update-restarting", (event) => {
        setIsRestarting(true);
        setRestartCountdown(event.payload.delay_secs);
        setRestartVersion(event.payload.version);
        setIsVisible(true);
      });
    };

    setupListeners();

    return () => {
      unlistenAvailable?.();
      unlistenClick?.();
      unlistenDownloading?.();
      unlistenProgress?.();
      unlistenAuth?.();
      unlistenRestarting?.();
    };
  }, [setIsVisible, setUpdateInfo, setIsDownloading, setDownloadProgress, setAuthRequired]);
}
