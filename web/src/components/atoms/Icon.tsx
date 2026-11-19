import {
  AlertCircle,
  Archive,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Cpu,
  Download,
  GitFork,
  House,
  Languages,
  LoaderCircle,
  Palette,
  Puzzle,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Smartphone,
  Unplug,
  Upload,
} from "lucide-react";

const icons = {
  active: CircleCheck,
  loading: LoaderCircle,
  missing: Search,
  unknownProtocol: CircleHelp,
  failed: Unplug,
  status: GitFork,
  model: Smartphone,
  system: Settings,
  kernel: Cpu,
  home: House,
  rules: Puzzle,
  extensions: Shield,
  settings: Settings,
  notice: AlertCircle,
  palette: Palette,
  language: Languages,
  archive: Archive,
  chevron: ChevronRight,
  save: Upload,
  export: Download,
  restore: RotateCcw,
};
export type IconName = keyof typeof icons;

export function Icon({
  name,
  filled = false,
}: {
  name: IconName;
  filled?: boolean;
}) {
  if (name === "home" && filled) {
    return (
      <svg
        aria-hidden="true"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M3 10.2a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6a2 2 0 0 1 .7 1.5V20a1.5 1.5 0 0 1-1.5 1.5H15v-6a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v6H4.5A1.5 1.5 0 0 1 3 20Z" />
      </svg>
    );
  }
  const Glyph = icons[name];
  return (
    <Glyph
      aria-hidden="true"
      size={24}
      strokeWidth={2.2}
      fill={filled ? "currentColor" : "none"}
    />
  );
}
