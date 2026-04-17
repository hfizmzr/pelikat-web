import { ReactNode } from "react";
import { TopNavBar } from "@/components/layout/TopNavBar";

export default function AdminLayout({ children }: { children: ReactNode }) {
    const links = [
        { label: "Platform Metrics", href: "/admin", isActive: true },
        { label: "Tenants", href: "/admin/organizers" },
        { label: "Audit Logs", href: "/admin/logs" },
    ];
    return (
        <div className="flex min-h-screen w-full flex-col bg-background">
            <TopNavBar links={links} userRole="admin" title="Pelikat SuperAdmin" />
            <main className="flex-1 pt-16">
                {children}
            </main>
        </div>
    );
}
