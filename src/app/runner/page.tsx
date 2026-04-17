import { ArrowRight, Calendar, MapPin, Activity, CheckCircle2 } from "lucide-react";
import Link from 'next/link';

export default function RunnerDashboard() {
  return (
    <div className="pt-8 pb-24 md:pb-8 px-4 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6">
      {/* Header Section */}
      <div className="md:col-span-12 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-primary font-medium tracking-wide uppercase text-xs mb-1">Runner Central</p>
          <h1 className="text-3xl font-black tracking-tighter text-foreground">Digital BIB & Dashboard</h1>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-all active:scale-[0.98] text-sm text-foreground">
            Download BIB PDF
          </button>
        </div>
      </div>

      {/* Digital BIB Card (Prominent) */}
      <div className="md:col-span-8 bg-card border border-border rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-primary p-6 flex justify-between items-start">
          <div className="text-primary-foreground">
            <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">Official Race Entry</p>
            <h2 className="text-4xl font-black italic tracking-tighter">BIB #4829</h2>
          </div>
          <div className="bg-primary-foreground/10 backdrop-blur-md border border-primary-foreground/20 px-3 py-1 rounded-full text-[10px] font-bold text-primary-foreground uppercase tracking-tighter">
            Verified Runner
          </div>
        </div>
        <div className="p-8 flex flex-col md:flex-row gap-8 items-center md:items-start">
          <div className="flex-1 space-y-6 w-full">
            <div>
              <p className="text-muted-foreground text-xs uppercase font-bold tracking-widest mb-1">Participant Name</p>
              <p className="text-2xl font-bold text-foreground">Alex "Thunder" Rivera</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground text-xs uppercase font-bold tracking-widest mb-1">Category</p>
                <p className="text-lg font-semibold text-foreground">10KM Open</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase font-bold tracking-widest mb-1">Status</p>
                <div className="flex items-center gap-2 text-tertiary">
                  <CheckCircle2 className="w-5 h-5 text-tertiary" />
                  <p className="text-lg font-semibold">Checked In</p>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-border flex flex-wrap gap-3">
              <Link href="/runner/events/1/bib" className="flex-1 min-w-[200px] flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3 px-6 rounded-lg active:scale-95 transition-transform hover:opacity-90">
                View Digital QR Code
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Next Race Mini Card */}
      <div className="md:col-span-4 bg-card border border-border rounded-xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Calendar className="text-primary w-5 h-5" />
            Next Race
          </h3>
          <span className="text-[10px] font-bold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded uppercase">Confirmed</span>
        </div>
        <div className="relative h-32 rounded-lg overflow-hidden group bg-muted">
           <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-60"></div>
           <div className="absolute bottom-3 left-3">
             <p className="text-sm font-black tracking-tight text-white">Obsidian Midnight 15K</p>
             <p className="text-[10px] text-primary">Oct 24, 2024 • 22:00 PM</p>
           </div>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Location</span>
            <span className="text-foreground flex items-center gap-1"><MapPin className="w-3 h-3"/> Neo Tokyo</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Weather</span>
            <span className="text-foreground text-right">18°C • Clear</span>
          </div>
        </div>
      </div>

      {/* Virtual Run Progress */}
      <div className="md:col-span-12 bg-card border border-border rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Activity className="text-tertiary w-5 h-5" />
              Virtual Run Progress
            </h3>
            <p className="text-xs text-muted-foreground">Global Qualifier: Tier 2</p>
          </div>
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest">Total KM</p>
              <p className="text-xl font-bold text-foreground">42.8</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest">Avg Pace</p>
              <p className="text-xl font-bold text-foreground">5'12"</p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-end text-xs">
            <span className="text-foreground font-semibold">Tier 3 Unlock (50km)</span>
            <span className="text-tertiary">85% Complete</span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-tertiary w-[85%] rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
