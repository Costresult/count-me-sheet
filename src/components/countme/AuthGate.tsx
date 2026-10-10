import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuthState = "loading" | "out" | "in";

/** Shows the app only for a signed-in user so inventories and learning follow the person, not the browser. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setState(data.session ? "in" : "out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? "in" : "out");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state === "loading") {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Yükleniyor…</div>;
  }
  if (state === "out") return <LoginForm />;
  return <>{children}</>;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setMessage(
        /invalid login/i.test(error.message)
          ? "E-posta veya şifre hatalı."
          : /already registered/i.test(error.message)
            ? "Bu e-posta zaten kayıtlı. Giriş yapın."
            : error.message,
      );
      return;
    }
    if (mode === "signup" && !data.session) {
      setMessage("Kayıt alındı. E-postanıza gelen onay bağlantısına tıklayıp giriş yapın.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Count Me</h1>
          <p className="text-sm text-muted-foreground">
            Envanterleriniz ve öğrenilen ürün adları hesabınıza bağlı kalır; her cihazdan ulaşırsınız.
          </p>
        </div>
        <Input
          type="email"
          autoComplete="email"
          placeholder="E-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="Şifre (en az 6 karakter)"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {message && <p className="text-sm text-destructive">{message}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Bekleyin…" : mode === "signin" ? "Giriş yap" : "Kayıt ol"}
        </Button>
        <button
          type="button"
          className="w-full text-center text-sm text-muted-foreground underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage(null);
          }}
        >
          {mode === "signin" ? "Hesabım yok, kayıt ol" : "Hesabım var, giriş yap"}
        </button>
      </form>
    </div>
  );
}
