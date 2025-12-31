import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="h-9 w-9 rounded-lg"
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="h-4 w-4 text-muted-foreground transition-colors hover:text-foreground" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4 text-muted-foreground transition-colors hover:text-foreground" aria-hidden="true" />
      )}
      <span className="sr-only">{resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}</span>
    </Button>
  );
}
