import Link from 'next/link';
import { Bell, Settings, Menu, User } from 'lucide-react';

export type NavItem = {
    label: string;
    href: string;
    isActive?: boolean;
}

interface TopNavBarProps {
    links?: NavItem[];
    title?: string;
    userRole?: 'admin' | 'organizer' | 'runner';
}

export function TopNavBar({ links = [], title = "Pelikat Race", userRole = 'runner' }: TopNavBarProps) {
  return (
    <header className="bg-background fixed top-0 w-full border-b border-border z-50 flex justify-between items-center px-6 h-16 font-sans tracking-tight text-foreground">
      <div className="text-xl font-black tracking-tighter text-foreground">{title}</div>
      <nav className="hidden md:flex items-center gap-8 h-full">
        {links.map((link) => (
            <Link 
                key={link.href} 
                href={link.href} 
                className={`transition-colors duration-200 ease-in-out ${
                    link.isActive 
                        ? "text-primary border-b-2 border-primary pb-1 font-semibold" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground px-3 py-2 rounded-md"
                }`}
            >
                {link.label}
            </Link>
        ))}
      </nav>
      <div className="flex items-center gap-4">
        <button className="p-2 text-muted-foreground hover:bg-muted rounded transition-colors hidden md:block">
          <Bell className="w-5 h-5" />
        </button>
        {userRole !== 'runner' && (
            <button className="p-2 text-muted-foreground hover:bg-muted rounded transition-colors hidden md:block">
                <Settings className="w-5 h-5" />
            </button>
        )}
        <button className="p-2 text-muted-foreground hover:bg-muted rounded transition-colors md:hidden">
            <Menu className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full border border-border bg-muted flex items-center justify-center overflow-hidden">
          <User className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>
    </header>
  );
}
