import { ReactNode } from "react";
import { TopNavBar } from "@/components/layout/TopNavBar";
import { BottomNavBar } from "@/components/layout/BottomNavBar";

export default function RunnerLayout({ children }: { children: ReactNode }) {
    const links = [
        { label: "Dashboard", href: "/runner", isActive: true },
        { label: "Events", href: "/runner/events" },
        { label: "BIBs", href: "/runner/bib" },
    ];
    return (
        <div className="flex min-h-screen w-full flex-col bg-background">
            <TopNavBar links={links} userRole="runner" />
            <main className="flex-1 pt-16 pb-16 md:pb-0">
                {children}
            </main>
            <BottomNavBar />
        </div>
    );
}
