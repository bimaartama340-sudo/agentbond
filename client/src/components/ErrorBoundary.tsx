import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCcw, WalletCards, WifiOff, Wrench } from "lucide-react";
import { Component, ReactNode } from "react";

export type AppErrorCategory = "rpc" | "sdk" | "wallet" | "application";

export function classifyAppError(error: unknown): AppErrorCategory {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  if (
    /wallet|phantom|user rejected|user denied|4001|signature|signing|provider/.test(
      normalized
    )
  ) {
    return "wallet";
  }
  if (
    /rpc|network|fetch|timeout|429|blockhash|connection|gateway|503|502|504/.test(
      normalized
    )
  ) {
    return "rpc";
  }
  if (
    /meteora|sdk|anchor|publickey|transaction|damm|dlmm|bonding curve|bn\.js/.test(
      normalized
    )
  ) {
    return "sdk";
  }
  return "application";
}

const ERROR_COPY: Record<
  AppErrorCategory,
  { title: string; description: string; action: string }
> = {
  rpc: {
    title: "Solana RPC tidak tersedia",
    description:
      "Koneksi Devnet sedang gagal atau timeout. Periksa RPC dan coba ulangi tanpa mengirim transaksi baru.",
    action: "Coba lagi",
  },
  sdk: {
    title: "Meteora SDK mengalami error",
    description:
      "Account atau parameter Meteora tidak dapat diproses. Periksa konfigurasi DBC, DAMM v2, dan DLMM.",
    action: "Muat ulang aplikasi",
  },
  wallet: {
    title: "Aksi wallet dibatalkan",
    description:
      "Wallet menolak atau menghentikan proses signing. Tidak ada transaksi yang dianggap berhasil sebelum dikonfirmasi.",
    action: "Hubungkan ulang wallet",
  },
  application: {
    title: "Terjadi error aplikasi",
    description:
      "Aplikasi mengalami error yang tidak terduga. Muat ulang halaman untuk memulai sesi lokal yang bersih.",
    action: "Muat ulang aplikasi",
  },
};

interface Props {
  children: ReactNode;
  scope?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  category: AppErrorCategory;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, category: "application" };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      category: classifyAppError(error),
    };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    const category = classifyAppError(error);
    console.error(`[${category.toUpperCase()} ERROR]`, {
      scope: this.props.scope ?? "application",
      error,
      componentStack: info.componentStack,
    });
  }

  reset = () => {
    this.setState({ hasError: false, error: null, category: "application" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const copy = ERROR_COPY[this.state.category];
    const Icon =
      this.state.category === "rpc"
        ? WifiOff
        : this.state.category === "wallet"
          ? WalletCards
          : this.state.category === "sdk"
            ? Wrench
            : AlertTriangle;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="flex w-full max-w-2xl flex-col items-center rounded-xl border border-border bg-card p-8 text-center">
          <Icon size={44} className="mb-5 text-destructive" aria-hidden="true" />
          <span className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {this.props.scope ?? "Application"} / {this.state.category}
          </span>
          <h2 className="mb-3 text-xl font-semibold">{copy.title}</h2>
          <p className="mb-6 max-w-lg text-sm text-muted-foreground">
            {copy.description}
          </p>
          <details className="mb-6 w-full rounded bg-muted p-4 text-left">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Detail teknis
            </summary>
            <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {this.state.error?.stack ?? this.state.error?.message}
            </pre>
          </details>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={this.reset}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2",
                "border border-border text-foreground hover:bg-muted"
              )}
            >
              <RefreshCcw size={16} />
              Kembali ke aplikasi
            </button>
            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2",
                "bg-primary text-primary-foreground hover:opacity-90"
              )}
            >
              <RefreshCcw size={16} />
              {copy.action}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export function MeteoraErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary scope="Meteora integration">{children}</ErrorBoundary>;
}

export default ErrorBoundary;
