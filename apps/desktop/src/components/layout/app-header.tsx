import { Button } from "@sandcastle/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sandcastle/ui/components/dropdown-menu";
import { useTheme } from "@sandcastle/ui/context/theme-context";
import {
  IconSun,
  IconMoon,
  IconDeviceDesktop,
  IconPalette,
} from "@tabler/icons-react";

export function AppHeader() {
  const { theme, setTheme } = useTheme();

  return (
    <header
      data-tauri-drag-region
      className="fixed top-0 right-0 left-0 z-50 flex h-7 items-center justify-end px-2"
    >
      <ThemeSwitcher theme={theme} setTheme={setTheme} />
    </header>
  );
}

function ThemeSwitcher({
  theme,
  setTheme,
}: {
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" />}>
        <IconPalette className="size-3.5" />
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as typeof theme)}
        >
          <DropdownMenuRadioItem value="light">
            <IconSun className="text-muted-foreground" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <IconMoon className="text-muted-foreground" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <IconDeviceDesktop className="text-muted-foreground" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
