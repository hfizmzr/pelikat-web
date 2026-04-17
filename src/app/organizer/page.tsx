import { Users, BarChart3, Settings } from "lucide-react";

export default function OrganizerDashboard() {
  return (
    <div className="pt-8 pb-24 md:pb-8 px-4 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-tertiary font-medium tracking-wide uppercase text-xs mb-1">Event Control</p>
          <h1 className="text-3xl font-black tracking-tighter text-foreground">Organizer Management</h1>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border p-6 rounded-xl flex items-center gap-4">
            <div className="p-4 bg-primary/10 text-primary rounded-full">
                <Users className="w-8 h-8" />
            </div>
            <div>
                <p className="text-sm text-muted-foreground">Active Participants</p>
                <p className="text-2xl font-bold text-foreground">1,204</p>
            </div>
        </div>
        
        <div className="bg-card border border-border p-6 rounded-xl flex items-center gap-4">
            <div className="p-4 bg-tertiary/10 text-tertiary rounded-full">
                <BarChart3 className="w-8 h-8" />
            </div>
            <div>
                <p className="text-sm text-muted-foreground">Check-in Rate</p>
                <p className="text-2xl font-bold text-foreground">84%</p>
            </div>
        </div>
        
        <div className="bg-card border border-border p-6 rounded-xl flex items-center justify-between hover:border-primary transition-colors cursor-pointer">
            <div className="font-bold flex items-center gap-2">
                 <Settings /> Manage Settings
            </div>
        </div>
      </div>
    </div>
  );
}
