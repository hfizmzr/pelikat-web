import { ShieldAlert, Users, Database } from "lucide-react";

export default function AdminDashboard() {
  return (
    <div className="pt-8 pb-24 md:pb-8 px-4 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-destructive font-medium tracking-wide uppercase text-xs mb-1">SuperAdmin</p>
          <h1 className="text-3xl font-black tracking-tighter text-foreground">Platform Metrics</h1>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-4">
            <div className="flex justify-between items-center text-muted-foreground">
                 <span>Active Tenants</span>
                 <Users className="w-5 h-5" />
            </div>
            <p className="text-3xl font-bold text-foreground">14</p>
            <p className="text-xs text-primary">+2 this month</p>
        </div>
        
        <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-4">
            <div className="flex justify-between items-center text-muted-foreground">
                 <span>Storage Used</span>
                 <Database className="w-5 h-5" />
            </div>
            <p className="text-3xl font-bold text-foreground">64 GB</p>
            <p className="text-xs text-muted-foreground">75% capacity</p>
        </div>
        
        <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-4">
            <div className="flex justify-between items-center text-muted-foreground">
                 <span>Security Events</span>
                 <ShieldAlert className="w-5 h-5 text-destructive" />
            </div>
            <p className="text-3xl font-bold text-destructive">0</p>
            <p className="text-xs text-muted-foreground">No recent incidents</p>
        </div>
      </div>
    </div>
  );
}
