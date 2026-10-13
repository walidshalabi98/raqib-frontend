import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { loadPasswordDialog } from "@/lib/passwordHandover";

/** A temporary password to hand over, after an invitation or an admin's password reset. */
export interface PasswordHandoverView {
  reason: "invite" | "reset";
  name: string;
  email: string;
  password: string;
  /** True when email is on but this email failed, so the admin hands the password over instead. */
  emailFailed?: boolean;
}

export interface PasswordHandoverApi {
  /**
   * Shows `view` in the one-time password dialog. `returnFocus` puts the focus back where the flow started
   * when the dialog closes; it returns false when that element is gone (the admin left the screen).
   */
  offer: (view: PasswordHandoverView, returnFocus?: () => boolean) => void;
}

const HandoverContext = createContext<PasswordHandoverApi | null>(null);

const HandoverDialog = lazy(() => loadPasswordDialog().then((module) => ({ default: module.TemporaryPasswordDialogHost })));

/**
 * Holds a temporary password from the moment the API returns it until the admin closes the one-time dialog,
 * above the routes, so it is shown even if the admin left Settings while the request ran (browser Back, a
 * swipe): the password is never lost with nobody having seen it. While a password is shown, closing or
 * reloading the tab asks for confirmation (beforeunload). Signing out drops it. The password lives only in
 * this state: it is not logged, cached or stored. The dialog's code (and the translations) load on first use,
 * so the main bundle stays small.
 */
export function PasswordHandoverProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<PasswordHandoverView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const returnFocus = useRef<(() => boolean) | undefined>(undefined);
  const auth = useOptionalAuth();
  const signedIn = Boolean(auth?.user);

  useEffect(() => {
    if (!signedIn) setCurrent(null);
  }, [signedIn]);

  useEffect(() => {
    if (!current) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers show the prompt only when returnValue is set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [current]);

  const offer = useCallback((view: PasswordHandoverView, focusBack?: () => boolean) => {
    returnFocus.current = focusBack;
    setLoaded(true);
    setCurrent(view);
  }, []);
  const value = useMemo(() => ({ offer }), [offer]);
  const close = useCallback(() => setCurrent(null), []);
  const focusBack = useCallback(() => returnFocus.current?.() ?? false, []);

  return (
    <HandoverContext.Provider value={value}>
      {children}
      {loaded && (
        <Suspense fallback={null}>
          <HandoverDialog handover={current} onClose={close} returnFocus={focusBack} />
        </Suspense>
      )}
    </HandoverContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export function usePasswordHandover(): PasswordHandoverApi {
  const handover = useContext(HandoverContext);
  if (!handover) throw new Error("usePasswordHandover must be used within PasswordHandoverProvider");
  return handover;
}
