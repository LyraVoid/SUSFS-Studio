import {
  AlertCircle,
  Archive,
  Check,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Cpu,
  Database,
  Download,
  Folder,
  GitFork,
  House,
  Languages,
  ListPlus,
  LoaderCircle,
  MemoryStick,
  Palette,
  Plus,
  Puzzle,
  RotateCcw,
  Route,
  Search,
  Settings,
  Shield,
  Smartphone,
  Unplug,
  Upload,
  X,
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
  add: Plus,
  batch: ListPlus,
  paths: Folder,
  maps: MemoryStick,
  kstats: Database,
  redirects: Route,
  check: Check,
  close: X,
};
export type IconName = keyof typeof icons;

export function Icon({
  name,
  filled = false,
}: {
  name: IconName;
  filled?: boolean;
}) {
  if (name === "active" && filled) {
    return (
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.7 7.7a1 1 0 0 0-1.4-1.4L11 12.6l-2.3-2.3a1 1 0 1 0-1.4 1.4l3 3a1 1 0 0 0 1.4 0l5-5Z"
        />
      </svg>
    );
  }
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
