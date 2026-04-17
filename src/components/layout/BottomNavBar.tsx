import Link from 'next/link';
import { Mail, Activity, User, Grid } from 'lucide-react';

export function BottomNavBar() {
    return (
        <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-3 pb-safe bg-background border-t border-border font-sans text-[10px] uppercase font-bold text-muted-foreground">
            <Link href="/runner" className="flex flex-col items-center justify-center hover:text-foreground active:scale-90 transition-transform">
                <Grid className="w-6 h-6 mb-1" />
                <span>Home</span>
            </Link>
            <Link href="/runner/events/1/bib" className="flex flex-col items-center justify-center text-primary bg-muted rounded-xl p-2 active:scale-90 transition-transform">
                <Mail className="w-6 h-6 mb-1" />
                <span>My BIB</span>
            </Link>
            <Link href="/runner/run-log" className="flex flex-col items-center justify-center hover:text-foreground active:scale-90 transition-transform">
                <Activity className="w-6 h-6 mb-1" />
                <span>Tracker</span>
            </Link>
            <Link href="/runner/profile" className="flex flex-col items-center justify-center hover:text-foreground active:scale-90 transition-transform">
                <User className="w-6 h-6 mb-1" />
                <span>Profile</span>
            </Link>
        </nav>
    )
}
