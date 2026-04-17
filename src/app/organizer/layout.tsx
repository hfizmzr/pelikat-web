import { ReactNode } from "react";
import { TopNavBar } from "@/components/layout/TopNavBar";

export default function OrganizerLayout({ children }: { children: ReactNode }) {
    const links = [
        { label: "Dashboard", href: "/organizer", isActive: true },
        { label: "Events", href: "/organizer/events" },
        { label: "Analytics", href: "/organizer/analytics" },
    ];
    return (
        <div className="flex min-h-screen w-full flex-col bg-background">
            <TopNavBar links={links} userRole="organizer" title="Pelikat Organizer" />
            <main className="flex-1 pt-16">
                {children}
            </main>
        </div>
    );
}
